const spawn = require('child_process').spawn;
const _ = require('lodash');
const temp = require('temp');
const async = require('async');
const fs = require('fs');
const getPort = require('get-port');
const EventEmitter = require('eventemitter2').EventEmitter2;

temp.track();

class TorProcess extends EventEmitter {
	constructor(tor_path, config, logger) {
		super();

		this.tor_path = tor_path || 'tor';
		this.logger = logger;

		this.tor_config = _.extend({ 
			Log: 'notice stdout',
			DataDirectory: temp.mkdirSync(),
			NewCircuitPeriod: '10'
		}, (config || { }));
	}

	exit(callback) {
		this.process.once('exit', (code) => {
			callback && callback(null, code);
		});
		this.process.kill('SIGKILL');

	}

	new_ip() {
		this.logger.info(`[tor-${this.process.pid}]: has requested a new identity`);
		this.process.kill('SIGHUP');
	}

	get dns_port() {
		return this._dns_port || null;
	}

	get socks_port() {
		return this._socks_port || null;
	}

	create(callback) {
		async.auto({
			dnsPort: (callback) => getPort().then(port => callback(null, port)),
			socksPort: (callback) => getPort().then(port => callback(null, port)),
			configPath: ['dnsPort', 'socksPort', (context, callback) => {
				let options = {
					DNSPort: `127.0.0.1:${context.dnsPort}`,
					SocksPort: `127.0.0.1:${context.socksPort}`,
				};
				let config = _.extend(_.extend({}, this.tor_config), options);
				let text = Object.keys(config).map((key) => `${key} ${config[key]}`).join("\n");
				
				temp.open('tor-router', (err, info) => {
					if (err) return callback(err);

					fs.writeFile(info.path, text, (err) => {
						callback(err, info.path);
					});
				});
			}]
		}, (error, context) => {
			if (error) callback(error);

			this._dns_port = context.dnsPort;
			this._socks_port = context.socksPort;

			let tor = spawn(this.tor_path, ['-f', context.configPath], {
				stdio: ['ignore', 'pipe', 'pipe'],
				detached: false,
				shell: '/bin/bash'
			});

			tor.stderr.on('data', (data) => {
				let error_message = Buffer.from(data).toString('utf8');

				this.emit('error', new Error(error_message));
			});

			this.once('ready', () => {
				this.ready = true;
				this.logger && this.logger.info(`[tor-${tor.pid}]: tor is ready`);
			});

			tor.stdout.on('data', (data) => {
				let text = Buffer.from(data).toString('utf8');
				let msg = text.split('] ').pop();
				if (text.indexOf('Bootstrapped 100%: Done') !== -1){
					this.emit('ready');
				}

				if (text.indexOf('[err]') !== -1) {
					this.emit('error', new Error(msg));
					this.logger && this.logger.error(`[tor-${tor.pid}]: ${msg}`);
				}

				else if (text.indexOf('[notice]') !== -1) {
					this.logger && this.logger.debug(`[tor-${tor.pid}]: ${msg}`);
				}

				else if (text.indexOf('[warn]') !== -1) {
					this.logger && this.logger.warn(`[tor-${tor.pid}]: ${msg}`);
				}
			});

			this.process = tor;
			callback && callback(null, tor);
		});
	}
};

module.exports = TorProcess;