/* From http://stackoverflow.com/questions/1985260/javascript-array-rotate */
Array.prototype.rotate = (function() {
    // save references to array functions to make lookup faster
    var push = Array.prototype.push,
        splice = Array.prototype.splice;

    return function(count) {
        var len = this.length >>> 0, // convert to uint
            count = count >> 0; // convert to int

        // convert count to value in range [0, len)
        count = ((count % len) + len) % len;

        // use splice.call() instead of this.splice() to make function generic
        push.apply(this, splice.call(this, 0, count));
        return this;
    };
})();

const path = require('path');
const fs = require('fs');

const { EventEmitter } = require('eventemitter3');
const Promise = require("bluebird");
const _ = require('lodash');
const WeightedList = require('js-weighted-list');

const TorProcess = require('./TorProcess');

Promise.promisifyAll(fs);



/**
 * Class that represents a pool of Tor processes.
 * @extends EventEmitter
 */
class TorPool extends EventEmitter {
	/**
	 * Creates an instance of TorPool.
	 * 
	 * @param {string} tor_path - Path to the Tor executable.
	 * @param {Object|Function} [default_config] -  Default configuration that will be passed to all Tor instances created. Can be a function. See {@link https://bit.ly/2QrmI3o|Tor Documentation} for all possible options
	 * @param {string} data_directory - Parent directory for the data directory of each proccess.
	 * @param {string} load_balance_method - Name of the load balance method to use. See {@link TorPool#load_balance_methods}.
	 * @param {string} [granax_options] - Object containing options that will be passed to granax.
	 * @param {string} [logger] - A winston logger. If not provided no logging will occur.
	 * 
	 * @throws If "data_directory" is not provided.
	 */
	constructor(tor_path, default_config, data_directory, load_balance_method, granax_options, logger) {
		if (!data_directory)
			throw new Error('Invalid "data_directory"');
		super();
		this._instances = [];
		this._default_tor_config = default_config;
		this.data_directory = data_directory;
		this.load_balance_method = load_balance_method;
		this.tor_path = tor_path;
		this.logger = logger || require('./winston-silent-logger');
		this.granax_options = granax_options;
	}

	/**
	 * Returns a Set containing the names of all of the groups.
	 * 
	 * @readonly
	 * @type {Set<string>}
	 */
	get group_names() {
		return new Set(_.flatten(this.instances.map((instance) => instance.instance_group).filter(Boolean)));
	}

	/**
	 * Returns an array containing all of the instances in a group.
	 * 
	 * @param {string} group_name - The group to query.
	 * @returns {string[]}
	 * 
	 * @throws If the provided group does not exist
	 */
	instances_by_group(group_name) {
		if (!this.group_names.has(group_name))
			throw new Error(`Group "${group_name}" doesn't exist`);

		let group = this.groups[group_name];
		let arr = [];

		for (let i = 0; i < group.length; i++) {
			arr.push(group[i]);
		}

		return arr;
	}
	
	/**
	 * Adds an instance to a group. If the group doesn't exist it will be created.
	 * 
	 * @param {string} group - The group to add the instance to.
	 * @param {TorProcess} instance - The instance in question.
	 */
	add_instance_to_group(group, instance) {
		instance.definition.Group = _.union(instance.instance_group, [group]);
	}

	/**
	 * Adds an instance to a group by the {@link TorProcess#instance_name} property on the instance. If the group doesn't exist it will be created.
	 * 
	 * @param {string} group - The group to add the instance to.
	 * @param {string} instance_name - The name of the instance in question.
	 * 
	 * @throws If an instance with the name provided does not exist
	 */
	add_instance_to_group_by_name(group, instance_name) {
		let instance = this.instance_by_name(instance_name);

		if (!instance) throw new Error(`Instance "${instance_name}" not found`);

		return this.add_instance_to_group(group, instance);
	}

	/**
	 * Adds an instance to a group by the index of the instance in the pool. If the group doesn't exist it will be created.
	 * 
	 * @param {string} group - The group to add the instance to.
	 * @param {number} instance_index - The index of the instance in question.
	 * 
	 * @throws If an instance with the index provided does not exist.
	 */
	add_instance_to_group_at(group, instance_index) {
		let instance = this.instance_at(instance_index);

		if (!instance) throw new Error(`Instance at "${instance_index}" not found`);

		return this.add_instance_to_group(group, instance);
	}

	/**
	 * Removes an instance from a group.
	 * 
	 * @param {string} group - The group to remove the instance from.
	 * @param {TorProcess} instance - The instance in question.
	 */
	remove_instance_from_group(group, instance) {
		_.remove(instance.definition.Group, (g) => g === group);
	}

