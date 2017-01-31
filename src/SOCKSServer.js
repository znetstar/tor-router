const socks = require('socksv5');
const SOCKS5Server = socks.Server;

class SOCKSServer extends SOCKS5Server{
	constructor(tor_pool, logger) {
		super((info, accept, deny) => {
			let inbound_socket = accept(true);
			var outbound_socket;
			let buffer = [];

			let socks_port = (tor_pool.next().socks_port);
			logger && logger.info(`[socks]: ${info.srcAddr}:${info.srcPort} → 127.0.0.1:${socks_port} → ${info.dstAddr}:${info.dstPort}`)

			let onClose = () => {
				inbound_socket && inbound_socket.end();
				outbound_socket && outbound_socket.end();

				inbound_socket = outbound_socket = buffer = void(0);
			};

			let onInboundData = (data) => buffer.push(data)
			
			if (!inbound_socket) return;

			inbound_socket.on('close', onClose);
			inbound_socket.on('data', onInboundData);	
			inbound_socket.on('error', onClose);

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
			})
		});

		this.logger = logger;

		this.useAuth(socks.auth.None());
	}
};

module.exports = SOCKSServer;