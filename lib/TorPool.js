'use strict';

const ejs = require('ejs');
const shell = require('shelljs');
const _ = require('lodash');
const Tor = require('./Tor');
const async = require('async');

const TorPool = (function () {
	const HOSTS = Symbol('hosts');
	const NUM_SERVERS = Symbol('num');
	const DOCKER_POOL = Symbol('pool');
	const TORS = Symbol('tors');
	return class TorPool {
		constructor(num, docker_pool) {
			num = num || 1;
			this[DOCKER_POOL] = docker_pool;
			this[NUM_SERVERS] = num;
			this[HOSTS] = [];
			this[TORS] = [];
		}
		start(callback) {
			let range = ((size) => Array.from(Array(size).keys()));
			let srv_array = range(this[NUM_SERVERS]);
			this[TORS] = [];
			var pool = this;
			async.map(srv_array, function (index, next) {
				let tor = new Tor({}, pool[DOCKER_POOL]);
				pool[TORS].push(tor);
				tor.create(function (err) {
					if (err) {
						return next(err);
					}
					tor.srv(next);
				});
			}, function (err, srvs){
				pool[HOSTS] = srvs;
				callback(err, pool.hosts);
			});
		}
		rotate(num) {
			num = num || 1;
			this[HOSTS].unshift.apply( this[HOSTS], this[HOSTS].splice( num, this[HOSTS].length ) );
			return this[HOSTS];
		}
		get hosts() {
			return this[HOSTS];
		}
		next() {
			this.rotate(1);
			return this.hosts[0];
		}
		valueOf() {
			return this.next();
		}
		get host() {
			return this.next();
		}
	};
})();

module.exports = TorPool;