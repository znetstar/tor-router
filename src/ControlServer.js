const TorPool = require('./TorPool');
const SOCKSServer = require('./SOCKSServer');
const DNSServer = require('./DNSServer');
const HTTPServer = require('./HTTPServer');
const rpc = require('jrpc2');

class ControlServer {
	constructor(logger, nconf) {
		this.torPool = new TorPool(nconf.get('torPath'), null, nconf.get('parentDataDirectory'), nconf.get('loadBalanceMethod'), nconf.get('granaxOptions'),logger);
		this.logger = logger || require('./winston-silent-logger');
		this.nconf = nconf;

		let server = this.server = new rpc.Server();
		server.expose('createTorPool', this.createTorPool.bind(this));
		server.expose('createSOCKSServer', this.createSOCKSServer.bind(this));
		server.expose('createDNSServer', this.createDNSServer.bind(this));
		server.expose('createHTTPServer', this.createHTTPServer.bind(this));

		const instance_info = (i) => {
			return { name: i.instance_name, dns_port: i.dns_port, socks_port: i.socks_port, process_id: i.process.pid, config: i.definition.Config, weight: i.definition.weight };
		};

		server.expose('queryInstances', (async () => {
			if (!this.torPool)
				throw new Error('No instances created');
			
			this.torPool.instances.map(instance_info);
		}).bind(this));

		server.expose('queryInstanceByName', (async (instance_name) => {
			if (!this.torPool)
				throw new Error('No pool created');

			let instance = this.torPool.instance_by_name(instance_name);

			if (!instance)
				throw new Error(`Instance "${instance_name}"" does not exist`);

			return instance_info(i)	
		}).bind(this));

		server.expose('queryInstanceAt', (async (index) => {
			if (!this.torPool)
				throw new Error('No pool created');

			let instance = this.torPool.instance_at(index);

			if (!instance)
				throw new Error(`Instance at "${i}"" does not exist`);

			return instance_info(this.torPool.instance_at(index));	
		}).bind(this));

		server.expose('createInstances', this.torPool.create.bind(this.torPool));
		
		server.expose('addInstances', this.torPool.add.bind(this.torPool));

		server.expose('removeInstances', this.torPool.remove.bind(this.torPool));

		server.expose('removeInstanceAt', this.torPool.remove_at.bind(this.torPool));

		server.expose('removeInstanceByName', this.torPool.remove_by_name.bind(this.torPool));

		server.expose('newIdentites', this.torPool.new_identites.bind(this.torPool));

		server.expose('newIdentityAt', this.torPool.new_identity_at.bind(this.torPool));

		server.expose('newIdentityByName', this.torPool.new_identity_by_name.bind(this.torPool));

		server.expose('nextInstance', (async () => this.torPool.next()).bind(this));

		server.expose('closeInstances', (async () => this.torPool.exit()).bind(this));
		
		server.expose('getDefaultTorConfig', (async () => {
			return this.nconf.get('torConfig');
		}).bind(this));

		server.expose('setDefaultTorConfig', (async (config) => {
			this.nconf.set('torConfig', config);
		}).bind(this));

		server.expose('setTorConfig', (async (config) => {
			await Promise.all(Object.keys(config).map((key) => {
				var value = config[key];

				return this.torPool.set_config_all(key, value);
			}));
		}).bind(this));

		server.expose('getLoadBalanceMethod', (async () => {
			return this.torPool.load_balance_method;
		}).bind(this));	

		server.expose('setLoadBalanceMethod', (async (loadBalanceMethod) => {
			this.torPool.load_balance_method = loadBalanceMethod;
		}).bind(this));	

		server.expose('getInstanceConfigByName', this.torPool.get_config_by_name.bind(this.torPool));	

		server.expose('getInstanceConfigAt', this.torPool.get_config_at.bind(this.torPool));	

		server.expose('setInstanceConfigByName', this.torPool.set_config_by_name.bind(this.torPool));

		server.expose('setInstanceConfigAt', this.torPool.set_config_at.bind(this.torPool));

		server.expose('signalAllInstances', this.torPool.signal_all.bind(this.torPool));

		server.expose('signalInstanceAt', this.torPool.signal_at.bind(this.torPool));

		server.expose('signalInstanceByName', this.torPool.signal_by_name.bind(this.torPool));
	}

	listen(port) {  
		this.tcpTransport = new rpc.tcpTransport({ port });
		this.tcpTransport.listen(this.server);
	}

	close() { 
		return this.tcpTransport.tcpServer.close();
	}

	createTorPool(options) {
		this.torPool = new TorPool(this.nconf.get('torPath'), options, this.nconf.get('parentDataDirectory'), this.nconf.get('loadBalanceMethod'), this.nconf.get('granaxOptions'), this.logger);
		return this.torPool;
	}

	createSOCKSServer(port) {
		this.socksServer = new SOCKSServer(this.torPool, this.logger);
		this.socksServer.listen(port || 9050);
		this.logger.info(`[socks]: Listening on ${port}`);
		this.socksServer;
	}

	createHTTPServer(port) {
		this.httpServer = new HTTPServer(this.torPool, this.logger);
		this.httpServer.listen(port || 9080);
		this.logger.info(`[http]: Listening on ${port}`);
		this.httpServer;
	}

	createDNSServer(port) {
		this.dnsServer = new DNSServer(this.torPool, this.nconf.get('dns:options'), this.nconf.get('dns:timeout'), this.logger);
		this.dnsServer.serve(port || 9053);
		this.logger.info(`[dns]: Listening on ${port}`);
		this.dnsServer;
	}
};

module.exports = ControlServer;
