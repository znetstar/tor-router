const socks = require('socksv5');
const Promise = require('bluebird');
const { Server } = socks;

class SOCKSServer extends Server{
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

	authenticate_user(username, password, callback) {
		let deny_un = this.proxy_by_name.deny_unidentified_users;

		// No username and deny unindentifed then deny
		if (!username && deny_un) callback(false);
		// Otherwise if there is no username allow
		else if (!username) callback(true);
		
		this.logger.verbose(`[socks]: connected attempted to instance "${username}"`);

		let instance = this.tor_pool.instance_by_name(username);

		// If a username is specified but no instances match that username deny
		if (!instance) 
			return callback(false);

		// Otherwise allow
		callback(true, true);
	}

	constructor(tor_pool, logger, proxy_by_name) {
		let handleConnection = (info, accept, deny) => {
			let inbound_socket = accept(true);
			let instance;

			if (inbound_socket.user)
				instance = this.tor_pool.instance_by_name(inbound_socket.user);

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
				this.emit('instance-connection', tor_instance, source);
				this.logger.verbose(`[socks]: ${source.hostname}:${source.port} → 127.0.0.1:${socks_port}${tor_instance.definition.Name ? ' ('+tor_instance.definition.Name+')' : '' } → ${info.dstAddr}:${info.dstPort}`)

				socks.connect({
					host: info.dstAddr,
					port: info.dstPort,
					proxyHost: '127.0.0.1',
					proxyPort: socks_port,
					localDNS: false,
					auths: [ socks.auth.None() ]
				}, ($outbound_socket) => {
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
		};

		super(handleConnection);

		let auth = socks.auth.None();
		
		if (proxy_by_name) {
			auth = socks.auth.UserPassword(this.authenticate_user.bind(this));
		}

		this.useAuth(auth);
		
		this.logger = logger || require('./winston-silent-logger');
		this.tor_pool = tor_pool;
		this.proxy_by_name = proxy_by_name;
		this.logger.debug(`[socks]: connecting to a specific instance by name has ben turned ${proxy_by_name ? 'on' : 'off'}`);
	}
};

module.exports = SOCKSServer;