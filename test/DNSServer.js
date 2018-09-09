
const nconf = require('nconf');
const getPort = require('get-port');
const dns = require('native-dns');

const { TorPool, DNSServer } = require('../');
const { WAIT_FOR_CREATE } = require('./constants');

nconf.use('memory');
require(`${__dirname}/../src/nconf_load_env.js`)(nconf);		
nconf.defaults(require(`${__dirname}/../src/default_config.js`));

let dnsServerTorPool;
let dnsServer;
describe('DNSServer', function () {
	dnsServerTorPool = new TorPool(nconf.get('torPath'), {}, nconf.get('parentDataDirectory'), 'round_robin', null);
	dnsServer = new DNSServer(dnsServerTorPool, {}, 10000);
	let dnsPort;
	before('start up server', async function (){
		this.timeout(WAIT_FOR_CREATE);

		await dnsServerTorPool.create(1);
		dnsPort = await getPort();

		await dnsServer.listen(dnsPort);
	});

	describe('#handle_dns_request(req, res)', function () {
		it('should service a request for example.com', function (done) {
			this.timeout(10000);

			let req = dns.Request({
				question: dns.Question({
					name: 'example.com',
					type: 'A'
				}),
				server: { address: '127.0.0.1', port: dnsPort, type: 'udp' },
				timeout: 10000,
			});

			req.on('timeout', function () {
				done(new Error('Connection timed out'));
			});

			req.on('message', function () {
				done();
			});

			req.send();
		});
	});

	after('shutdown tor pool', async function () {
		await dnsServerTorPool.exit();
	});
});