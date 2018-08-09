const dns = require('native-dns');
const UDPServer = require('native-dns').UDPServer;

class DNSServer extends UDPServer {
	constructor(tor_pool, dns_options, dns_timeout, logger) {
		super(dns_options);
		this.logger = logger;
		this.tor_pool = tor_pool;

		this.on('request', (req, res) => {
			let connect = (tor_instance) => {
				for (let question of req.question) {
					let dns_port = (tor_instance.dns_port);
					let outbound_req = dns.Request({
						question,
						server: { address: '127.0.0.1', port: dns_port, type: 'udp' },
						timeout: dns_timeout
					});

					outbound_req.on('message', (err, answer) => {
						if (!err && answer) {
							for (let a of answer.answer){
								res.answer.push(a);
								this.logger.verbose(`[dns]: ${question.name} type ${dns.consts.QTYPE_TO_NAME[question.type]} → 127.0.0.1:${dns_port}${tor_instance.definition.Name ? ' ('+tor_instance.definition.Name+')' : '' } → ${a.address}`)
							}
						}
					});	

					outbound_req.on('error', (err) => {

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
		});
	}
};

module.exports = DNSServer;