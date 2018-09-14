const rpc = require('jrpc2');
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
		 * @type {rpc.Server}
		 */
		let server = this.server = new rpc.Server();

		/**
		 * @borrows ControlServer#createTorPool as ControlServer~createTorPool
		 * @function ControlServer~createTorPool
		 */
		server.expose('createTorPool', this.createTorPool.bind(this));
		/**
		 * @borrows ControlServer#createSOCKSServer as ControlServer~createSOCKSServer
		 * @function ControlServer~createSOCKSServer
		 */
		server.expose('createSOCKSServer', this.createSOCKSServer.bind(this));
		/**
		 * @borrows ControlServer#createDNSServer as ControlServer~createDNSServer
		 * @function ControlServer~createDNSServer
		 */
		server.expose('createDNSServer', this.createDNSServer.bind(this));
		/**
		 * @borrows ControlServer#createHTTPServer as ControlServer~createHTTPServer
		 * @function ControlServer~createHTTPServer
		 */
		server.expose('createHTTPServer', this.createHTTPServer.bind(this));
		
		/**
		 * Returns a list of all instances currently in the pool.
		 * @function ControlServer~queryInstances
		 * @returns {ControlServer~InstanceInfo[]}
		 */
		server.expose('queryInstances', (() => {
			return this.tor_pool.instances.map(ControlServer.instance_info);
		}).bind(this));

		/**
		 * Returns information on an instance identified by the {@link TorProcess#instance_name} field.
		 * @function ControlServer~queryInstanceByName
		 * @param {string} instance_name - Name of the instance.
		 * @returns {ControlServer~InstanceInfo}
		 */
		server.expose('queryInstanceByName', ((instance_name) => {
			let instance = this.tor_pool.instance_by_name(instance_name);

			if (!instance)
				throw new Error(`Instance "${instance_name}"" does not exist`);

			return ControlServer.instance_info(instance);	
		}).bind(this));

		/**
		 * Returns information on an instance identified by its index in the pool.
		 * @function ControlServer~queryInstanceAt
		 * @param {number} instance_index - Index of the instance in the pool.
		 * @returns {ControlServer~InstanceInfo}
		 */
		server.expose('queryInstanceAt', ((index) => {
			if (!this.tor_pool)
				throw new Error('No pool created');

			let instance = this.tor_pool.instance_at(index);

			if (!instance)
				throw new Error(`Instance at "${i}"" does not exist`);

			return ControlServer.instance_info(this.tor_pool.instance_at(index));	
		}).bind(this));

		/**
		 * Returns a list of the names of all of the instances in the pool.
		 * @function ControlServer~queryInstanceNames
		 * @returns {string[]}
		 */
		server.expose('queryInstanceNames', (() => this.tor_pool.instance_names).bind(this));
	
		/**
		 * Returns a list of the names of all of the current groups.
		 * @function ControlServer~queryGroupNames
		 * @returns {string[]}
		 */
		server.expose('queryGroupNames', (() => Array.from(this.tor_pool.group_names)).bind(this));

		/**
		 * Returns a list of the instances that exist in a given group.
		 * @function ControlServer~queryGroupNames
		 * @param {string} group - Group the search in.
		 * @returns {InstanceInfo[]}
		 */
		server.expose('queryInstancesByGroup', ((group) => this.tor_pool.instances_by_group(group).map(ControlServer.instance_info)).bind(this));

		/**
		 * Creates instances from a number, an array of instance definitions or a single instance definition. 
		 * If a number is provided, creates n many instances.
		 * @function ControlServer~createInstances
		 * @param {InstanceDefinition[]|InstanceDefinition|number} instances_to_create - Array of definitions, single definition, or number of instances,
		 * @async
		 * @returns {Promise<InstanceInfo[]>} - The instances that were created
		 */
		server.expose('createInstances', (async (instances_to_create) => {
			let instances = await this.tor_pool.create(instances_to_create);

			return instances.map(ControlServer.instance_info);
		}).bind(this));

		/**
		 * Creates instances from an array of instance definitions or a single instance definition.
		 * @function ControlServer~addInstances
		 * @param {InstanceDefinition[]|InstanceDefinition} instances_to_create - Array of definitions or single definition.
		 * @async
		 * @returns {Promise<InstanceInfo[]>} - The instances that were created
		 */
		server.expose('addInstances', (async (defs) => {
			let instances = await this.tor_pool.add(defs);

			return instances.map(ControlServer.instance_info);
		}).bind(this));

		/**
		 * Removes a number of instances from the pool.
		 * @function ControlServer~removeInstances
		 * @borrows TorPool#remove as ControlServer~removeInstances
		 */
		server.expose('removeInstances', this.tor_pool.remove.bind(this.tor_pool));

		/**
		 * Remove an instance at the index provided from the pool.
		 * @function ControlServer~removeInstanceAt
		 * @borrows remove_at#remove as ControlServer~removeInstanceAt
		 */
		server.expose('removeInstanceAt', this.tor_pool.remove_at.bind(this.tor_pool));

		/**
		 * Remove an instance from the pool by the {@link TorProcess#instance_name} field.
		 * @function ControlServer~removeInstanceByName
		 * @borrows TorPool#remove_by_name as ControlServer~removeInstanceByName
		 */
		server.expose('removeInstanceByName', this.tor_pool.remove_by_name.bind(this.tor_pool));

		/**
		 * Gets new identities for all instances in the pool.
		 * @function ControlServer~newIdentites
		 * @borrows TorPool#new_identites as ControlServer~newIdentites
		 */
		server.expose('newIdentites', this.tor_pool.new_identites.bind(this.tor_pool));

		/**
		 * Get a new identity for the instance at the index provided in the pool.
		 * @function ControlServer~newIdentityAt
		 * @borrows TorPool#new_identity_at as ControlServer~newIdentityAt
		 */
		server.expose('newIdentityAt', this.tor_pool.new_identity_at.bind(this.tor_pool));

		/**
		 * Get a new identity for the instance by the {@link TorProcess#instance_name} field.
		 * @function ControlServer~newIdentityByName
		 * @borrows TorPool#new_identity_by_name as ControlServer~newIdentityByName
		 */
		server.expose('newIdentityByName', this.tor_pool.new_identity_by_name.bind(this.tor_pool));

		/**
		 * Gets new identities for all instances in the group.
		 * @function ControlServer~newIdentitiesByGroup
		 * @borrows TorPool#new_identites_by_group as ControlServer~newIdentitiesByGroup
		 */
		server.expose('newIdentitiesByGroup', this.tor_pool.new_identites_by_group.bind(this.tor_pool));

		/**
		 * Gets the next instance in the pool using the load balance method.
		 * @function ControlServer~nextInstance
		 * @returns {InstanceInfo} - The next instance in the pool.
		 */
		server.expose('nextInstance', (() => ControlServer.instance_info(this.tor_pool.next())).bind(this));

		/**
		 * Gets the next instance in the group using the load balance method.
		 * @function ControlServer~nextInstanceByGroup
		 * @param {string} group - The group in question.
		 * @returns {InstanceInfo} - The next instance in the group.
		 */
		server.expose('nextInstanceByGroup', ((group) => {
			return ControlServer.instance_info(this.tor_pool.next_by_group(group));
		}).bind(this));

		/**
		 * Kills the processes of all instances in the pool.
		 * @function ControlServer~closeInstances
		 * @borrows TorPool#exit as ControlServer~closeInstances
		 */
		server.expose('closeInstances', this.tor_pool.exit.bind(this.tor_pool));

		/**
		 * Sets a property in the application configuration.
		 * @function ControlServer~setConfig
		 * @param {string} key - Name of the property to set.
		 * @param {string} value - Value to set the property to.
		 */
		server.expose('setConfig', ((key, value) => {
			this.nconf.set(key, value);
		}).bind(this));	
	
		/**
		 * Gets a property in the application configuration.
		 * @function ControlServer~getConfig
		 * @param {string} key - Name of the property to set.
		 * @returns {*} - Value of the property
		 */
		server.expose('getConfig', ((key) => {
			return this.nconf.get(key);
		}).bind(this));	

		/**
		 * Saves the application configuration to the underlying store (usually a JSON file).
		 * @function ControlServer~saveConfig
		 * @async
		 * @throws If the save operation fails.
		 * @returns {Promise}
		 */
		server.expose('saveConfig', (async () => {
			await new Promise((resolve, reject) => {
				this.nconf.save((err) => {
					if (err) return reject(err);
					resolve();
				});
			});
		}).bind(this));	

		/**
		 * Loads the application configuration from the underlying store (usually a JSON file).
		 * @function ControlServer~loadConfig
		 * @async
		 * @throws If the load operation fails.
		 * @returns {Promise}
		 */
		server.expose('loadConfig', (async () => {
			await new Promise((resolve, reject) => {
				this.nconf.load((err) => {
					if (err) return reject(err);
					resolve();
				});
			});
		}).bind(this));	

		/**
		 * Sets a configuration property on all instances in the pool.
		 * @function ControlServer~setTorConfig
		 * @async
		 * @param {Object} config - An object containing properties to be set. 
		 * @returns {Promise}
		 */
		server.expose('setTorConfig', (async (config) => {
			await Promise.all(Object.keys(config).map((key) => {
				let value = config[key];

				return this.tor_pool.set_config_all(key, value);
			}));
		}).bind(this));

		/**
		 * Sets a configuration property on all instances in a group.
		 * @function ControlServer~setTorConfigByGroup
		 * @async
		 * @param {string} group - Group to set properties on.
		 * @param {Object} config - An object containing properties to be set. 
		 * @returns {Promise}
		 */
		server.expose('setTorConfigByGroup', (async (group, config) => {
			await Promise.all(Object.keys(config).map((key) => {
				let value = config[key];

				return this.tor_pool.set_config_by_group(group, key, value);
			}));
		}).bind(this));

		/**
		 * Retrieves the current load balance method for the pool
		 * @function ControlServer~getLoadBalanceMethod
		 * @returns {string} - The load balance method
		 */
		server.expose('getLoadBalanceMethod', (() => {
			return this.tor_pool.load_balance_method;
		}).bind(this));	

		/**
		 * Sets the current load balance method for the pool
		 * @function ControlServer~getLoadBalanceMethod
		 * @param {string} load_balance_method - The load balance method to set
		 */
		server.expose('setLoadBalanceMethod', ((loadBalanceMethod) => {
			this.tor_pool.load_balance_method = loadBalanceMethod;
			this.nconf.set('loadBalanceMethod', loadBalanceMethod);
		}).bind(this));	

		/**
		 * Retrieve a configuration property for an instance identified by the {@link TorProcess#instance_name} field.
		 * @function ControlServer~getInstanceConfigByName
		 * @borrows TorPool#getInstanceConfigByName as ControlServer~get_config_by_name
		 */
		server.expose('getInstanceConfigByName', this.tor_pool.get_config_by_name.bind(this.tor_pool));	

		/**
		 * Retrieves a configuration property for an instance by its index in the pool.
		 * @function ControlServer~get_config_at
		 * @borrows TorPool#get_config_at as ControlServer~get_config_at
		 */
		server.expose('getInstanceConfigAt', this.tor_pool.get_config_at.bind(this.tor_pool));	

		/**
		 * Sets a configuration property for an instance identified by the {@link TorProcess#instance_name} field.
		 * @function ControlServer~setInstanceConfigByName
		 * @borrows TorPool#set_config_by_name as ControlServer~setInstanceConfigByName
		 */
		server.expose('setInstanceConfigByName', this.tor_pool.set_config_by_name.bind(this.tor_pool));

		/**
		 * Sets a configuration property for an instance identified by its index in the pool.
		 * @function ControlServer~setInstanceConfigAt
		 * @borrows TorPool#set_config_at as ControlServer~setInstanceConfigAt
		 */
		server.expose('setInstanceConfigAt', this.tor_pool.set_config_at.bind(this.tor_pool));

		/**
		 * Sends a signal to all instances in the pool
		 * @function ControlServer~signalAllInstances
		 * @borrows TorPool#signal_all as ControlServer~signalAllInstances
		 */
		server.expose('signalAllInstances', this.tor_pool.signal_all.bind(this.tor_pool));
	
		/**
		 * Sends a signal to an instance identified by its index in the pool.
		 * @function ControlServer~signalInstanceAt
		 * @borrows TorPool#signal_at as ControlServer~signalInstanceAt
		 */
		server.expose('signalInstanceAt', this.tor_pool.signal_at.bind(this.tor_pool));

		/**
		 * Sends a signal to an instance identified by the {@link TorProcess#instance_name} field.
		 * @function ControlServer~signalInstanceByName
		 * @borrows TorPool#signal_by_name as ControlServer~signalInstanceByName
		 */
		server.expose('signalInstanceByName', this.tor_pool.signal_by_name.bind(this.tor_pool));

		/**
		 * Sends a singal to all instances in a group.
		 * @function ControlServer~signalInstancesByGroup
		 * @borrows TorPool#signal_by_group as ControlServer~signalInstancesByGroup
		 */
		server.expose('signalInstancesByGroup', this.tor_pool.signal_by_group.bind(this.tor_pool));

		/**
		 * Adds an instance to a group identified by its {@link TorProcess#instance_name} field.
		 * @function ControlServer~addInstanceToGroupByName
		 * @borrows TorPool#add_instance_to_group_by_name as ControlServer~addInstanceToGroupByName
		 */
		server.expose('addInstanceToGroupByName', this.tor_pool.add_instance_to_group_by_name.bind(this.tor_pool));
		
		/**
		 * Adds an instance to a group identified by its index in the pool.
		 * @function ControlServer~addInstanceToGroupAt
		 * @borrows TorPool#add_instance_to_group_at as ControlServer~addInstanceToGroupAt
		 */
		server.expose('addInstanceToGroupAt', this.tor_pool.add_instance_to_group_at.bind(this.tor_pool));

		/**
		 * Removes an instance from a group identified by its {@link TorProcess#instance_name} field.
		 * @function ControlServer~removeInstanceFromGroupByName
		 * @borrows TorPool#remove_instance_from_group_by_name as ControlServer~removeInstanceFromGroupByName
		 */
		server.expose('removeInstanceFromGroupByName', this.tor_pool.remove_instance_from_group_by_name.bind(this.tor_pool));
		
		/**
		 * Remove an instance from a group identified by its index in the pool.
		 * @function ControlServer~removeInstanceFromGroupAt
		 * @borrows TorPool#remove_instance_from_group_at as ControlServer~removeInstanceFromGroupAt
		 */
		server.expose('removeInstanceFromGroupAt', this.tor_pool.remove_instance_from_group_at .bind(this.tor_pool));
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
		this.tcpTransport = new rpc.tcpTransport({ port, hostname });
		this.tcpTransport.listen(this.server);
        this.logger.info(`[control]: control server listening on tcp://${hostname}:${port}`);
	}

	/**
	 * Binds the server to a host and port and begins listening for WebSocket traffic
	 * @param {number} port - Port the server should bind to
	 * @param {string} [hostname] - Host the server should bind to
	 * @async
	 * @returns {Promise}
	 */
	async listenWs(port, hostname) {
		this.wsTransport = new rpc.wsTransport({ port, hostname });
		this.wsTransport.listen(this.server);
		this.logger.info(`[control]: control server listening on ws://${hostname}:${port}`);
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
		if (this.tcpTransport && this.tcpTransport.tcpServer)
			this.tcpTransport.tcpServer.close();
		if (this.wsTransport && this.wsTransport.httpServer)
			this.wsTransport.httpServer.close();
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
