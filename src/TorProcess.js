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
const nanoid = require("nanoid");
const winston = require('winston');
winston.
Promise.promisifyAll(temp);
Promise.promisifyAll(fs);

temp.track();

/**
 * Class that represents an individual Tor process.
 * @extends EventEmitter
 */
class TorProcess extends EventEmitter {
	/**
	 * Creates a TorProcess Object
	 * 
	 * @param {String} tor_path - Path to the Tor executable.
	 * @param {Object} [definition={}] - Object containing various options for the instance. See {@link https://github.com/znetstar/tor-router/wiki/Configuration|the wiki} for more info
	 * @param {Object} [granax_options] - Object containing options that will be passed to granax
	 * @param {Logger} [logger] - A winston logger used for logging.
	 */
	constructor(tor_path, definition, granax_options, logger) {
		super();
		this.logger = logger || require('./winston-silent-logger');

		definition = definition || {};
		definition.Group = definition.Group ? [].concat(definition.Group) : [];

		this._definition = definition;

		this.tor_path = tor_path;
		this.granax_options = granax_options;
		this.control_password = crypto.randomBytes(128).toString('base64');
		this._id = nanoid(12);

		this.tor_config.DataDirectory = this.tor_config.DataDirectory || temp.mkdirSync();
	}

	/**
	 * Kills the Tor process
	 * 
	 * @async
	 * @returns {Promise}
	 */
	async exit() {
		let p = new Promise((resolve, reject) => {
			this.once('process_exit', (code) => {
				resolve();
			});
		});

		this.process.kill('SIGINT');
		
		await p;
	}

	/**
	 * The unique identifier assigned to each instance
	 * 
	 * @readonly
	 * @returns {String}
	 */
	get id() { return this._id; }

	/**
	 * Groups the instance are currently in
	 * 
	 * @readonly
	 * @returns {String[]}
	 */
	get instance_group() {
		return (this.definition && this.definition.Group) || [];
	}

	/**
	 * Either the "Name" property of the definition or the "id" property
	 * 
	 * @readonly
	 * @returns {String}
	 */
	get instance_name() {
		return (this.definition && this.definition.Name) || this.id;
	}

	/**
	 * The definition used to create the instance
	 * 
	 * @readonly
	 * @returns {String}
	 */
	get definition() { return this._definition; }

	/**
	 * The configuration passed to Tor. The same value as "definition.Config"
	 * 
	 * @readonly
	 * @returns {Object}
	 */
	get tor_config() { return this.definition.Config; }

	/**
	 * Port Tor is bound to for DNS traffic
	 * 
	 * @readonly
	 * @returns {Number}
	 */
	get dns_port() {
		return this._ports.dns_port;
	}

	/**
	 * Port Tor is bound to for SOCKS5 traffic
	 * 
	 * @readonly
	 * @returns {Number}
	 */
	get socks_port() {
		return this._ports.socks_port;
	}

	/**
	 * Port Tor is bound to for API access 
	 * 
	 * @readonly
	 * @returns {Number}
	 */
	get control_port() {
		return this._ports.control_port;
	}

	/**
	 * Instance of granax connected to the Tor process
	 * 
	 * @readonly
	 * @returns {Object}
	 */
	get controller() {
		return this._controller;
	}

	/**
	 * Property identifiyng whether Tor has started 
	 * 
	 * @readonly
	 * @returns {Boolean}
	 */
	get ready() { return this._ready; }

	/* Passthrough to granax */

	/**
	 * Requests a new identity via the control interface
	 * 
	 * @async
	 */
	async new_identity() {
		this.logger.info(`[tor-${this.instance_name}]: requested a new identity`);
		
		await this.controller.cleanCircuitsAsync();
	}

	/**
	 * Retrieves a configuration value from the instance via the control interface
	 * 
	 * @async
	 * @param {String} keyword - The name of the configuration property to retrieve
	 * 
	 * @returns {Promise<String[]>}
	 */
	async get_config(keyword) {
		if (!this.controller)
			throw new Error(`Controller is not connected`);

		return await this.controller.getConfigAsync(keyword);
	}

	/**
	 * Sets a configuration value for the instance via the control interface
	 * 
	 * @async
	 * @param {String} keyword - The name of the configuration property to retrieve
	 * @param value - Value to set the property to
	 * 
	 * @returns {Promise}
	 */
	async set_config(keyword, value) {
		if (!this.controller) {
			return new Error(`Controller is not connected`);
		}

		return await this.controller.setConfigAsync(keyword, value);
	}

	/**
	 * Sends a signal via the control tnterface
	 * 
	 * @async
	 * @param {String} signal - The signal to send
	 * 
	 * @returns {Promise}
	 */
	async signal(signal) {
		if (!this.controller) {
			throw new Error(`Controller is not connected`);
		}

		return await this.controller.signal(signal);
	}

	/**
	 * Creates the Tor process based on the configuration provided. Promise is resolved when the process has been started
	 * 
	 * @async
	 * 
	 * @returns {Promise<ChildProcess>} - The process that has been created
	 */
	async create() {
		this._ports = {};
		let dnsPort = this._ports.dns_port = await getPort();
		let socksPort = this._ports.socks_port =  await getPort();
		let controlPort = this._ports.control_port = await getPort();
		Object.freeze(this._ports);

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

		tor.on('close', (async (code) => {
			if (this.definition && !this.definition.Name) {
				await del(this.tor_config.DataDirectory, { force: true });
			}
			
			/**
			 * An event that fires when the process has closed
			 * 
			 * @event TorProcess#process_exit
			 * @type {Number}
			 * @returns {Number} - The exit code from the process
			 */
			this.emit('process_exit', code);
		}));

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
						/**
						 * An event that fires when a connection has been established to the control interface
						 * 
						 * @event TorProcess#controller_ready
						 */
						this.emit('controller_ready');
					}
				});
			});
		});

		tor.stdout.on('data', (data) => {
			let text = Buffer.from(data).toString('utf8');
			let msg = text.indexOf('] ') !== -1 ? text.split('] ').pop() : null;
			if (text.indexOf('Bootstrapped 100%: Done') !== -1){
				this.bootstrapped = true;
				/**
				 * An event that fires when the Tor process is fully bootstrapped (and ready for traffic)
				 * 
				 * @event TorProcess#ready
				 */
				this.emit('ready');
			}

			if (text.indexOf('Opening Control listener on') !== -1) {
				this.control_port_listening = true;
				/**
				 * An event that fires when the Tor process has started listening for control interface traffic
				 * 
				 * @event TorProcess#control_listen
				 */
				this.emit('control_listen');
			}

			if (text.indexOf('Opening Socks listener on') !== -1) {
				this.socks_port_listening = true;
				/**
				 * An event that fires when the Tor process has started listening for SOCKS5 traffic
				 * 
				 * @event TorProcess#socks_listen
				 */
				this.emit('socks_listen');
			}

			if (text.indexOf('Opening DNS listener on') !== -1) {
				/**
				 * An event that fires when the Tor process has started listening for DNS traffic
				 * 
				 * @event TorProcess#dns_listen
				 */
				this.dns_port_listening = true;
				this.emit('dns_listen');
			}

			if (text.indexOf('[err]') !== -1) {
				/**
				 * An event that fires the Tor process has written an error to stdout or stderr or an error occured connecting to the control interface
				 * 
				 * @event TorProcess#error
				 * @type {Error}
				 * @returns {Error}
				 */
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