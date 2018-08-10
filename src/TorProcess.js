const spawn = require('child_process').spawn;
const _ = require('lodash');
const async = require('async');
const fs = require('fs');
const getPort = require('get-port');
const del = require('del');
const EventEmitter = require('eventemitter2').EventEmitter2;
const temp = require('temp');
const { TorController } = require('granax');
const { connect } = require('net');
const shell = require('shelljs');
const crypto = require('crypto');
temp.track();

class TorProcess extends EventEmitter {
	constructor(tor_path, config, granax_options, logger) {
		super();
		this.logger = logger;
		this.tor_path = tor_path;
		this.granax_options = granax_options;
		this.control_password = crypto.randomBytes(128).toString('base64');

		config.DataDirectory = config.DataDirectory || temp.mkdirSync();

		this.tor_config = config;
	}

	exit(callback) {
		this.once('process_exit', (code) => {
			callback && callback(null, code);
		});
		this.process.kill('SIGINT');
	}


	get instance_name() {
		return (this.definition && this.definition.Name) || this.process.pid;
	}

	get dns_port() {
		return this._dns_port || null;
	}

	get socks_port() {
		return this._socks_port || null;
	}

	get control_port() {
		return this._control_port || null;
	}

	get controller() {
		return this._controller || null;
	}

	/* Passthrough to granax */

	new_identity(callback) {
		this.logger.info(`[tor-${this.instance_name}]: requested a new identity`);
		this.controller.cleanCircuits(callback || (() => {}));
	}

	get_config(keyword, callback) {
		if (!this.controller) {
			return callback(new Error(`Controller is not connected`));
		}

		return this.controller.getConfig(keyword, callback);
	}

	set_config(keyword, value, callback) {
		if (!this.controller) {
			return callback(new Error(`Controller is not connected`));
		}

		return this.controller.setConfig(keyword, value, callback);
	}

	signal(signal, callback) {
		if (!this.controller) {
			return callback(new Error(`Controller is not connected`));
		}

		return this.controller.signal(signal, callback);
	}

	/* Begin Deprecated */

	new_ip(callback) {
		this.logger.warn(`TorProcess.new_ip is deprecated, use TorProcess.new_identity`);
		return this.new_identity(callback);
	}

	/* End Deprecated */

	create(callback) {
		async.auto({
			dnsPort: (callback) => getPort().then(port => callback(null, port)),
			socksPort: (callback) => getPort().then(port => callback(null, port)),
			controlPort: (callback) => getPort().then(port => callback(null, port)),
			configPath: ['dnsPort', 'socksPort', 'controlPort', (context, callback) => {
				let options = {
					DNSPort: `127.0.0.1:${context.dnsPort}`,
					SocksPort: `127.0.0.1:${context.socksPort}`,
					ControlPort: `127.0.0.1:${context.controlPort}`,
					HashedControlPassword: shell.exec(`${this.tor_path} --hash-password "${this.control_password}"`, { async: false, silent: true }).stdout.trim()
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
			if (error) 
				return callback && callback(error);

			this._dns_port = context.dnsPort;
			this._socks_port = context.socksPort;
			this._control_port = context.controlPort;

			let tor = spawn(this.tor_path, ['-f', context.configPath], {
				stdio: ['ignore', 'pipe', 'pipe'],
				detached: false
			});


			tor.on('close', (code) => {
				this.emit('process_exit', code);
				if (this.definition && !this.definition.Name) {
					del.sync(this.tor_config.DataDirectory, { force: true });
				}
			});

			tor.stderr.on('data', (data) => {
				let error_message = Buffer.from(data).toString('utf8');

				this.emit('error', new Error(error_message));
			});

			this.once('ready', () => {
				this.ready = true;
				this.logger.info(`[tor-${this.instance_name}]: tor is ready`);
			});

			this.on('control_listen', () => {
				this._controller = new TorController(connect(this._control_port), _.extend({ authOnConnect: false }, this.granax_options));
				this.controller.on('ready', () => {
					this.logger.debug(`[tor-${this.instance_name}]: connected to tor control port`);
					this.controller.authenticate(`"${this.control_password}"`, (err) => {
						if (err) {
							this.logger.error(`[tor-${this.instance_name}]: ${err.stack}`);
							this.emit('error', err);
						} else {
							this.logger.debug(`[tor-${this.instance_name}]: authenticated with tor instance via the control port`);
							this.control_port_connected = true;
							this.emit('controller_ready');
						}
					});
				});
			});

			tor.stdout.on('data', (data) => {
				let text = Buffer.from(data).toString('utf8');
				let msg = text.split('] ').pop();
				if (text.indexOf('Bootstrapped 100%: Done') !== -1){
					this.bootstrapped = true;
					this.emit('ready');
				}

				if (text.indexOf('Opening Control listener on') !== -1) {
					this.control_port_listening = true;
					this.emit('control_listen');
				}

				if (text.indexOf('Opening Socks listener on') !== -1) {
					this.socks_port_listening = true;
					this.emit('socks_listen');
				}

				if (text.indexOf('Opening DNS listener on') !== -1) {
					this.dns_port_listening = true;
					this.emit('dns_listen');
				}

				if (text.indexOf('[err]') !== -1) {
					this.emit('error', new Error(msg));
					this.logger.error(`[tor-${this.instance_name}]: ${msg}`);
				}

				else if (text.indexOf('[notice]') !== -1) {
					this.logger.debug(`[tor-${this.instance_name}]: ${msg}`);
				}

				else if (text.indexOf('[warn]') !== -1) {
					this.logger.warn(`[tor-${this.instance_name}]: ${msg}`);
				}
			});

			this.process = tor;
			callback && callback(null, tor);
		});
	}
};

module.exports = TorProcess;