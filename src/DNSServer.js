const dns = require('native-dns');
const { UDPServer, Request } = dns;
const Promise = require('bluebird');

/**
 * A DNS proxy server that will route requests to instances in the TorPool provided.
 * @extends UDPServer
 */
class DNSServer extends UDPServer {
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
		let args = Array.from(arguments);
		let inner_func = super.serve;

		if (!args[1])
			args[1] = null;

		return await new Promise((resolve, reject) => {
			args.push(() => {
				let args = Array.from(arguments);
				resolve.apply(args);
			});

			try {
				inner_func.apply(this, args);
			} catch (error) {
				reject(error);
			}
		});
	}

	/**
	 * Creates an instance of `DNSServer`.
	 * @param {TorPool} tor_pool - The pool of instances that will be used for requests.
	 * @param {Object} [dns_options] - Options that will be passed to the parent constructor.
	 * @param {number} dns_timeout - How long to wait before each outbound DNS request before timing out.
	 * @param {Logger} [logger] - Winston logger that will be used for logging. If not specified will disable logging.
	 */
	constructor(tor_pool, dns_options, dns_timeout, logger) {
		/**
		 * Handles an incoming DNS request.
		 * 
		 * @function handle_request
		 * @param {Request} req - Incoming DNS request.
		 * @param {Response} res - Outgoing DNS response.
		 * @private
		 */
		const handle_request = (req, res) => {
			let connect = (tor_instance) => {
				for (let question of req.question) {
					let dns_port = (tor_instance.dns_port);
					let outbound_req = Request({
						question,
						server: { address: '127.0.0.1', port: dns_port, type: 'udp' },
						timeout: this.dns_timeout
					});

					outbound_req.on('message', (err, answer) => {
						if (!err && answer) {
							for (let a of answer.answer){
								res.answer.push(a);
							}
						}
					});	

					outbound_req.on('error', (err) => {
						this.logger.error(`[dns]: an error occured while handling the request: ${err.message}`);
					});


					outbound_req.on('end', () => {
						let source = { hostname: req.address.address, port: req.address.port, proto: 'dns' };
						/**
						 * Fires when the proxy has made a connection through an instance.
						 * 
						 * @event DNSServer#instance-connection
						 * @param {TorProcess} instance - Instance that has been connected to.
						 * @param {InstanceConnectionSource} source - Details on the source of the connection.
						 */
						this.emit('instance_connection', tor_instance, source);
						this.logger.verbose(`[dns]: ${source.hostname}:${source.port} → 127.0.0.1:${dns_port}${tor_instance.definition.Name ? ' ('+tor_instance.definition.Name+')' : '' }`);
						res.send();
					});	

					outbound_req.send();
				};
			};
			if (this.tor_pool.instances.length) {
				connect(this.tor_pool.next());
			}
			else {
				this.logger.debug(`[dns]: a connection has been attempted, but no tor instances are live... waiting for an instance to come online`);
				this.tor_pool.once('instance_created', connect);
			}
		};

		super(dns_options);
		/**
		 * Winston logger
		 * @type {Logger}
		 * @public
		 */
		this.logger = logger || require('./winston_silent_logger');

		/**
		 * The pool of instances that will be used for requests.
		 * @type {TorPool}
		 * @public
		 */
		this.tor_pool = tor_pool;

		/**
		 * Timeout for each outbound DNS request
		 * @type {number}
		 * @public
		 */
		this.dns_timeout = dns_timeout;

		this.on('request', handle_request);
	}
};

/**
 * Module that contains the {@link DNSSErver} class.
 * @module tor-router/DNSServer
 * @see DNSServer
 */
module.exports = DNSServer;