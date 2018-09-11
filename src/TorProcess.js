const spawn = require('child_process').spawn;
const fs = require('fs');
const crypto = require('crypto');
const { connect } = require('net');
const os = require('os');

const Promise = require('bluebird');
const _ = require('lodash');
const { EventEmitter } = require('eventemitter3');
const shell = require('shelljs');

const getPort = require('get-port');
const del = require('del');
const temp = require('temp');
const { TorController } = require('granax');

Promise.promisifyAll(temp);
Promise.promisifyAll(fs);

temp.track();

class TorProcess extends EventEmitter {
	constructor(tor_path, definition, granax_options, logger) {
		super();
		this.logger = logger || require('./winston-silent-logger');

		definition.Group = definition.Group ? [].concat(definition.Group) : [];

		this._definition = definition;

		this.tor_path = tor_path;
		this.granax_options = granax_options;
		this.control_password = crypto.randomBytes(128).toString('base64');

		this.tor_config.DataDirectory = this.tor_config.DataDirectory || temp.mkdirSync();
	}

	async exit() {
		let p = new Promise((resolve, reject) => {
			this.once('process_exit', (code) => {
				resolve();
			});
		});
		this.process.kill('SIGINT');
		
		await p;
	}

	get instance_group() {
		return (this.definition && this.definition.Group) || null;
	}

	get instance_name() {
		return (this.definition && this.definition.Name) || this.process.pid;
	}

	get definition() { return this._definition; }

	get tor_config() { return this.definition.Config; }

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

	get ready() { return this._ready; }

	/* Passthrough to granax */

	async new_identity() {
		this.logger.info(`[tor-${this.instance_name}]: requested a new identity`);
		
		await this.controller.cleanCircuitsAsync();
	}

	async get_config(keyword) {
		if (!this.controller)
			throw new Error(`Controller is not connected`);

		return await this.controller.getConfigAsync(keyword);
	}

	async set_config(keyword, value) {
		if (!this.controller) {
			return new Error(`Controller is not connected`);
		}

		return await this.controller.setConfigAsync(keyword, value);
	}

	async signal(signal) {
		if (!this.controller) {
			throw new Error(`Controller is not connected`);
		}

		return await this.controller.signal(signal);
	}

	async create() {
		let dnsPort = this._dns_port = await getPort();
		let socksPort = this._socks_port =  await getPort();
		let controlPort = this._control_port = await getPort();

		let options = {
			DNSPort: `127.0.0.1:${dnsPort}`,
			SocksPort: `127.0.0.1:${socksPort}`,
			ControlPort: `127.0.0.1:${controlPort}`,
			HashedControlPassword: shell.exec(`${this.tor_path} --quiet --hash-password "${this.control_password}"`, { async: false, silent: true }).stdout.trim()
		};

		let config = _.extend(_.cloneDeep(this.tor_config), options);
		let text = Object.keys(config).map((key) => `${key} ${config[key]}`).join(os.EOL);

		let configFile = await temp.openAsync('tor-router');
		let configPath = configFile.path;
		await fs.writeFileAsync(configPath, text);

		let tor = spawn(this.tor_path, ['-f', configPath], {
			stdio: ['ignore', 'pipe', 'pipe'],
			detached: false
		});

		tor.on('close', (code) => {
			this.emit('process_exit', code);
			if (this.definition && !this.definition.Name) {
				del(this.tor_config.DataDirectory, { force: true });
			}
		});

		tor.stderr.on('data', (data) => {
			let error_message = Buffer.from(data).toString('utf8');

			this.emit('error', new Error(error_message));
		});

		this.once('ready', () => {
			this._ready = true;
			this.logger.info(`[tor-${this.instance_name}]: tor is ready`);
		});

		this.on('control_listen', () => {
			this._controller = new TorController(connect(this._control_port), _.extend({ authOnConnect: false }, this.granax_options));
			Promise.promisifyAll(this._controller);

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
		
		return tor;
	}
};

module.exports = TorProcess;