	/**
	 * Removes an instance from a group by the {@link TorProcess#instance_name} property on the instance.
	 * 
	 * @param {string} group - The group to remove the instance from.
	 * @param {string} instance_name - The name of the instance in question.
	 * 
	 * @throws If an instance with the name provided does not exist.
	 */
	remove_instance_from_group_by_name(group, instance_name) {
		let instance = this.instance_by_name(instance_name);

		if (!instance) throw new Error(`Instance "${instance_name}" not found`);

		return this.remove_instance_from_group(group, instance);
	}

	/**
	 * Removes an instance from a group by the index of the instance in the pool.
	 * 
	 * @param {string} group - The group to remove the instance from.
	 * @param {number} instance_index - The index of the instance in question.
	 * 
	 * @throws If an instance with the index provided does not exist.
	 */
	remove_instance_from_group_at(group, instance_index) {
		let instance = this.instance_at(instance_index);

		if (!instance) throw new Error(`Instance at "${instance_index}" not found`);

		return this.remove_instance_from_group(group, instance);
	}


	/**
	 * Represents a group of instances. Group is a Proxy with an array as its object. The array is generated by calling {@link TorPool#instances_in_group}.
	 * When called with an index (e.g. `Group[0]`) will return the instance at that index. 
	 * Helper functions are available as properties.
	 * @typedef {TorProcess[]} Group
	 * 
	 * @property {Function} add - Adds an instance to the group.
	 * @property {Function} remove - Removes an instance from the group.
	 * @property {Function} add_by_name - Adds an instance to the group by the {@link TorProcess#instance_name} property on the instance.
	 * @property {Function} remove_by_name - Removes an instance from the group by the {@link TorProcess#instance_name} property on the instance.
	 * @property {Function} remove_at - Removes an instance from the group by the index of the instance in the group.
	 * @property {number} length - The size of the group of instances
	 * @property {Function} rotate - Rotates the array of instances  
	 */ 

	 /**
	  * Represents a collection of groups as an associative array. GroupCollection is a Proxy with a Set as its object. The Set is {@link TorPool#group_names}.
	  * If a non-existant group is referenced (e.g. `Groups["doesn't exist"]`) it will be created. So `Groups["doesn't exist"].add(my_instance)` will create the group and add the instance to it.
	  * @typedef {Group[]} GroupCollection
	  */

	/**
	 * Represents all groups currently in the pool.
	 * 
	 * @readonly
	 * @type {GroupCollection}
	 */
	get groups() {
		let groupHandler = {
			get: (instances, prop) => {
				if (!Number.isNaN(Number(prop)))
					return instances[prop];

				let save_index = () => {
					instances = instances.map((instance, index) => {
						instance._index =  index;
						return instance;
					});
				};

				let { group_name } = instances;
				
				if (prop === 'add') 
					return (instance) => {
						this.add_instance_to_group(group_name, instance);
						save_index();
					};
				
				if (prop === 'add_by_name') {
					return (instance_name) => {
						this.add_instance_to_group_by_name(group_name, instance_name);
						save_index();
					};
				}

				if (prop === 'remove')
					return (instance) => {
						this.remove_instance_from_group(group_name, instance);
						save_index();
					};
			
				if (prop === 'remove_by_name') {
					return (instance_name) => {
						this.remove_instance_from_group_by_name(group_name, instance_name);
						save_index();
					};
				}

				if (prop === 'remove_at') 					
					return (instance_index) => {
						this.remove_instance_from_group(group_name, instances[instance_index]);
						save_index();
					};

				if (prop === 'length')
					return instances.length;

				if (prop === 'rotate') {
					return (num) => {
						instances.rotate(typeof(num) === 'undefined' ? 1 : num);
						save_index();
					};
				}
				
				return void(0);
			}
		};

		let groupsHandler = {
			get: (group_names, prop) => {
				let instances_in_group = [];

				if (group_names.has(prop)) {
					instances_in_group = this.instances.filter((instance) => instance.instance_group.indexOf(prop) !== -1);
				}

				instances_in_group = _.sortBy(instances_in_group, ['_index', 'instance_name']);

				instances_in_group.group_name = prop;

				return new Proxy(instances_in_group, groupHandler);
			}
		};

		return new Proxy(this.group_names, groupsHandler);
	}

	/**
	 * The default configuration that will be passed to each instance. Values from "definition.Config" on each instance will override the default config
	 * 
	 */

	 /** Getter 
	  * 
	  * @type {Object|Function}
	 */
	get default_tor_config() {
		if (typeof(this._default_tor_config) === 'function')
			return this._default_tor_config();
		else if (this._default_tor_config)
			return _.cloneDeep(this._default_tor_config);
		else
			return {};
	}

