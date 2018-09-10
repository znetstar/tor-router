const dns = require('native-dns');
const { UDPServer } = require('native-dns');
const Promise = require('bluebird');

class DNSServer extends UDPServer {
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

	constructor(tor_pool, dns_options, dns_timeout, logger) {
		super(dns_options);
		this.logger = logger || require('./winston-silent-logger');
		this.tor_pool = tor_pool;

		const handle_dns_request = (req, res) => {
			let connect = (tor_instance) => {
				let source = { hostname: req.address.address, port: req.address.port, proto: 'dns' };
				this.emit('instance-connection', tor_instance, source);
				for (let question of req.question) {
					let dns_port = (tor_instance.dns_port);
					let outbound_req = dns.Request({
						question,
						server: { address: '127.0.0.1', port: dns_port, type: 'udp' },
						timeout: dns_timeout
					});

					this.logger.verbose(`[dns]: ${source.hostname}:${source.port} → 127.0.0.1:${dns_port}${tor_instance.definition.Name ? ' ('+tor_instance.definition.Name+')' : '' }`);

					outbound_req.on('message', (err, answer) => {
						if (!err && answer) {
							for (let a of answer.answer){
								res.answer.push(a);
							}
						}
					});	

					outbound_req.on('error', (err) => {
						this.logger.error(`[dns]: an error occured while handling ar request: ${err.message}`);
					});


					outbound_req.on('end', () => {
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
		this.on('request', handle_dns_request);
	}
};

module.exports = DNSServer;