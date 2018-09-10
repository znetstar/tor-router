const http = require('http');
const URL = require('url');
const { Server } = http;

const Promise = require('bluebird');
const socks = require('socksv5');
const ProxyAgent = require('proxy-agent');

const TOR_ROUTER_PROXY_AGENT = 'tor-router';

class HTTPServer extends Server {
	async listen() {
		return await new Promise((resolve, reject) => {
			let args = Array.from(arguments);
			let inner_func = super.listen;
			args.push(() => {
				let args = Array.from(arguments);
				resolve.apply(args);
			});
			inner_func.apply(this, args);
		});
	}

	authenticate_user_http(req, res) {
		return this.authenticate_user(req, () => {
			res.writeHead(407, { 'Proxy-Authenticate': `Basic realm="Name of instance to route to"` });
			res.end();
			return false;
		})
	}

	authenticate_user_connect(req, socket) {
		return this.authenticate_user(req, () => {
			socket.end();
			return false;
		})
	}

	authenticate_user(req, deny) {
		if (!this.proxy_by_name)
			return true;
		
		let deny_un = this.proxy_by_name.deny_unidentified_users;
		
		let header = req.headers['authorization'] || req.headers['proxy-authorization'];
		if (!header && deny_un) return deny();
		else if (!header) return true;

		let token = header.split(/\s+/).pop();
		if (!token && deny_un) return deny();
		else if (!token) return true;

		let buf = new Buffer.from(token, 'base64').toString();
		let username = buf.split(/:/).shift();
		if ( !username && deny_un ) return deny();
		else if (!username) return true;

		this.logger.verbose(`[http]: connected attempted to instance "${username}"`);

		let instance = this.tor_pool.instance_by_name(username);
		
		if (!instance) return deny();
		req.instance = instance;

		return true;
	}

	constructor(tor_pool, logger, proxy_by_name) {
		let handle_http_connections = (req, res) => {
			if (!this.authenticate_user_http(req, res))
				return;
			
			let { instance } = req;
			
			let url = URL.parse(req.url); 
			url.port = url.port || 80;

			let buffer = [];

			function onIncomingData(chunk) {
				buffer.push(chunk);
			}

			function preConnectClosed() {
				req.finished = true;
			}

			req.on('data', onIncomingData);
			req.on('end', preConnectClosed);
			req.on('error', function (err) {
				this.logger.error("[http-proxy]: an error occured: "+err.message);
			});

			let connect = (tor_instance) => {
				let socks_port = tor_instance.socks_port;
				this.logger.verbose(`[http-proxy]: ${req.connection.remoteAddress}:${req.connection.remotePort} → 127.0.0.1:${socks_port} → ${url.hostname}:${url.port}`);

				let proxy_req = http.request({
					method: req.method,
					hostname: url.hostname, 
					port: url.port,
					path: url.path,
					headers: req.headers,
					agent: new ProxyAgent(`socks://127.0.0.1:${socks_port}`)
				}, (proxy_res) => {
					proxy_res.on('data', (chunk) => {
						res.write(chunk);
					});

					proxy_res.on('end', () => {
						res.end();
					});

					res.writeHead(proxy_res.statusCode, proxy_res.headers);
				});

				req.removeListener('data', onIncomingData);

				req.on('data', (chunk) => {
					proxy_req.write(chunk);
				})

				req.on('end', () => {
					proxy_req.end();
				})

				while (buffer.length) {
					proxy_req.write(buffer.shift());
				}

				if (req.finished) 
					proxy_req.end();

			};
			
			if (instance) {
				if (instance.ready) {
					connect(instance);
				}
				else {
					this.logger.debug(`[socks]: a connection has been attempted to "${instance.instance_name}", but it is not live... waiting for the instance to come online`);
					instance.once('ready', (() => connect(instance)));
				}
			}
			else if (this.tor_pool.instances.length) {
				connect(tor_pool.next());
			} else {
				this.logger.debug(`[http-proxy]: a connection has been attempted, but no tor instances are live... waiting for an instance to come online`);
				tor_pool.once('instance_created', connect);
			}
		};

		let handle_connect_connections = (req, inbound_socket, head) => {
			if (!this.authenticate_user_connect(req, inbound_socket))
				return;
			
			let { instance } = req;

			let hostname = req.url.split(':').shift();
			let port = Number(req.url.split(':').pop());

			let connect = (tor_instance) => {
				let socks_port = tor_instance.socks_port;
				this.logger && this.logger.verbose(`[http-connect]: ${req.connection.remoteAddress}:${req.connection.remotePort} → 127.0.0.1:${socks_port}${tor_instance.definition.Name ? ' ('+tor_instance.definition.Name+')' : '' } → ${hostname}:${port}`)
				var outbound_socket;

				let onClose = (error) => {
					inbound_socket && inbound_socket.end();
					outbound_socket && outbound_socket.end();

					inbound_socket = outbound_socket = buffer = void(0);

					if (error)
						this.logger.error(`[http-connect]: an error occured: ${error.message}`)
				};

				var buffer = [head];
				let onInboundData = function (data) {
					buffer.push(data);
				};

				socks.connect({
					host: hostname,
					port: port,
					proxyHost: '127.0.0.1',
					proxyPort: socks_port,
					localDNS: false,
					auths: [ socks.auth.None() ]
				}, ($outbound_socket) => {
					outbound_socket = $outbound_socket;
					outbound_socket && outbound_socket.on('close', onClose);
					outbound_socket && outbound_socket.on('error', onClose);

					inbound_socket.write(`HTTP/1.1 200 Connection Established\r\n'+'Proxy-agent: ${TOR_ROUTER_PROXY_AGENT}\r\n` +'\r\n');
					outbound_socket.write(head);

					outbound_socket.pipe(inbound_socket);
					inbound_socket.pipe(outbound_socket);
				});
			};

			if (instance) {
				if (instance.ready) {
					connect(instance);
				}
				else {
					this.logger.debug(`[socks]: a connection has been attempted to "${instance.instance_name}", but it is not live... waiting for the instance to come online`);
					instance.once('ready', (() => connect(instance)));
				}
			}
			else if (this.tor_pool.instances.length) {
				connect(this.tor_pool.next());
			} else {
				this.logger.debug(`[http-connect]: a connection has been attempted, but no tor instances are live... waiting for an instance to come online`);
				this.tor_pool.once('instance_created', connect);
			}
		};

		super(handle_http_connections);
		this.on('connect', handle_connect_connections);
		
		this.logger = logger || require('./winston-silent-logger');
		this.tor_pool = tor_pool;
		this.proxy_by_name = proxy_by_name;
	}
};

module.exports = HTTPServer;