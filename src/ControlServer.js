const { Server, WebSocketTransport, TCPTransport, JSONSerializer } = require("multi-rpc");
const Promise = require('bluebird');

const SOCKSServer = require('./SOCKSServer');
const HTTPServer = require('./HTTPServer');
const DNSServer = require('./DNSServer');
const TorPool = require('./TorPool');
const default_ports = require('./default_ports');

/**
 * @typedef ControlServer~InstanceInfo
 * 
 * @property {string} name - Name of the instance.
 * @property {string[]} group - Groups the instance belongs to.
 * @property {number} dns_port - Port Tor is listening on for DNS Traffic.
 * @property {number} socks_port - Port Tor is listening on for SOCKS Traffic.
 * @property {number} process_id - Process ID for the Tor process.
 * @property {Object} config - Configuration (torrc) set when starting the process.
 * @property {number} [weight] - Weight of the instance for weighted load balancing.
 */

/**
 * A server which exposes an RPC interface that can control the application.
 */
class ControlServer {
	/**
	 * 
	 * @param {Provider} nconf - Instance of nconf.Provider that will be used to obtain configuration values.
	 * @param {Logger} [logger] - Winston logger that will be used for logging. If not provided will disable logging.
	 */
	constructor(nconf, logger) {
		/**
		 * Pool of Tor instances
		 * 
		 * @type {TorPool}
		 */
		this.tor_pool = new TorPool(nconf.get('torPath'), (() =>  nconf.get('torConfig')), nconf.get('parentDataDirectory'), nconf.get('loadBalanceMethod'), nconf.get('granaxOptions'), logger);
		/**
		 * Winston Logger for logging
		 * 
		 * @type {Logger}
		 */
		this.logger = logger || require('./winston_silent_logger');
		/**
		 * Nconf Provider for configuration
		 * 
		 * @type {Provider}
		 */
		this.nconf = nconf;

		/**
		 * RPC Server instance
		 * 
		 * @type {Server}
		 */
		let server = this.server = new Server();

		this.serializer = new JSONSerializer();

		this.server.methods.createTorPool = this.createTorPool.bind(this);
		this.server.methods.createSocksServer = this.createSOCKSServer.bind(this);
		this.server.methods.createDNSServer = this.createDNSServer.bind(this);
		this.server.methods.createHTTPServer =  this.createHTTPServer.bind(this);
		
		/**
		 * Returns a list of all instances currently in the pool.
		 */
		this.server.methods.queryInstances = (() => {
			return this.tor_pool.instances.map(ControlServer.instance_info);
		}).bind(this);

		/**
		 * Returns information on an instance identified by the {@link TorProcess#instance_name} field.
		 */
		this.server.methods.queryInstanceByName = ((instance_name) => {
			let instance = this.tor_pool.instance_by_name(instance_name);

			if (!instance)
				throw new Error(`Instance "${instance_name}"" does not exist`);

			return ControlServer.instance_info(instance);	
		}).bind(this);

		/**
		 * Returns information on an instance identified by its index in the pool.
		 */
		this.server.methods.queryInstanceAt = ((index) => {
			if (!this.tor_pool)
				throw new Error('No pool created');

			let instance = this.tor_pool.instance_at(index);

			if (!instance)
				throw new Error(`Instance at "${i}"" does not exist`);

			return ControlServer.instance_info(this.tor_pool.instance_at(index));	
		}).bind(this);

		/**
		 * Returns a list of the names of all of the instances in the pool.
		 */
		this.server.methods.queryInstanceNames = (() => this.tor_pool.instance_names).bind(this);
	
		/**
		 * Returns a list of the names of all of the current groups.
		 */
		this.server.methods.queryGroupNames = (() => Array.from(this.tor_pool.group_names)).bind(this);

		/**
		 * Returns a list of the instances that exist in a given group.
		 */
		this.server.methods.queryInstancesByGroup = ((group) => this.tor_pool.instances_by_group(group).map(ControlServer.instance_info)).bind(this);

		/**
		 * Creates instances from a number, an array of instance definitions or a single instance definition. 
		 * If a number is provided, creates n many instances.
		 */
		this.server.methods.createInstances = (async (instances_to_create) => {
			let instances = await this.tor_pool.create(instances_to_create);

			return instances.map(ControlServer.instance_info);
		}).bind(this);

		/**
		 * Creates instances from an array of instance definitions or a single instance definition.
		 */
		this.server.methods.addInstances = (async (defs) => {
			let instances = await this.tor_pool.add(defs);

			return instances.map(ControlServer.instance_info);
		}).bind(this);

		/**
		 * Removes a number of instances from the pool.
		 */
		this.server.methods.removeInstances = this.tor_pool.remove.bind(this.tor_pool);

		/**
		 * Remove an instance at the index provided from the pool.
		 */
		this.server.methods.removeInstanceAt =  this.tor_pool.remove_at.bind(this.tor_pool);

		/**
		 * Remove an instance from the pool by the {@link TorProcess#instance_name} field.
		 */
		this.server.methods.removeInstanceByName = this.tor_pool.remove_by_name.bind(this.tor_pool);

		/**
		 * Gets new identities for all instances in the pool.
		 */
		this.server.methods.newIdentites = this.tor_pool.new_identites.bind(this.tor_pool);

		/**
		 * Get a new identity for the instance at the index provided in the pool.
		 */
		this.server.methods.newIdentityAt = this.tor_pool.new_identity_at.bind(this.tor_pool);

		/**
		 * Get a new identity for the instance by the {@link TorProcess#instance_name} field.
		 */
		this.server.methods.newIdentityByName =  this.tor_pool.new_identity_by_name.bind(this.tor_pool);

		/**
		 * Gets new identities for all instances in the group.
		 */
		this.server.methods.newIdentitiesByGroup = this.tor_pool.new_identites_by_group.bind(this.tor_pool);

		/**
		 * Gets the next instance in the pool using the load balance method.
		 */
		this.server.methods.nextInstance = (() => ControlServer.instance_info(this.tor_pool.next())).bind(this);

		/**
		 * Gets the next instance in the group using the load balance method.
		 */
		this.server.methods.nextInstanceByGroup =  ((group) => {
			return ControlServer.instance_info(this.tor_pool.next_by_group(group));
		}).bind(this);

		/**
		 * Kills the processes of all instances in the pool.
		 */
		this.server.methods.closeInstances = this.tor_pool.exit.bind(this.tor_pool);

		/**
		 * Sets a property in the application configuration.
		 */
		this.server.methods.setConfig = ((key, value) => {
			this.nconf.set(key, value);
		}).bind(this);	
	
		/**
		 * Gets a property in the application configuration.
		 */
		this.server.methods.getConfig = ((key) => {
			return this.nconf.get(key);
		}).bind(this);

		/**
		 * Saves the application configuration to the underlying store (usually a JSON file).
		 */
		this.server.methods.saveConfig = (async () => {
			await new Promise((resolve, reject) => {
				this.nconf.save((err) => {
					if (err) return reject(err);
					resolve();
				});
			});
		}).bind(this);	

		/**
		 * Loads the application configuration from the underlying store (usually a JSON file).
		 */
		this.server.methods.loadConfig = (async () => {
			await new Promise((resolve, reject) => {
				this.nconf.load((err) => {
					if (err) return reject(err);
					resolve();
				});
			});
		}).bind(this);	

		/**
		 * Sets a configuration property on all instances in the pool.
		 */
		this.server.methods.setTorConfig = (async (config) => {
			await Promise.all(Object.keys(config).map((key) => {
				let value = config[key];

				return this.tor_pool.set_config_all(key, value);
			}));
		}).bind(this);

		/**
		 * Sets a configuration property on all instances in a group.
		 */
		this.server.methods.setTorConfigByGroup = (async (group, config) => {
			await Promise.all(Object.keys(config).map((key) => {
				let value = config[key];

				return this.tor_pool.set_config_by_group(group, key, value);
			}));
		}).bind(this);

		/**
		 * Retrieves the current load balance method for the pool
		 */
		this.server.methods.getLoadBalanceMethod = (() => {
			return this.tor_pool.load_balance_method;
		}).bind(this);	

		/**
		 * Sets the current load balance method for the pool
		 */
		this.server.methods.setLoadBalanceMethod = ((loadBalanceMethod) => {
			this.tor_pool.load_balance_method = loadBalanceMethod;
			this.nconf.set('loadBalanceMethod', loadBalanceMethod);
		}).bind(this);	

		/**
		 * Retrieve a configuration property for an instance identified by the {@link TorProcess#instance_name} field.
		 */
		this.server.methods.getInstanceConfigByName =  this.tor_pool.get_config_by_name.bind(this.tor_pool);	

		/**
		 * Retrieves a configuration property for an instance by its index in the pool.
		 */
		this.server.methods.getInstanceConfigAt = this.tor_pool.get_config_at.bind(this.tor_pool);	

		/**
		 * Sets a configuration property for an instance identified by the {@link TorProcess#instance_name} field.
		 */
		this.server.methods.setInstanceConfigByName = this.tor_pool.set_config_by_name.bind(this.tor_pool);

		/**
		 * Sets a configuration property for an instance identified by its index in the pool.
		 */
		this.server.methods.setInstanceConfigAt = this.tor_pool.set_config_at.bind(this.tor_pool);

		/**
		 * Sends a signal to all instances in the pool
		 */
		this.server.methods.signalAllInstances = this.tor_pool.signal_all.bind(this.tor_pool);
	
		/**
		 * Sends a signal to an instance identified by its index in the pool.
		 */
		this.server.methods.signalInstanceAt = this.tor_pool.signal_at.bind(this.tor_pool);

		/**
		 * Sends a signal to an instance identified by the {@link TorProcess#instance_name} field.
		 */
		this.server.methods.signalInstanceByName = this.tor_pool.signal_by_name.bind(this.tor_pool);

		/**
		 * Sends a singal to all instances in a group.
		 */
		this.server.methods.signalInstancesByGroup = this.tor_pool.signal_by_group.bind(this.tor_pool);

		/**
		 * Adds an instance to a group identified by its {@link TorProcess#instance_name} field.
		 */
		this.server.methods.addInstanceToGroupByName = this.tor_pool.add_instance_to_group_by_name.bind(this.tor_pool);
		
		/**
		 * Adds an instance to a group identified by its index in the pool.
		 */
		this.server.methods.addInstanceToGroupAt = this.tor_pool.add_instance_to_group_at.bind(this.tor_pool);

		/**
		 * Removes an instance from a group identified by its {@link TorProcess#instance_name} field.
		 */
		this.server.methods.removeInstanceFromGroupByName = this.tor_pool.remove_instance_from_group_by_name.bind(this.tor_pool);
		
		/**
		 * Remove an instance from a group identified by its index in the pool.
		 */
		this.server.methods.removeInstanceFromGroupAt = this.tor_pool.remove_instance_from_group_at .bind(this.tor_pool);
	}

