const dns = require('native-dns');
const UDPServer = require('native-dns').UDPServer;

class DNSServer extends UDPServer {
	constructor(tor_pool, options, timeout) {
		super(options || {});

		this.tor_pool = tor_pool;

		this.on('request', (req, res) => {
			for (let question of req.question) {
				
				let outbound_req = dns.Request({
					question,
					server: { address: '127.0.0.1', port: (tor_pool.next().dns_port), type: 'udp' },
					timeout: this.timeout
				});

				outbound_req.on('message', (err, answer) => {
					if (!err && answer)
						answer.answer.forEach((a) => res.answer.push(a));	
				});	

				outbound_req.on('error', (err) => {

				});


				outbound_req.on('end', () => {
					res.send();
				});	

				outbound_req.send();
			}
		});
	}
};

module.exports = DNSServer;