	/**
	 * Setter
	 * 
	 * @param {Object|Function} value
	 */
	set default_tor_config(value) { this._default_tor_config = value; }

	/**
	 * Returns an enumeration of load balance methods as functions
	 * 
	 * @readonly
	 * @enum {Function}
	 * @static
	 */
	static get load_balance_methods() {
		return Object.freeze({
			round_robin: function (instances) {
				return instances.rotate(1);
			},
			weighted: function (instances) {
				if (!instances._weighted_list) {
					instances._weighted_list = new WeightedList(
						instances.map((instance) => {
							return [ instance.id, instance.definition.Weight, instance ]
						})
					);
				};
				let i = instances._weighted_list.peek(instances.length).map((element) => element.data);
				i._weighted_list = instances._weighted_list;
				return i;
			}
		});
	}

	/**
	 * An array containing all instances in the pool. 
	 * 
	 * @readonly
	 * @type {TorProcess[]}
	 */
	get instances() { 
		return this._instances.slice(0);
	}

	/**
	 * An array containing the names of the instances in the pool.
	 * 
	 * @readonly
	 * @type {string[]}
	 */
	get instance_names() {
		return this.instances.map((i) => i.instance_name);
	}

	/**
	 * Creates an instance then adds it to the pool from the provided definiton. 
	 * Instance will be added (and Promise will resolve) after the instance is fully bootstrapped.
	 * 
	 * @async
	 * @param {InstanceDefinition} [instance_definition={}] - Instance definition that will be used to create the instance.  
	 * @returns {Promise<TorProcess>} - The instance that was created.
	 * 
	 * @throws If an instance with the same {@link InstanceDefinition#Name} already exists.
	 */
	async create_instance(instance_definition) {
		if (!(fs.existsSync(this.data_directory)))
			await fs.mkdirAsync(this.data_directory);

		instance_definition = instance_definition || {};

		if (instance_definition.Name && this.instance_names.indexOf(instance_definition.Name) !== -1) 
			throw new Error(`Instance named ${instance_definition.Name} already exists`);
		
		this._instances._weighted_list = void(0);
		instance_definition.Config = _.extend(_.cloneDeep(this.default_tor_config), (instance_definition.Config || {}));
		let instance = new TorProcess(this.tor_path, instance_definition, this.granax_options, this.logger);
		instance.definition.Config.DataDirectory = instance.definition.Config.DataDirectory || path.join(this.data_directory, instance.instance_name);
		
		await instance.create();
		
		this._instances.push(instance);

		return await new Promise((resolve, reject) => {
			instance.once('error', reject);

			instance.once('ready', () => {
				/**
				 * Fires when an instance has been created.
				 *
				 * @event TorPool#instance_created
				 * @type {TorProcess}
				 * @param {TorProcess} instance - The instance that was created.
				 */
				this.emit('instance_created', instance);
				resolve(instance);
			});
		});
	}

	/**
	 * Adds one or more instances to the pool from an array of definitions or single definition.
	 * @param {InstanceDefinition[]|InstanceDefinition} instance_definitions
	 * 
	 * @async
	 * @return {Promise<TorProcess[]>}
	 * @throws If `instance_definitions` is falsy.
	 */
	async add(instance_definitions) {
		if (!instance_definitions)
			throw new Error('Invalid "instance_definitions"');
		
		return await Promise.all([].concat(instance_definitions).map((instance_definition) => this.create_instance(instance_definition)));
	}

	/**
	 * Creates one or more instances to the pool from either an array of definitions, a single definition or a number.
	 * If a number is provided it will create n instances with empty definitions (e.g. `TorPool.create(5)` will create 5 instances).
	 * @param {InstanceDefinition[]|InstanceDefinition|number} instance_definitions
	 * 
	 * @async
	 * @return {Promise<TorProcess[]>}
	 * @throws If `instances` is falsy.
	 */
	async create(instances) {
		if (!instances)
			throw new Error('Invalid "instances"');
		
		if (typeof(instances) === 'number') {
			instances = Array.from(Array(instances)).map(() => ({}));
		}
		return await this.add(instances);
	}

	/**
	 * Searches for an instance with the matching {@link TorProcess#instance_name} property.
	 * @param {string} name - Name of the instance to search for
	 * @returns {TorProcess} - Matching instance
	 */
	instance_by_name(name) {
		return this._instances.filter((i) => i.instance_name === name)[0];
	}