	/**
	 * Returns a summary of information on the running instance
	 * @param {TorProcess} instance 
	 * @static
	 * @returns {ControlServer~InstanceInfo}
	 */
	static instance_info(instance) {
		return { 
			name: instance.instance_name, 
			group: instance.instance_group, 
			dns_port: instance.dns_port, 
			socks_port: instance.socks_port, 
			process_id: instance.process.pid, 
			config: instance.definition.Config, 
			weight: instance.definition.weight 
		};
	}

	/**
	 * Binds the server to a host and port and begins listening for TCP traffic
	 * @param {number} port - Port the server should bind to
	 * @param {string} [hostname] - Host the server should bind to
	 * @async
	 * @returns {Promise}
	 */
	async listenTcp(port, hostname) {  
		this.tcpTransport = new TCPTransport(this.serializer, port, hostname);
		this.server.addTransport(this.tcpTransport);
		this.logger.info(`[control]: control server listening on tcp://${hostname}:${port}`);
		await this.tcpTransport.listen();
	}

	/**
	 * Binds the server to a host and port and begins listening for WebSocket traffic
	 * @param {number} port - Port the server should bind to
	 * @param {string} [hostname] - Host the server should bind to
	 * @async
	 * @returns {Promise}
	 */
	async listenWs(port, hostname) {
		this.wsTransport = new WebSocketTransport(this.serializer, port, hostname);
		this.server.addTransport(this.wsTransport);
		this.logger.info(`[control]: control server listening on ws://${hostname}:${port}`);
		await this.wsTransport.listen();
	}

