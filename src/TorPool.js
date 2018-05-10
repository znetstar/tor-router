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

class TorPool extends EventEmitter {
	constructor(tor_path, default_config, logger, nconf) {
		super();

		default_config = _.extend({}, (default_config || {}), nconf.get('torConfig'));
		this.default_tor_config = default_config;
		this.data_directory = nconf.get('parentDataDirectory');
		!fs.existsSync(this.data_directory) && fs.mkdirSync(this.data_directory);
		this.tor_path = tor_path || 'tor';
		this._instances = [];
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
		instance_definition.Config.DataDirectory = instance_definition.Config.DataDirectory || path.join(this.data_directory, instance_id);
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

	remove(instances, callback) {
		let instances_to_remove = this._instances.splice(0, instances);
		async.each(instances_to_remove, (instance, next) => {
			instance.exit(next);
		}, callback);
	}

	remove_at(instance_index, callback) {
		let instance = this._instances.slice(instance_index, 1);
		instance.exit(() => {
			callback();
		});
	}

	next() {
		this._instances = this._instances.rotate(1);
		return this.instances[0];
	}

	exit(callback) {
		async.each(this.instances, (instance,next) => {
			instance.exit(next);
		}, (error) => {
			callback && callback(error);
		});
	}

	new_ips() {
		this.instances.forEach((tor) => tor.new_ip());
	}

	new_ip_at(index) {
		this.instances[index].new_ip();
	}
};

module.exports = TorPool;