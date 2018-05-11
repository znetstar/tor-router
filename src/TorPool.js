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

const EventEmitter = require('eventemitter2').EventEmitter2;
const async = require('async');
const TorProcess = require('./TorProcess');
const _ = require('lodash');
const path = require('path');
const nanoid = require('nanoid');
const fs = require('fs');
const WeightedList = require('js-weighted-list');

const load_balance_methods = {
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
		}
		return instances._weighted_list.peek(instances.length).map((element) => element.data);
	}
};

class TorPool extends EventEmitter {
	constructor(tor_path, default_config, logger, nconf, data_directory, load_balance_method) {
		super();
		this._instances = [];
		default_config = _.extend({}, (default_config || {}), nconf.get('torConfig'));
		this.default_tor_config = default_config;
		this.data_directory = data_directory || nconf.get('parentDataDirectory');
		this.load_balance_method = load_balance_method || nconf.get('loadBalanceMethod');
		!fs.existsSync(this.data_directory) && fs.mkdirSync(this.data_directory);
		this.tor_path = tor_path || nconf.get('torPath');
		this.logger = logger;
		this.nconf = nconf;
	}

	get instances() { 
		return this._instances.filter((tor) => tor.ready).slice(0);
	}

	create_instance(instance_definition, callback) {
		instance_definition.Config = instance_definition.Config || {};
		instance_definition.Config = _.extend(instance_definition.Config, this.default_tor_config);
		let instance_id = nanoid();
		instance_definition.Config.DataDirectory = instance_definition.Config.DataDirectory || path.join(this.data_directory, (instance_definition.Name || instance_id));
		let instance = new TorProcess(this.tor_path, instance_definition.Config, this.logger, this.nconf);
		instance.id = instance_id;
		instance.definition = instance_definition;
		instance.create((error) => {
			if (error) return callback(error);
			this._instances.push(instance);

			instance.once('error', callback)
			instance.once('ready', () => {
				this.emit('instance_created', instance);
				callback && callback(null, instance);
			});
		});
	}

	add(instance_definitions, callback) {
		async.each(instance_definitions, (instance_definition, next) => {
			this.create_instance(instance_definition, next);
		}, (callback || (() => {})));
	}

	create(instances, callback) {
		if (typeof(instances) === 'number') {
			instances = Array.from(Array(instances)).map(() => {
				return {
					Config: {}
				};
			});
		}
		return this.add(instances, callback);
	}

	instance_by_name(name) {
		return this.instances.filter((i) => i.definition.Name === name)[0];
	}

	remove(instances, callback) {
		let instances_to_remove = this._instances.splice(0, instances);
		async.each(instances_to_remove, (instance, next) => {
			instance.exit(next);
		}, callback);
	}

	remove_at(instance_index, callback) {
		let instance = this._instances.splice(instance_index, 1);
		instance.exit(callback);
	}

	remove_by_name(instance_name, callback) {
		let instance = this.instance_by_name(instance_name);
		if (!instance) return callback && callback(new Error(`Instance "${name}" not found`));
		let instance_index = (this.instances.indexOf(instance));;
		return this.remove_at(instance_index, callback);
	}

	next() {
		this._instances = load_balance_methods[this.nconf.get('loadBalanceMethod')](this._instances);
		return this.instances[0];
	}

	exit(callback) {
		async.each(this.instances, (instance,next) => {
			instance.exit(next);
		}, (error) => {
			callback && callback(error);
		});
	}

	new_identites(callback) {
		async.each(this.instances, (tor, next) => {
			tor.new_identity(next);
		}, (error) => {
			callback && callback(error);
		});
	}

	new_identity_at(index, callback) {
		this.instances[index].new_identity(callback);
	}

	new_identity_by_name(name, callback) {
		let instance = this.instance_by_name(name);
		if (!instance) return callback && callback(new Error(`Instance "${name}" not found`));
		instance.new_identity(callback);
	}

	/* Begin Deprecated */

	new_ips(callback) {
		this.logger && this.logger.warn(`TorPool.new_ips is deprecated, use TorPool.new_identites`);
		return this.new_identites(callback);
	}

	new_ip_at(index, callback) {
		this.logger && this.logger.warn(`TorPool.new_ip_at is deprecated, use TorPool.new_identity_at`);
		return this.new_identity_at(inde, callback);
	}

	/* End Deprecated */

	get_config_by_name(name, keyword, callback) {
		let instance = this.instance_by_name(name);
		if (!instance) return callback && callback(new Error(`Instance "${name}" not found`));
		instance.get_config(keyword, callback);
	}

	set_config_by_name(name, keyword, value, callback) {
		let instance = this.instance_by_name(name);
		if (!instance) return callback && callback(new Error(`Instance "${name}" not found`));
		instance.set_config(keyword, value, callback);
	}

	get_config_at(index, keyword, callback) {
		let instance = this.instances[index];
		if (!instance) return callback && callback(new Error(`Instance at ${index} not found`));
		instance.get_config(keyword, callback);
	}

	set_config_at(index, keyword, value, callback) {
		let instance = this.instances[index];
		if (!instance) return callback && callback(new Error(`Instance at ${index} not found`));
		instance.set_config(keyword, value, callback);
	}
};

TorPool.LoadBalanceMethods = load_balance_methods;

module.exports = TorPool;