	/**
	 * Calls {@link ControlServer#listenTcp} with the same arguments
	 * @param {number} port - Port the server should bind to
	 * @param {string} [hostname] - Host the server should bind to
	 * @async
	 * @returns {Promise}
	 */
	async listen(port, hostname) { return await this.listenTcp(port, hostname); }

	/**
	 * Closes the TCP and/or WebSocket servers
	 */
	close() { 
		this.server.close();
	}

	/**
	 * Creates a new {@link TorPool} instance
	 * @param {Object} [tor_config] - Default Tor config to be used for the pool of instances.
	 * @param {string} [load_balance_method] - Load balance method to be used for the pool. Will default to the global configuration if not provided.
	 * 
	 * @returns {TorPool} - The {@link TorPool} that was created.
	 */
	createTorPool(tor_config, load_balance_method) {
		this.tor_pool = new TorPool(this.nconf.get('torPath'), tor_config, this.nconf.get('parentDataDirectory'), (load_balance_method || this.nconf.get('loadBalanceMethod')), this.nconf.get('granaxOptions'), this.logger);
		return this.tor_pool;
	}

	/**
	 * Creates an instance of {@link SOCKSServer} and begins listening for traffic
	 * @param {number} port - Port the server should bind to
	 * @param {string} [hostname] - Host the server should bind to
	 * @async
	 * @returns {Promise}
	 */
	async createSOCKSServer(port, hostname) {
		this.socksServer = new SOCKSServer(this.tor_pool, this.logger, (this.nconf.get('proxyByName') ? { mode: this.nconf.get('proxyByName'), deny_unidentified_users: this.nconf.get('denyUnidentifiedUsers') } : ""));
		await this.socksServer.listen(port || default_ports.socks, hostname);
		this.logger.info(`[socks]: listening on socks5://${hostname}:${port}`);
	}

