const nconf = require('nconf');
const request = require('request-promise');
const getPort = require('get-port');
const ProxyAgent = require('proxy-agent');

const { TorPool, HTTPServer } = require('../');
const { WAIT_FOR_CREATE, PAGE_LOAD_TIME } = require('./constants');

nconf.use('memory');
require(`${__dirname}/../src/nconf_load_env.js`)(nconf);		
nconf.defaults(require(`${__dirname}/../src/default_config.js`));

let httpServerTorPool;
let httpServer;
describe('HTTPServer', function () {
	httpServerTorPool = new TorPool(nconf.get('torPath'), {}, nconf.get('parentDataDirectory'), 'round_robin', null);
	httpServer = new HTTPServer(httpServerTorPool);
	let httpPort;
	before('start up server', async function (){
		this.timeout(WAIT_FOR_CREATE);

		await httpServerTorPool.create(1);
		httpPort = await getPort();

		await httpServer.listen(httpPort);
	});

	describe('#handle_http_connections(req, res)', function () {
		it('should service a request for example.com', async function () {
			this.timeout(PAGE_LOAD_TIME);

			await request({
				url: 'http://example.com',
				agent: new ProxyAgent(`http://127.0.0.1:${httpPort}`)
			});
		});
	});

	describe('#handle_connect_connections(req, inbound_socket, head)', function () {
		it('should service a request for example.com', async function () {
			this.timeout(PAGE_LOAD_TIME);

			await request({
				url: 'https://example.com',
				agent: new ProxyAgent(`http://127.0.0.1:${httpPort}`)
			});
		});
	});

	after('shutdown tor pool', async function () {
		await httpServerTorPool.exit();
	});
});
