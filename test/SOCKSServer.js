const nconf = require('nconf');
const request = require('request-promise');
const getPort = require('get-port');
const ProxyAgent = require('proxy-agent');

const { TorPool, SOCKSServer } = require('../');
const { WAIT_FOR_CREATE, PAGE_LOAD_TIME } = require('./constants');

nconf.use('memory');
require(`${__dirname}/../src/nconf_load_env.js`)(nconf);		
nconf.defaults(require(`${__dirname}/../src/default_config.js`));

let socksServerTorPool;
let socksServer;
describe('SOCKSServer', function () {
	socksServerTorPool = new TorPool(nconf.get('torPath'), {}, nconf.get('parentDataDirectory'), 'round_robin', null);
	socksServer = new SOCKSServer(socksServerTorPool);
	let socksPort;
	before('start up server', async function (){
		this.timeout(WAIT_FOR_CREATE);

		await socksServerTorPool.create(1);
		socksPort = await getPort();

		await socksServer.listen(socksPort);
	});

	describe('#handleConnection(socket)', function () {
		it('should service a request for example.com', async function () {
			this.timeout(PAGE_LOAD_TIME);

			await request({
				url: 'http://example.com',
				agent: new ProxyAgent(`socks://127.0.0.1:${socksPort}`)
			});
		});
	});

	after('shutdown tor pool', async function () {
		await socksServerTorPool.exit();
	});
});