	/**
	 * Creates an instance of {@link HTTPServer} and begins listening for traffic
	 * @param {number} port - Port the server should bind to
	 * @param {string} [hostname] - Host the server should bind to
	 * @async
	 * @returns {Promise}
	 */
	async createHTTPServer(port, hostname) {
		this.httpServer = new HTTPServer(this.tor_pool, this.logger, (this.nconf.get('proxyByName') ? { mode: this.nconf.get('proxyByName'), deny_unidentified_users: this.nconf.get('denyUnidentifiedUsers') } : ""));
		await this.httpServer.listen(port || default_ports.http, hostname);
		this.logger.info(`[http]: listening on http://${hostname}:${port}`);
	}

	/**
	 * Creates an instance of {@link DNSServer} and begins listening for traffic
	 * @param {number} port - Port the server should bind to
	 * @param {string} [hostname] - Host the server should bind to
	 * @async
	 * @returns {Promise}
	 */
	async createDNSServer(port, hostname) {
		this.dnsServer = new DNSServer(this.tor_pool, this.nconf.get('dns:options'), this.nconf.get('dns:timeout'), this.logger);
		await this.dnsServer.serve(port || default_ports.dns, hostname);
		this.logger.info(`[dns]: listening on dns://${hostname}:${port}`);
	}
};

/**
 * Module that contains the {@link ControlServer} class.
 * @module tor-router/ControlServer
 * @see ControlServer
 */
module.exports = ControlServer;
