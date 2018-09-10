const socks = require('socksv5');
const Promise = require('bluebird');
const { Server } = socks;

class SOCKSServer extends Server{
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

	constructor(tor_pool, logger, proxy_by_name) {
		let handleConnection = (info, accept, deny) => {
			let inbound_socket = accept(true);
			var outbound_socket;
			let buffer = [];

			let onInboundData = (data) => buffer.push(data)
			
			let onClose = (error) => {
				inbound_socket && inbound_socket.end();
				outbound_socket && outbound_socket.end();

				inbound_socket = outbound_socket = buffer = void(0);

				if (error)
					this.logger.error(`[socks]: an error occured: ${error.message}`)
			};

			if (!inbound_socket) return;

			inbound_socket.on('close', onClose);
			inbound_socket.on('data', onInboundData);	
			inbound_socket.on('error', onClose);

			let connect = (tor_instance) => {
				let socks_port = tor_instance.socks_port;
				this.logger.verbose(`[socks]: ${info.srcAddr}:${info.srcPort} → 127.0.0.1:${socks_port}${tor_instance.definition.Name ? ' ('+tor_instance.definition.Name+')' : '' } → ${info.dstAddr}:${info.dstPort}`)

				socks.connect({
					host: info.dstAddr,
					port: info.dstPort,
					proxyHost: '127.0.0.1',
					proxyPort: socks_port,
					localDNS: false,
					auths: [ socks.auth.None() ]
				}, ($outbound_socket) => {
					outbound_socket = $outbound_socket;
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
				});
			};
			if (tor_pool.instances.length) {
				connect(tor_pool.next());
			} else {
				this.logger.debug(`[socks]: a connection has been attempted, but no tor instances are live... waiting for an instance to come online`);
				tor_pool.once('instance_created', connect);
			}
		};

		super(handleConnection);

		this.logger = logger || require('./winston-silent-logger');;
		if (!proxy_by_name) {
			this.logger.debug(`[socks]: connecting to a specific instance by name has ben turned off`);
			let auth = socks.auth.None();
		} else {
			this.logger.debug(`[socks]: connecting to a specific instance by name has ben turned on`);
			let auth = socks.auth.UserPassword(
				(username, password, cb) => {
					
				}
			);
		}

		this.useAuth(auth);
	}
};

module.exports = SOCKSServer;