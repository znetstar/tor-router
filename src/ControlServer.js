const TorPool = require('./TorPool');
const SOCKSServer = require('./SOCKSServer');
const DNSServer = require('./DNSServer');
const HTTPServer = require('./HTTPServer');
const rpc = require('jrpc2');
const async = require('async');

class ControlServer {
	constructor(logger, nconf) {
		this.torPool = new TorPool(nconf.get('torPath'), null, nconf.get('parentDataDirectory'), nconf.get('loadBalanceMethod'), nconf.get('granaxOptions'),logger);
		this.logger = logger;
		this.nconf = nconf;

		let server = this.server = new rpc.Server();
		server.expose('createTorPool', this.createTorPool.bind(this));
		server.expose('createSOCKSServer', this.createSOCKSServer.bind(this));
		server.expose('createDNSServer', this.createDNSServer.bind(this));
		server.expose('createHTTPServer', this.createHTTPServer.bind(this));

		// queryInstanceAt, queryInstanceByName

		server.expose('queryInstances', (function () {
			return new Promise((resolve, reject) => {
				if (!this.torPool)
					return reject({ message: 'No pool created' });

				resolve(this.torPool.instances.map((i) => ( { name: i.instance_name, dns_port: i.dns_port, socks_port: i.socks_port, process_id: i.process.pid, config: i.definition.Config, weight: i.definition.weight } )) );		
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

		server.expose('removeInstanceByName', (function (instance_name) {
			return new Promise((resolve, reject) => {
				this.torPool.remove_by_name(instance_name, (error) => {
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

		server.expose('newIdentityByName', (function(name) {
			return new Promise((resolve, reject) => {
				this.torPool.new_identity_by_name(name, (error) => {
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

		server.expose('getDefaultTorConfig', (function () {
			return Promise.resolve(this.nconf.get('torConfig'));
		}).bind(this));

		server.expose('setDefaultTorConfig', (function (config) {
			this.nconf.set('torConfig', config);
			return Promise.resolve();
		}).bind(this));

		server.expose('setTorConfig', (function (config) {
			return new Promise((resolve, reject) => {
				async.each(Object.keys(config), function (key, next) {
					var value = config[key];

					this.torPool.set_config_all(key, value, next);
				}, function (error){
					if (error) reject(error);
					resolve();
				});
			});
		}).bind(this));

		server.expose('getLoadBalanceMethod', (function () {
			return Promise.resolve(this.torPool.load_balance_method);
		}).bind(this));	

		server.expose('setLoadBalanceMethod', (function (loadBalanceMethod) {
			this.torPool.load_balance_method = loadBalanceMethod;
			return Promise.resolve();
		}).bind(this));	

		server.expose('getInstanceConfigByName', (function (name, keyword) {
			return new Promise((resolve, reject) => {
				this.torPool.get_config_by_name(name, keyword, (error, value) => {
					if (error) reject(error);
					else resolve(value);
				});
			});
		}).bind(this));	

		server.expose('getInstanceConfigAt', (function (index, keyword) {
			return new Promise((resolve, reject) => {
				this.torPool.get_config_at(index, keyword, (error, value) => {
					if (error) reject(error);
					else resolve(value);
				});
			});
		}).bind(this));	

		server.expose('setInstanceConfigByName', (function (name, keyword, value) {
			return new Promise((resolve, reject) => {
				this.torPool.set_config_by_name(name, keyword, value, (error) => {
					if (error) reject(error);
					else resolve();
				});
			});
		}).bind(this));

		server.expose('setInstanceConfigAt', (function (index, keyword, value) {
			return new Promise((resolve, reject) => {
				this.torPool.set_config_at(index, keyword, value, (error) => {
					if (error) reject(error);
					else resolve();
				});
			});
		}).bind(this));


		server.expose('signalAllInstances', (function (signal) {
			return new Promise((resolve, reject) => {
				this.torPool.signal_all(signal, (error) => {
					if (error) reject(error);
					else resolve();
				});
			});
		}).bind(this));

		server.expose('signalInstanceAt', (function (index, signal, callback) {
			return new Promise((resolve, reject) => {
				this.torPool.signal_at(index, signal, (error) => {
					if (error) reject(error);
					else resolve();
				});
			});
		}).bind(this));

		server.expose('signalInstanceByName', (function (name, signal, callback) {
			return new Promise((resolve, reject) => {
				this.torPool.signal_by_name(name, signal, (error) => {
					if (error) reject(error);
					else resolve();
				});
			});
		}).bind(this));
	}

	listen(port, callback) {  
		this.tcpTransport = new rpc.tcpTransport({ port });
		this.tcpTransport.listen(this.server);
		callback && callback();
	}

	close() { 
		return this.tcpTransport.tcpServer.close();
	}

	createTorPool(options) {
		this.torPool = new TorPool(this.nconf.get('torPath'), options, this.nconf.get('parentDataDirectory'), this.nconf.get('loadBalanceMethod'), this.nconf.get('granaxOptions'), this.logger);
		return this.torPool;
	}

	createSOCKSServer(port, callback) {
		this.socksServer = new SOCKSServer(this.torPool, this.logger);
		this.socksServer.listen(port || 9050);
		this.logger.info(`[socks]: Listening on ${port}`);
		this.socksServer;
		callback && callback();
	}

	createHTTPServer(port, callback) {
		this.httpServer = new HTTPServer(this.torPool, this.logger);
		this.httpServer.listen(port || 9080);
		this.logger.info(`[http]: Listening on ${port}`);
		this.httpServer;
		callback && callback();
	}

	createDNSServer(port, callback) {
		this.dnsServer = new DNSServer(this.torPool, this.nconf.get('dns:options'), this.nconf.get('dns:timeout'), this.logger);
		this.dnsServer.serve(port || 9053);
		this.logger.info(`[dns]: Listening on ${port}`);
		this.dnsServer;
		callback && callback();
	}
};

module.exports = ControlServer;
