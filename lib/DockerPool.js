'use strict';

const ejs = require('ejs');
const shell = require('shelljs');
const _ = require('lodash');
const Docker = require('dockerode');

const DockerPool = (function () {
	const DEFAULT_DOCKER_OPTIONS = { socketPath: '/var/run/docker.sock' };
	const HOSTS = Symbol('hosts');
	return class DockerPool {
		constructor(hosts) {
			hosts = hosts || DEFAULT_DOCKER_OPTIONS;
			this[HOSTS] = [].concat(hosts);
		}
		rotate(num) {
			num = num || 1;
			this[HOSTS].unshift.apply( this[HOSTS], this[HOSTS].splice( num, this[HOSTS].length ) );
			return this[HOSTS];
		}
		get hosts() {
			return this[HOSTS].map((host) => new Docker(host));
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

module.exports = DockerPool;