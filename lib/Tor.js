'use strict';

const ejs = require('ejs');
const shell = require('shelljs');
const _ = require('lodash');
const DockerPool = require('./DockerPool');
const child = require('child_process');
const uuid = require('uuid');
const es = require('event-stream');
const base32 = require('base32');
const winston = require('winston');
const temp = require('temp');
const async = require('async')
const fs = require('fs');

temp.track();

const Tor = (function () {
	const TOR_IMAGE = 'znetstar/tor';
	const NAME = Symbol('name');
	const CONTAINER = Symbol('container');
	const LOG_MESSAGES = Symbol('log messages');
	const LOG_MESSAGE = '[Tor Client <%= id %>]: <%= message %>';
	return class Tor {
		constructor(options, pool, log, data_dir) {
			if (!pool) {
				pool = new DockerPool();
			}
			if (!(pool instanceof DockerPool)) {
				throw new Error('Second argument is not a DockerPool');
			}
			this.pool = pool;
			this.data_dir = data_dir || temp.mkdirSync();
			this.docker = pool.host;
			this[LOG_MESSAGES] = !!log;
			this[NAME] = 'tor-'+(function () {
				let buf = new Buffer(16);
				uuid.v4(null, buf, 0);
				return base32.encode(buf);
			})();

		}

		get container() {
			if (this[CONTAINER]) {
				return this[CONTAINER];	
			} else {
				return null;
			}
		}

		srv(callback) {
			var tor = this;
			async.waterfall([
				function ($next) {
					let container = tor[CONTAINER];
					container.inspect($next);
				},
				function (data, $next) {
					let ip = data.NetworkSettings.IPAddress;
					if (!ip || ip === '') {
						return $next(new Error('no ip'));
					}
					$next(null, { host: (ip), port: 9050, dns_port: 9053 });
				}
			], callback)
		}

		create(callback) {
			var tor = this;

			async.waterfall([
				function ($next) {
					temp.open('txt',function (err, file) {
						if (file) {
							fs.write(file.fd, shell.cat(process.cwd()+'/config/torrc'));
							fs.close(file.fd)
						}
						$next(err, (file && file.path));
					});				
				},
				function (path, $next) {
					tor.docker.run(TOR_IMAGE, [], null, { ExposedPorts: { '9050/tcp':{}, '9053/udp':{} } }, { Binds: [ path+':/etc/tor/torrc:ro' ] }, function (error, data, container) {
						container.remove();
					}).on('container', (function (container) {
						var tor = this;

						this[CONTAINER] = container;

						let remove_cont = (function (code) {
							container.stop(function () {
								container.remove(function (err) {
									process.exit();
								});
							});
						})
						process.on('SIGINT', remove_cont);
						process.on('uncaughtException', remove_cont);
						process.on('exit', remove_cont);


						container.attach({ stream: true, stdout: true }, function (err,stream) {
							stream.pipe(es.map(function (data, cb){
								if (tor[LOG_MESSAGES])
									process.stdout.write(ejs.render(LOG_MESSAGE, { id: container.id, message: (data.toString('utf8')) }))
								cb();
							}));
						});

						var srv = null;
						async.until((function () { return srv; }), function ($next) {
							tor.srv(function (err, $srv) {
								srv = $srv;
								setTimeout($next, 1000);
							});
						}, function (err) {
							callback(null, srv);
						});
					}).bind(tor));
				}
			], callback);
		}
	};
})();

module.exports = Tor;