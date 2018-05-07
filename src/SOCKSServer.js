const socks = require('socksv5');
const SOCKS5Server = socks.Server;
const domain = require('domain');

class SOCKSServer extends SOCKS5Server{
	constructor(tor_pool, logger) {
		let handleConnection = (info, accept, deny) => {
			let d = domain.create();

			let inbound_socket = accept(true);
			d.add(inbound_socket);
			var outbound_socket;
			let buffer = [];

			let onInboundData = (data) => buffer.push(data)
			
			let onClose = (error) => {
				inbound_socket && inbound_socket.end();
				outbound_socket && outbound_socket.end();

				inbound_socket = outbound_socket = buffer = void(0);

				if (error)
					this.logger.error(`[socks]: an error occured: ${error.message}`)

				d.exit();
			};

			if (!inbound_socket) return;

			inbound_socket.on('close', onClose);
			inbound_socket.on('data', onInboundData);	
			inbound_socket.on('error', onClose);

			let connect = (tor_instance) => {
				let socks_port = tor_instance.socks_port;
				logger && logger.verbose(`[socks]: ${info.srcAddr}:${info.srcPort} → 127.0.0.1:${socks_port} → ${info.dstAddr}:${info.dstPort}`)

				d.on('error', onClose);

				d.run(() => {
					socks.connect({
						host: info.dstAddr,
						port: info.dstPort,
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
				logger.debug(`[socks]: a connection has been attempted, but no tor instances are live... waiting for an instance to come online`);
				tor_pool.once('instance_created', connect);
			}
		};

		super(handleConnection);

		this.logger = logger;

		this.useAuth(socks.auth.None());
	}
};

module.exports = SOCKSServer;