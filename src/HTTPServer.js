const http = require('http');
const URL = require('url');
const { Server } = http;

const Promise = require('bluebird');
const socks = require('socksv5');

/** 
 * Value of the "Proxy-Agent" header that will be sent with each http-connect (https) request
 * @constant 
 * @type {string}
 * @default
*/
const TOR_ROUTER_PROXY_AGENT = 'tor-router';

/** 
 * What will show up when an unauthenticated user attempts to connect when an invalid username
 * @constant
 *  @type {string}
 *  @default
*/
const REALM = 'Name of instance to route to';

/**
 * A HTTP(S) proxy server that will route requests to instances in the TorPool provided.
 * @extends Server
 */
class HTTPServer extends Server {
	/**
	 * Binds the server to a port and IP Address.
	 * 
	 * @async
	 * @param {number} port - The port to bind to
	 * @param {string} [host="::"] - Address to bind to. Will default to :: or 0.0.0.0 if not specified.
	 * @returns {Promise}
	 * 
	*/
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

	/**
	 * Handles username authentication for HTTP requests
	 * @param {ClientRequest} req - Incoming HTTP request
	 * @param {ClientResponse} res - Outgoing HTTP response
	 * @private
	 */
	authenticate_user_http(req, res) {
		return this.authenticate_user(req, () => {
			res.writeHead(407, { 'Proxy-Authenticate': `Basic realm="${REALM}"` });
			res.end();
			return false;
		})
	}

	/**
	 * Handles username authentication for HTTP-Connect requests
	 * @param {ClientRequest} req - Incoming HTTP request
	 * @param {Socket} socket - Inbound HTTP-Connect socket
	 * @private
	 */
	authenticate_user_connect(req, socket) {
		return this.authenticate_user(req, () => {
			socket.write(`HTTP/1.1 407 Proxy Authentication Required\r\n'+'Proxy-Authenticate: Basic realm="${REALM}"\r\n` +'\r\n');
			socket.end();
			return false;
		})
	}

	/**
	 * Checks the username provided against all groups (for "group" mode) or all instances (for "individual" mode).
	 * @param {ClientRequest} req - Incoming HTTP request
	 * @param {Function} deny - Function that when called will deny the connection to the proxy server and prompt the user for credentials (HTTP 407).
	 * @private
	 * @throws If the {@link HTTPServer#proxy_by_name} mode is invalid
	 */
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
		if ( !buf && deny_un ) return deny();
		else if (!buf) return true;

		let username = buf.split(/:/).shift();
		if ( !username && deny_un ) return deny();
		else if (!username) return true;

		let instance;

		if (this.proxy_by_name.mode === 'individual')
			instance = this.tor_pool.instance_by_name(username);
		else if (this.proxy_by_name.mode === 'group') {
			if (!this.tor_pool.group_names.has(username)) return deny();

			instance = this.tor_pool.next_by_group(username);
		}
		else
			throw Error(`Unknown "proxy_by_name" mode ${this.proxy_by_name.mode}`);
		
		if (!instance) return deny();
		req.instance = instance;

