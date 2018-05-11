const TorPool = require('./TorPool');
const SOCKSServer = require('./SOCKSServer');
const DNSServer = require('./DNSServer');
const HTTPServer = require('./HTTPServer');
const rpc = require('jrpc2');

class ControlServer {
	constructor(logger, nconf) {
		this.torPool = new TorPool(null, null, logger, nconf);
		this.logger = logger;
		this.nconf = nconf;

		let server = this.server = new rpc.Server();
		server.expose('createTorPool', this.createTorPool.bind(this));
		server.expose('createSOCKSServer', this.createSOCKSServer.bind(this));
		server.expose('createDNSServer', this.createDNSServer.bind(this));
		server.expose('createHTTPServer', this.createHTTPServer.bind(this));

		server.expose('queryInstances', (function () {
			return new Promise((resolve, reject) => {
				if (!this.torPool)
					return reject({ message: 'No pool created' });

				resolve(this.torPool.instances.map((i) => ( { dns_port: i.dns_port, socks_port: i.socks_port, process_id: i.process.pid, config: i.definition.Config, weight: i.definition.weight } )) );		
			});
		}).bind(this));

		server.expose('createInstances', (function (instances) {
			return new Promise((resolve, reject) => {
				this.torPool.create(instances, (error, instances) => {
					if (error) reject(error);
					else resolve();
				}); 
			});
		}).bind(this) );

		server.expose('addInstances', (function (instances) {
			return new Promise((resolve, reject) => {
				this.torPool.add(instances, (error, instances) => {
					if (error) reject(error);
					else resolve();
				}); 
			});
		}).bind(this) );

		server.expose('removeInstances', (function (instances) {
			return new Promise((resolve, reject) => {
				this.torPool.remove(instances, (error) => {
					if (error) reject(error);
					else resolve();
				}); 
			});
		}).bind(this) );

		server.expose('removeInstanceAt', (function (instance_index) {
			return new Promise((resolve, reject) => {
				this.torPool.remove_at(instance_index, (error) => {
					if (error) reject(error);
					else resolve();
				}); 
			});
		}).bind(this) );

		server.expose('newIdentites', (function() {
			return new Promise((resolve, reject) => {
				this.torPool.new_identites((error) => {
					if (error) reject(error);
					else resolve();
				});
			});
		}).bind(this));

		server.expose('newIdentityAt', (function(index) {
			return new Promise((resolve, reject) => {
				this.torPool.new_identity_at(index, (error) => {
					if (error) reject(error);
					else resolve();
				});
			});
		}).bind(this));

		/* Begin Deprecated */

		server.expose('newIps', (function() {
			return new Promise((resolve, reject) => {
				this.torPool.new_ips((error) => {
					if (error) reject(error);
					else resolve();
				});
			});
		}).bind(this));

		server.expose('newIpAt', (function(index) {
			return new Promise((resolve, reject) => {
				this.torPool.new_ip_at(index, (error) => {
					if (error) reject(error);
					else resolve();
				});
			});
		}).bind(this));

		/* End Deprecated */

		server.expose('nextInstance', (function () {
			this.torPool.next();
			return Promise.resolve();
		}).bind(this) );

		server.expose('closeInstances', (function ()  {
			this.torPool.exit();
			return Promise.resolve();
		}).bind(this) );

		server.expose('setTorConfig', (function (config) {
			this.nconf.set('torConfig', config);
			return Promise.resolve();
		}).bind(this));

		server.expose('getTorConfig', (function () {
			return Promise.resolve(this.nconf.get('torConfig'));
		}).bind(this));

		server.expose('getLoadBalanceMethod', (function () {
			return Promise.resolve(this.nconf.get('loadBalanceMethod'));
		}).bind(this));	

		server.expose('setLoadBalanceMethod', (function (loadBalanceMethod) {
			this.nconf.set('loadBalanceMethod', loadBalanceMethod);
			return Promise.resolve();
		}).bind(this));	
	}

	listen(port, callback) {  
		this.tcpTransport = new rpc.tcpTransport({ port });
		this.tcpTransport.listen(this.server);
		callback();
	}

	close() { 
		return this.tcpTransport.tcpServer.close();
	}

	createTorPool(options) {
		this.torPool = new TorPool(null, options, this.logger, this.nconf);
		return Promise.resolve();
	}

	createSOCKSServer(port) {
		this.socksServer = new SOCKSServer(this.torPool, this.logger, this.nconf);
		this.socksServer.listen(port || 9050);
		this.logger && this.logger.info(`[socks]: Listening on ${port}`);
		this.socksServer;
		return Promise.resolve();
	}

	createHTTPServer(port) {
		this.httpServer = new HTTPServer(this.torPool, this.logger, this.nconf);
		this.httpServer.listen(port || 9080);
		this.logger && this.logger.info(`[http]: Listening on ${port}`);
		this.httpServer;
		return Promise.resolve();
	}

	createDNSServer(port) {
		this.dnsServer = new DNSServer(this.torPool, this.logger, this.nconf);
		this.dnsServer.serve(port || 9053);
		this.logger && this.logger.info(`[dns]: Listening on ${port}`);
		this.dnsServer;
		return Promise.resolve();
	}
};

module.exports = ControlServer;