	/**
	 * Returns the instance located at the provided index in the pool. 
	 * Is equivalent to `{@link TorPool#instances}[index]`
	 * @param {number} index - Index of the instance in the pool
	 * @returns {TorProcess} - Matching instance
	 */
	instance_at(index) {
		return this._instances[index];
	}

	/**
	 * Removes a number of instances from the pool and kills their Tor processes. 
	 * @param {number} instances - Number of instances to remove
	 * @param {number} [start_at=0] - Index to start removing from
	 * @async
	 * @returns {Promise} - Promise will resolve when the processes are dead
	 */
	async remove(instances, start_at) {
		this._instances._weighted_list = void(0);
		let instances_to_remove = this._instances.splice((start_at || 0), instances);
		await Promise.all(instances_to_remove.map((instance) => instance.exit()));
	}

	/**
	 * Removes an instance at the provided index and kills its Tor process.
	 * @param {number} instance_index - Index of the instance to remove
	 * @async
	 * @returns {Promise} - Promise will resolve when the process is dead
	 */
	async remove_at(instance_index) {
		this._instances._weighted_list = void(0);

		let instance = this._instances.splice(instance_index, 1)[0];
		if (!instance)
			throw new Error(`No instance at "${instance_index}"`);
		
		await instance.exit();
	}

	/**
	 * Removes an instance whose {@link TorProcess#instance_name} property matches the provided name and kills its Tor process.
	 * @param {string} instance_name - Name of the instance to remove
	 * @async
	 * @returns {Promise} - Promise will resolve when the process is dead
	 */
	async remove_by_name(instance_name) {
		let instance = this.instance_by_name(instance_name);
		if (!instance) 
			throw new Error(`Instance "${name}" not found`);
		let instance_index = (this.instances.indexOf(instance));
		await this.remove_at(instance_index);
	}

	/**
	 * Runs the load balance function ({@link TorPool#load_balance_method}) on the array of instances in the pool and returns the first instance in the array.
	 * 
	 * @returns {TorProcess} - The first instance in the modified array.
	 */
	next() {
		this._instances = TorPool.load_balance_methods[this.load_balance_method](this._instances);
		return this.instances[0];
	}

	/**
	 * Rotates the array containing instances in the group provided so that the second element becomes the first element and the first element becomes the last element.
	 * [1,2,3] -> [2,3,1]
	 * @todo Load balance methods other than "round_robin" to be used
	 * @param {string} group - Name of the group
	 * @returns {TorProcess} - The first element in the modified array
	 */
	
	next_by_group(group) {
		this.groups[group].rotate(1);
		return this.groups[group][0];
	}


	/**
	 * Kills the Tor processes of all instances in the pool.
	 * 
	 * @async
	 * @returns {Promise} - Resolves when all instances have been killed.
	 */
	async exit() {
		await Promise.all(this._instances.map((instance) => instance.exit()));
		this._instances = [];
	}

	/**
	 * Gets new identities for all instances in the pool.
	 * 
	 * @async
	 * @returns {Promise} - Resolves when all instances have new identities.
	 */
	async new_identites() {
		await Promise.all(this.instances.map((instance) => instance.new_identity()));
	}

	/**
	 * Gets new identities for all instances in a group.
	 * 
	 * @async
	 * @param {string} - Name of the group.
	 * @returns {Promise} - Resolves when all instances in the group have new identities.
	 */
	async new_identites_by_group(group) {
		await Promise.all(this.instances_by_group(group).map((instance) => instance.new_identity()));
	}

	/**
	 * Gets a new identity for the instance at the provided index in the pool.
	 * 
	 * @async
	 * @param {number} - Index of the instance in the pool.
	 * @returns {Promise} - Resolves when the instance has a new identity.
	 */
	async new_identity_at(index) {
		await this.instances[index].new_identity();
	}

	/**
	 * Gets a new identity for the instance whose {@link TorProcess.instance_name} matches the provided name.
	 * 
	 * @async
	 * @param {string} - Name of the instance.
	 * @returns {Promise} - Resolves when the instance has a new identity.
	 * 
	 * @throws When no instance matched the provided name.
	 */
	async new_identity_by_name(name) {
		let instance = this.instance_by_name(name);
		
		if (!instance) 
			throw new Error(`Instance "${name}" not found`);
		
		await instance.new_identity();
	}

	/**
	 * Get a configuration value from the instance whose {@link TorProcess.instance_name} matches the provided name via the control protocol.
	 * 
	 * @async
	 * @param {string} name - Name of the instance.
	 * @param {string} keyword - Name of the configuration property.
	 * 
	 * @returns {Promise<string[]>} - The configuration property's value.
	 * @throws When no instance matched the provided name.
	 */
	async get_config_by_name(name, keyword) {
		let instance = this.instance_by_name(name);
		if (!instance) 
			throw new Error(`Instance "${name}" not found`);
		
		return await instance.get_config(keyword);
	}

