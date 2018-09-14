const socks = require('socksv5');
const Promise = require('bluebird');
const { Server } = socks;

/** 
 * Configuration for the "proxy by name" feature (connecting to specific instances or groups of instances using the username field when connecting).
 * @typedef ProxyByNameConfig
 * 
 * @property {boolean} [deny_unidentified_users=false] - Deny unauthenticated (e.g. no username - socks://my-server:9050) users access to the proxy server.
 * @property {string} mode - Either "group" for routing to a group of instances or "individual" for routing to individual instances.
 */

/**
 * Details on the source of a connection the proxy server.
 * @typedef InstanceConnectionSource
 * @property {string} hostname - Hostname where the connection was made from.
 * @property {number} port - Port where the connection was made from.
 * @property {boolean} by_name - Indicates whether the connection was made using a username (made to a specific instance or group of instances).
 * @property {string} proto - The protocol of the connection "socks", "http", "http-connect" or "dns"
 */

/**
 * A SOCKS5 proxy server that will route requests to instances in the TorPool provided.
 * @extends Server
 */
class SOCKSServer extends Server{
	/**
	 * Callback for `authenticate_user`.
	 * @callback SOCKSServer~authenticate_user_callback
	 * @param {boolean} allow - Indicates if the connection should be allowed.
	 * @param {boolean} user - Indicates if the connection should have a session (authentication was successful).
	 */

	/**
	 * Binds the server to a port and IP Address.
	 * 
	 * @async
	 * @param {number} port - The port to bind to.
	 * @param {string} [host="::"] - Address to bind to. Will default to :: or 0.0.0.0 if not specified.
	 * @returns {Promise}
	 * 
	*/
	async listen() {
		return await new Promise((resolve, reject) => {
			let args = Array.from(arguments);
			let inner_func = super.listen;
			args.push(() => {
				let args = Array.from(arguments);
				resolve.apply(args);
			});
			inner_func.apply(this, args);
		});
	}

	/**
	 * Retrieves an instance from the pool or an instance from a group by the name provided.
	 * @param {string} username - Name of the group or instance to route to.
	 * @returns {TorProcess}
	 * @throws If {@link SOCKSServer#proxy_by_name} is set to an invalid value.
	 * @throws If the name of the instance or group provided is invalid.
	 * @private
	 */
	get_instance_pbn(username) {
		if (this.proxy_by_name.mode === 'individual') 
			return this.tor_pool.instance_by_name(username);
		else if (this.proxy_by_name.mode === 'group') {
			return this.tor_pool.next_by_group(username);
		} else 
			throw Error(`Unknown "proxy_by_name" mode ${this.proxy_by_name.mode}`);
	}

	/**
	 * Checks the username provided against all groups (for "group" mode) or all instances (for "individual" mode).
	 * @param {string} username 
	 * @param {string} password 
	 * @param {SOCKSServer~authenticate_user_callback} callback - Callback for `authenticate_user`.
	 * @throws If {@link SOCKSServer#proxy_by_name} is invalid.
	 * @private
	 */
	authenticate_user(username, password, callback) {
		let deny_un = this.proxy_by_name.deny_unidentified_users;
		
		// No username and deny unindentifed then deny
		if (!username && deny_un) callback(false);
		// Otherwise if there is no username allow
		else if (!username) callback(true);

		if (this.proxy_by_name.mode === 'individual'){
			if (!this.tor_pool.instance_names.includes(username)) return callback(false);
		} 
		else if (this.proxy_by_name.mode === 'group') {
			if (!this.tor_pool.group_names.has(username)) return callback(false);
		}
		else 
			throw Error(`Unknown "proxy_by_name" mode "${this.proxy_by_name.mode}"`);

		// Otherwise allow
		callback(true, true);
	}

