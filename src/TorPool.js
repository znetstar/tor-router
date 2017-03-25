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
const temp = require('temp');
const _ = require('lodash');

temp.track();

class TorPool extends EventEmitter {
	constructor(tor_path, config, logger) {
		super();

		config = config || {};

		this.tor_config = config;
		this.tor_path = tor_path || 'tor';
		this._instances = [];
		this.logger = logger;
	}

	get instances() { return this._instances.slice(0); }

	create_instance(callback) {
		let config = _.extend({}, this.tor_config)
		let instance = new TorProcess(this.tor_path, config, this.logger);
		instance.create((error) => {
			if (error) return callback(error);
			this._instances.push(instance);

			instance.once('error', callback)
			instance.once('ready', () => {
				callback && callback(null, instance);
			});
		});
	}

	create(instances, callback) {
		if (!Number(instances)) return callback(null, []);
		async.map(Array.from(Array(Number(instances))), (nothing, next) => {
			this.create_instance(next);
		}, (callback || (() => {})));
	}

	remove(instances, callback) {
		let instances_to_remove = this._instances.splice(0, instances);
		async.each(instances_to_remove, (instance, next) => {
			instance.exit(next);
		}, callback);
	}

	next() {
		this._instances = this._instances.rotate(1);
		return this.instances[0];
	}

	exit() {
		this.instances.forEach((tor) => tor.exit());
	}

	new_ips() {
		this.instances.forEach((tor) => tor.new_ip());
	}
};

module.exports = TorPool;