		return true;
	}

	/**
	 * Creates an instance of `HTTPServer`.
	 * @param {TorPool} tor_pool - The pool of instances that will be used for requests.
	 * @param {Logger} [logger] - Winston logger that will be used for logging. If not specified will disable logging.
	 * @param {ProxyByNameConfig} [proxy_by_name] - Enable routing to specific instances or groups of instances using the username field (http://instance-1:@my-server:9050) when connecting.  
	 */
	constructor(tor_pool, logger, proxy_by_name) {
		/**
		 * Handles incoming HTTP Connections.
		 * @function handle_http_connections
		 * @param {ClientRequest} - Incoming HTTP request.
		 * @param {ClientResponse} - Outgoing HTTP response. 
		 * @private
		 */
		const handle_http_connections = (req, res) => {
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
				let source = { hostname: req.connection.remoteAddress, port: req.connection.remotePort, proto: 'http', by_name: Boolean(instance) };
				let socks_port = tor_instance.socks_port;
				
				let proxy_req = http.request({
					method: req.method,
					hostname: url.hostname, 
					port: url.port,
					path: url.path,
					headers: req.headers,
					agent: socks.HttpAgent({
						proxyHost: '127.0.0.1',
						proxyPort: socks_port,
						auths: [ socks.auth.None() ],
						localDNS: false
					})
				}, (proxy_res) => {
					/**
					 * Fires when the proxy has made a connection through an instance using HTTP or HTTP-Connect.
					 * 
					 * @event HTTPServer#instance-connection
					 * @param {TorProcess} instance - Instance that has been connected to.
					 * @param {InstanceConnectionSource} source - Details on the source of the connection.
					 */
					this.emit('instance_connection', tor_instance, source);
					this.logger.verbose(`[http-proxy]: ${source.hostname}:${source.port} → 127.0.0.1:${socks_port}${tor_instance.definition.Name ? ' ('+tor_instance.definition.Name+')' : '' } → ${url.hostname}:${url.port}`);
					
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
					this.logger.debug(`[http-proxy]: a connection has been attempted to "${instance.instance_name}", but it is not live... waiting for the instance to come online`);
					instance.once('ready', (() => connect(instance)));
				}
			}
			else if (this.tor_pool.instances.length) {
				connect(tor_pool.next());
			} else {
				this.logger.debug(`[http-proxy]: a connection has been attempted, but no tor instances are live... waiting for an instance to come online`);
				tor_pool.once('instance_created', connect);
			}
		}

		/**
		 * Handles incoming HTTP-Connect connections.
		 * @function handle_connect_connections
		 * @param {ClientRequest} req - Incoming HTTP Request.
		 * @param {Socket} inbound_socket - Incoming socket.
		 * @param {Buffer|string} head - HTTP Request head.
		 * @private
		 */
		const handle_connect_connections = (req, inbound_socket, head) => {
			if (!this.authenticate_user_connect(req, inbound_socket))
				return;
			
			let { instance } = req;

			let hostname = req.url.split(':').shift();
			let port = Number(req.url.split(':').pop());

			let connect = (tor_instance) => {
				let source = { hostname: req.connection.remoteAddress, port: req.connection.remotePort, proto: 'http-connect', by_name: Boolean(instance) };

				let socks_port = tor_instance.socks_port;
				var outbound_socket;

				let onClose = (error) => {
					inbound_socket && inbound_socket.end();
					outbound_socket && outbound_socket.end();

					inbound_socket = outbound_socket = void(0);

					if (error instanceof Error)
						this.logger.error(`[http-connect]: an error occured: ${error.message}`)
				};

				inbound_socket.on('error', onClose);
				inbound_socket.on('close', onClose);

				socks.connect({
					host: hostname,
					port: port,
					proxyHost: '127.0.0.1',
					proxyPort: socks_port,
					localDNS: false,
					auths: [ socks.auth.None() ]
				}, ($outbound_socket) => {
					this.emit('instance_connection', tor_instance, source);
					this.logger && this.logger.verbose(`[http-connect]: ${source.hostname}:${source.port} → 127.0.0.1:${socks_port}${tor_instance.definition.Name ? ' ('+tor_instance.definition.Name+')' : '' } → ${hostname}:${port}`)
				
					outbound_socket = $outbound_socket;
					outbound_socket.on('close', onClose);
					outbound_socket.on('error', onClose);

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
					this.logger.debug(`[http-connect]: a connection has been attempted to "${instance.instance_name}", but it is not live... waiting for the instance to come online`);
					instance.once('ready', (() => connect(instance)));
				}
			}
			else if (this.tor_pool.instances.length) {
				connect(this.tor_pool.next());
			} else {
				this.logger.debug(`[http-connect]: a connection has been attempted, but no tor instances are live... waiting for an instance to come online`);
				this.tor_pool.once('instance_created', connect);
			}
		}
		super(handle_http_connections);
		this.on('connect', handle_connect_connections);
		
		/**
		 * Winston logger.
		 * @type {Logger}
		 * @public
		 */
		this.logger = logger || require('./winston_silent_logger');
		/**
		 * The pool of instances that will be used for requests.
		 * @type {TorPool}
		 * @public
		 */
		this.tor_pool = tor_pool;
		/**
		 * Configuration for "proxy by name" feature.
		 * @type {ProxyByNameConfig}
		 * @public
		 */
		this.proxy_by_name = proxy_by_name;
	}
};

/**
 * Module that contains the {@link HTTPServer} class.
 * @module tor-router/HTTPServer
 * @see HTTPServer
 */
module.exports = HTTPServer;