	/**
	 * Creates an instance of `SOCKSServer`.
	 * @param {TorPool} tor_pool - The pool of instances that will be used for requests
	 * @param {Logger} [logger] - Winston logger that will be used for logging. If not specified will disable logging.
	 * @param {ProxyByNameConfig} [proxy_by_name] - Enable routing to specific instances or groups of instances using the username field (socks://instance-1:@my-server:9050) when connecting.  
	 */
	constructor(tor_pool, logger, proxy_by_name) {
		/**
		 * Handles SOCKS5 inbound connections.
		 * 
		 * @function handle_connections
		 * @param {object} info - Information about the inbound connection.
		 * @param {Function} accept - Callback that allows the connection.
		 * @param {Function} deny - Callback that denies the connection.
		 * @private
		 */
		const handle_connections = (info, accept, deny) => {
			let inbound_socket = accept(true);
			let instance;

			if (inbound_socket.user)
				instance = this.get_instance_pbn(inbound_socket.user);

			let outbound_socket;
			let buffer = [];

			let onInboundData = (data) => buffer.push(data)
			
			let onClose = (error) => {
				inbound_socket && inbound_socket.end();
				outbound_socket && outbound_socket.end();

				inbound_socket = outbound_socket = buffer = void(0);

				if (error)
					this.logger.error(`[socks]: an error occured: ${error.message}`)
			};

			if (!inbound_socket) return;

			inbound_socket.on('close', onClose);
			inbound_socket.on('data', onInboundData);	
			inbound_socket.on('error', onClose);

			let connect = (tor_instance) => {
				let source = { hostname: info.srcAddr, port: info.srcPort, proto: 'socks', by_name: Boolean(instance) };
				let socks_port = tor_instance.socks_port;

				socks.connect({
					host: info.dstAddr,
					port: info.dstPort,
					proxyHost: '127.0.0.1',
					proxyPort: socks_port,
					localDNS: false,
					auths: [ socks.auth.None() ]
				}, ($outbound_socket) => {
					/**
					 * Fires when the proxy has made a connection through an instance.
					 * 
					 * @event SOCKSServer#instance-connection
					 * @param {TorProcess} instance - Instance that has been connected to.
					 * @param {InstanceConnectionSource} source - Details on the source of the connection.
					 */
					this.emit('instance_connection', tor_instance, source);
					this.logger.verbose(`[socks]: ${source.hostname}:${source.port} → 127.0.0.1:${socks_port}${tor_instance.definition.Name ? ' ('+tor_instance.definition.Name+')' : '' } → ${info.dstAddr}:${info.dstPort}`)

					outbound_socket = $outbound_socket;
					outbound_socket && outbound_socket.on('close', onClose);

					inbound_socket && inbound_socket.removeListener('data', onInboundData);
					inbound_socket &&  inbound_socket.on('data', (data) => {
						outbound_socket && outbound_socket.write(data);
					});

					outbound_socket && outbound_socket.on('data', (data) => {
						inbound_socket && inbound_socket.write(data);
					});

					outbound_socket && outbound_socket.on('error', onClose);

					while (buffer && buffer.length && outbound_socket) {
						outbound_socket.write(buffer.shift());
					}
				});
			};
			
			if (instance) {
				if (instance.ready) {
					connect(instance);
				}
				else {
					this.logger.debug(`[socks]: a connection has been attempted to "${instance.instance_name}", but it is not live... waiting for the instance to come online`);
					instance.once('ready', (() => connect(instance)));
				}
			}
			else if (this.tor_pool.instances.length) {
				connect(this.tor_pool.next());
			} else {
				this.logger.debug(`[socks]: a connection has been attempted, but no tor instances are live... waiting for an instance to come online`);
				this.tor_pool.once('instance_created', connect);
			}
		}
		super(handle_connections);

		let auth = socks.auth.None();
		
		if (proxy_by_name) {
			auth = socks.auth.UserPassword(this.authenticate_user.bind(this));
		}

		this.useAuth(auth);
		
		/**
		 *  Winston logger to use. 
		 * 
		 * @type {Logger}
		 * @public  
		 */
		this.logger = logger || require('./winston_silent_logger');
		/**
		 *  Pool of instances use to service requests.
		 * 
		 * @type {TorPool}
		 * @public  
		 */
		this.tor_pool = tor_pool;
		/**
		 *  Configuration for the "proxy by name" feature.
		 * 
		 * @type {ProxyByNameConfig}
		 * @public  
		 */
		this.proxy_by_name = proxy_by_name;
		this.logger.debug(`[socks]: connecting to a specific instance by name has ben turned ${proxy_by_name ? 'on' : 'off'}`);
	}
};

/**
 * Module that contains the {@link SOCKSServer} class.
 * @module tor-router/SOCKSServer
 * @see SOCKSServer
 */
module.exports = SOCKSServer;