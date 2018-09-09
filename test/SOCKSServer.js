const nconf = require('nconf');
const request = require('request-promise');
const getPort = require('get-port');
const ProxyAgent = require('proxy-agent');

const logger = require('../src/winston-silent-logger');
const { TorPool, SOCKSServer } = require('../');
const { WAIT_FOR_CREATE, PAGE_LOAD_TIME } = require('./constants');

require(`${__dirname}/../src/nconf_load_env.js`)(nconf);		
nconf.defaults(require(`${__dirname}/../src/default_config.js`));

let socksServerTorPool;
let socksServer;
describe('SOCKSServer', function () {
	socksServerTorPool = new TorPool(nconf.get('torPath'), {}, nconf.get('parentDataDirectory'), 'round_robin', null, logger);
	socksServer = new SOCKSServer(socksServerTorPool, logger);
	let socksPort;
	before('start up server', async function (){
		this.timeout(WAIT_FOR_CREATE);

		await socksServerTorPool.create(1);
		socksPort = await getPort();

		socksServer.listen(socksPort);
	});

	describe('#handleConnection(socket)', function () {
		it('should service a request for example.com', async function () {
			this.timeout(PAGE_LOAD_TIME);

			await request({
				url: 'http://example.com',
				agent: new ProxyAgent(`socks://localhost:${socksPort}`)
			});
		});
	});

	after('shutdown tor pool', async function () {
		await socksServerTorPool.exit();
	});
});