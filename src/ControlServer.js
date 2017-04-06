const HTTPServer = require('http').Server;
const TorPool = require('./TorPool');
const SOCKSServer = require('./SOCKSServer');
const DNSServer = require('./DNSServer');

class ControlServer {
	constructor(logger) {
		this.server = new HTTPServer();
		this.io = require('socket.io')(this.server);

		this.torPool = new TorPool(null, null, logger);
		this.logger = logger;

		this.io.use(this.handleConnection.bind(this));
	}

	listen() { this.server.listen.apply(this.server, arguments); }
	close() { this.server.close.apply(this.server, arguments); }

	handleConnection(socket, next) {
		socket.on('createTorPool', this.createTorPool.bind(this));
		socket.on('createSOCKSServer', this.createSOCKSServer.bind(this));
		socket.on('createDNSServer', this.createDNSServer.bind(this));

		socket.on('createInstances', (instances, callback) => { this.torPool.create(instances, (error, instances) => {
			callback && callback(error)
		}); });
		socket.on('removeInstances', (instances, callback) => { this.torPool.remove(instances, callback); });
		socket.on('newIps', () => { this.torPool.new_ips(); });
		socket.on('nextInstance', () => { this.torPool.next(); });
		socket.on('closeInstances', () => { this.torPool.exit(); });

		next();
	}

	createTorPool(options) {
		this.torPool = new TorPool(null, options, this.logger);
		return this.torPool;
	}

	createSOCKSServer(port) {
		this.socksServer = new SOCKSServer(this.torPool, this.logger);
		this.socksServer.listen(port || 9050);
		this.logger && this.logger.info(`[socks]: Listening on ${port}`);
		return this.socksServer;
	}

	createDNSServer(port) {
		this.dnsServer = new DNSServer(this.torPool, this.logger);
		this.dnsServer.serve(port || 9053);
		this.logger && this.logger.info(`[dns]: Listening on ${port}`);
		return this.dnsServer;
	}
};

module.exports = ControlServer;
