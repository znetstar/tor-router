const http = require('http');
const Server = http.Server;
const domain = require('domain');
const socks = require('socksv5');
const URL = require('url');
const SocksProxyAgent = require('socks-proxy-agent');

class HTTPServer extends Server {
	constructor(tor_pool, logger) {
		let handle_http_connections = (req, res) => {
			let d = domain.create();

			d.add(req);
			d.add(res);

			let url = URL.parse(req.url); 
			url.port = url.port || 80;

			var buffer = [];

			function onIncomingData(chunk) {
				buffer.push(chunk);
			}

			function preConnectClosed() {
				req.finished = true;
			}

			req.on('data', onIncomingData);
			req.on('end', preConnectClosed);
			

			let connect = (tor_instance) => {
				let socks_port = tor_instance.socks_port;
				logger && logger.info(`[http]: ${req.connection.remoteAddress}:${req.connection.remotePort} → 127.0.0.1:${socks_port} → ${url.hostname}:${url.port}`);

				d.run(() => {
					let proxy_req = http.request({
						method: req.method,
						hostname: url.hostname, 
						port: url.port,
						path: url.path,
						headers: req.headers,
						agent: new SocksProxyAgent(`socks://127.0.0.1:${socks_port}`)
					}, (proxy_res) => {
						d.add(proxy_res);
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

					d.add(proxy_req);
				});
			};
			if (tor_pool.instances.length) {
				connect(tor_pool.next());
			} else {
				logger.debug(`[http]: a connection has been attempted, but no tor instances are live... waiting for an instance to come online`);
				tor_pool.once('instance_created', connect);
			}
		};

		let handle_tcp_connections = (req, inbound_socket, head) => {
			let d = domain.create();

			d.add(socket);

			let url = URL.parse(req.url);
			let hostname = url.host.split(':').shift();
			let port = url.host.split(':').pop();

			let connect = (tor_instance) => {
				let socks_port = tor_instance.socks_port;
				logger && logger.info(`[http]: ${req.connection.remoteAddress}:${req.connection.remotePort} → 127.0.0.1:${socks_port} → ${hostname}:${port}`)

				d.on('error', onClose);

				d.add(inbound_socket);

				var buffer = [];
				let onInboundData = function (data) {
					buffer.push(data);
				};

				let onClose = (error) => {
					inbound_socket && inbound_socket.end();
					outbound_socket && outbound_socket.end();

					inbound_socket = outbound_socket = buffer = void(0);

					if (error)
						this.logger.error(`[http]: an error occured: ${error.message}`)

					d.exit();
				};

				d.run(() => {
					socks.connect({
						host: hostname,
						port: port,
						proxyHost: '127.0.0.1',
						proxyPort: socks_port,
						localDNS: false,
						auths: [ socks.auth.None() ]
					}, ($outbound_socket) => {
						outbound_socket = $outbound_socket;
						d.add(outbound_socket);
						outbound_socket && outbound_socket.on('close', onClose);

						inbound_socket && inbound_socket.removeListener('data', onInboundData);
						inbound_socket &&  inbound_socket.on('data', (data) => {
							outbound_socket && outbound_socket.write(data);
						});

						outbound_socket && outbound_socket.on('data', (data) => {
							inbound_socket && inbound_socket.write(data);
						});

						outbound_socket && outbound_socket.on('error', onClose);

						while (buffer && buffer.length && outbound_socket) {
							outbound_socket.write(buffer.shift());
						}
					})
				});
			};
			if (tor_pool.instances.length) {
				connect(tor_pool.next());
			} else {
				logger.debug(`[http]: a connection has been attempted, but no tor instances are live... waiting for an instance to come online`);
				tor_pool.once('instance_created', connect);
			}
		};

		super(handle_http_connections);
		this.on('connect', handle_tcp_connections);

		this.logger = logger;
		this.tor_pool = tor_pool;
	}
};

module.exports = HTTPServer;