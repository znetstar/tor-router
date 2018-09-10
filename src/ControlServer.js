const rpc = require('jrpc2');

const SOCKSServer = require('./SOCKSServer');
const HTTPServer = require('./HTTPServer');
const DNSServer = require('./DNSServer');
const TorPool = require('./TorPool');
const default_ports = require('./default_ports');

class ControlServer {
	constructor(logger, nconf) {
		this.torPool = new TorPool(nconf.get('torPath'), (() =>  nconf.get('torConfig')), nconf.get('parentDataDirectory'), nconf.get('loadBalanceMethod'), nconf.get('granaxOptions'), logger);
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
				throw new Error('No Tor Pool created');
			
			return this.torPool.instances.map(instance_info);
		}).bind(this));

		server.expose('queryInstanceByName', (async (instance_name) => {
			if (!this.torPool)
				throw new Error('No pool created');

			let instance = this.torPool.instance_by_name(instance_name);

			if (!instance)
				throw new Error(`Instance "${instance_name}"" does not exist`);

			return instance_info(instance);	
		}).bind(this));

		server.expose('queryInstanceAt', (async (index) => {
			if (!this.torPool)
				throw new Error('No pool created');

			let instance = this.torPool.instance_at(index);

			if (!instance)
				throw new Error(`Instance at "${i}"" does not exist`);

			return instance_info(this.torPool.instance_at(index));	
		}).bind(this));

		server.expose('createInstances', (async (num) => {
			let instances = await this.torPool.create(num);

			return instances.map(instance_info);
		}).bind(this));

		server.expose('addInstances', (async (defs) => {
			let instances = await this.torPool.create(defs);

			return instances.map(instance_info);
		}).bind(this));

		server.expose('removeInstances', this.torPool.remove.bind(this.torPool));

		server.expose('removeInstanceAt', this.torPool.remove_at.bind(this.torPool));

		server.expose('removeInstanceByName', this.torPool.remove_by_name.bind(this.torPool));

		server.expose('newIdentites', this.torPool.new_identites.bind(this.torPool));

		server.expose('newIdentityAt', this.torPool.new_identity_at.bind(this.torPool));

		server.expose('newIdentityByName', this.torPool.new_identity_by_name.bind(this.torPool));

		server.expose('nextInstance', (async () => instance_info( await this.torPool.next() )).bind(this));

		server.expose('closeInstances', (async () => this.torPool.exit()).bind(this));
		
		server.expose('getDefaultTorConfig', (async () => {
			return this.nconf.get('torConfig');
		}).bind(this));

		server.expose('setDefaultTorConfig', (async (config) => {
			this.nconf.set('torConfig', config);
		}).bind(this));

		server.expose('setTorConfig', (async (config) => {
			await Promise.all(Object.keys(config).map((key) => {
				let value = config[key];

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

	async listenTcp(port, hostname) {  
		this.tcpTransport = new rpc.tcpTransport({ port, hostname });
		this.tcpTransport.listen(this.server);
        this.logger.info(`[control]: control server listening on tcp://${hostname}:${port}`);
	}

	async listenWs(port, hostname) {
		this.wsTransport = new rpc.wsTransport({ port, hostname });
		this.wsTransport.listen(this.server);
		this.logger.info(`[control]: control server listening on ws://${hostname}:${port}`);
	}

	async listen(port) { return await this.listenTcp(port); }

	close() { 
		return this.tcpTransport.tcpServer.close();
	}

	createTorPool(options) {
		this.torPool = new TorPool(this.nconf.get('torPath'), options, this.nconf.get('parentDataDirectory'), this.nconf.get('loadBalanceMethod'), this.nconf.get('granaxOptions'), this.logger);
		return this.torPool;
	}

	async createSOCKSServer(port, hostname) {
		this.socksServer = new SOCKSServer(this.torPool, this.logger);
		await this.socksServer.listen(port || default_ports.socks, hostname);
		this.logger.info(`[socks]: listening on socks5://${hostname}:${port}`);
		this.socksServer;
	}

	async createHTTPServer(port, hostname) {
		this.httpServer = new HTTPServer(this.torPool, this.logger);
		await this.httpServer.listen(port || default_ports.http, hostname);
		this.logger.info(`[http]: listening on http://${hostname}:${port}`);
		this.httpServer;
	}

	async createDNSServer(port, hostname) {
		this.dnsServer = new DNSServer(this.torPool, this.nconf.get('dns:options'), this.nconf.get('dns:timeout'), this.logger);
		await this.dnsServer.serve(port || default_ports.dns, hostname);
		this.logger.info(`[dns]: listening on dns://${hostname}:${port}`);
		this.dnsServer;
	}
};

module.exports = ControlServer;