	/**
	 * Set a configuration value for the instance whose {@link TorProcess.instance_name} matches the provided name via the control protocol.
	 * 
	 * @async
	 * @param {string} name - Name of the instance.
	 * @param {string} keyword - Name of the configuration property.
	 * @param {*} value - Value to set the configuration property to.
	 * 
	 * @returns {Promise}
	 * @throws When no instance matched the provided name.
	 */
	async set_config_by_name(name, keyword, value) {
		let instance = this.instance_by_name(name);
		if (!instance) 
			throw new Error(`Instance "${name}" not found`);
		
		return await instance.set_config(keyword, value);
	}

	/**
	 * Get a configuration value from the instance at the index in the pool via the control protocol.
	 * 
	 * @async
	 * @param {number} index - Index of the instance in the pool.
	 * @param {string} keyword - Name of the configuration property.
	 * 
	 * @returns {Promise<string[]>} - The configuration property's value.
	 * @throws When no instance exists at the provided index.
	 */
	async get_config_at(index, keyword) {
		let instance = this.instances[index];
		if (!instance) 
			throw new Error(`Instance at ${index} not found`);
		
		return await instance.get_config(keyword);
	}

	/**
	 * Set a configuration value for the instance at the index in the pool via the control protocol.
	 * 
	 * @async
	 * @param {number} index - Index of the instance in the pool.
	 * @param {string} keyword - Name of the configuration property.
	 * @param {*} value - Value to set the configuration property to.
	 * 
	 * @returns {Promise}
	 * @throws When no instance exists at the provided index.
	 */
	async set_config_at(index, keyword, value) {
		let instance = this.instances[index];
		if (!instance) 
			throw new Error(`Instance at ${index} not found`);
		return await instance.set_config(keyword, value);
	}

	/**
	 * Set a configuration value for all instances in the provided group via the control protocol.
	 * 
	 * @async
	 * @param {string} group - Name of the group.
	 * @param {string} keyword - Name of the configuration property.
	 * @param {*} value - Value to set the configuration property to.
	 * 
	 * @returns {Promise}
	 * @throws When the provided group does not exist.
	 */
	async set_config_by_group(group, keyword, value) {
		return await Promise.all(this.instances_by_group(group).map((instance) => instance.set_config(keyword, value)));
	}

	/**
	 * Set a configuration value for all instances in the pool via the control protocol.
	 * 
	 * @async
	 * @param {string} keyword - Name of the configuration property.
	 * @param {*} value - Value to set the configuration property to.
	 * 
	 * @returns {Promise}
	 */
	async set_config_all(keyword, value) {
		return await Promise.all(this.instances.map((instance) => instance.set_config(keyword, value)));
	}

	/**
	 * Send a signal via the control protocol to all instances in the pool.
	 * 
	 * @async
	 * @param {string} signal - The signal to send.
	 * 
	 * @returns {Promise}
	 */
	async signal_all(signal) {
		await Promise.all(this.instances.map((instance) => instance.signal(signal)));
	}

	/**
	 * Send a signal via the control protocol to an instance whose {@link TorProcess#instance_name} property matches the provided name.
	 * 
	 * @async
	 * @param {string} name - Name of the instance.
	 * @param {string} signal - The signal to send.
	 * 
	 * @returns {Promise}
	 */
	async signal_by_name(name, signal) {
		let instance = this.instance_by_name(name);
		if (!instance) 
			throw new Error(`Instance "${name}" not found`);

		await instance.signal(signal);
	}

	/**
	 * Send a signal via the control protocol to an instance at the provided index in the pool.
	 * 
	 * @async
	 * @param {number} index - Index of the instance in the pool.
	 * @param {string} signal - The signal to send.
	 * 
	 * @returns {Promise}
	 */
	async signal_at(index, signal) {
		let instance = this.instances[index];
		if (!instance) 
			throw new Error(`Instance at ${index} not found`);
		
		await instance.signal(signal);
	}

	/**
	 * Send a signal via the control protocol to all instances in the provided group.
	 * 
	 * @async
	 * @param {string} group - Name of the group.
	 * @param {string} signal - The signal to send.
	 * 
	 * @returns {Promise}
	 * @throws When the provided group does not exist.
	 */
	async signal_by_group(group, signal) {
		await Promise.all(this.instances_by_group(group).map((instance) => instance.signal(signal)));
	}
};

module.exports = TorPool;