const nconf = require('nconf');
const request = require('request-promise');
const getPort = require('get-port');
const { HttpAgent, auth } = require('socksv5');
const { assert } = require('chai');

const { TorPool, SOCKSServer } = require('../');
const { WAIT_FOR_CREATE, PAGE_LOAD_TIME } = require('./constants');

nconf.use('memory');
require(`${__dirname}/../src/nconf_load_env.js`)(nconf);		
nconf.defaults(require(`${__dirname}/../src/default_config.js`));

describe('SOCKSServer', function () {
	describe('#handleConnection(socket)', function () {
		let socksPort;
		let socksServerTorPool;
		let socksServer;

		before('start up server', async function (){
			socksServerTorPool = new TorPool(nconf.get('torPath'), {}, nconf.get('parentDataDirectory'), 'round_robin', null);
			socksServer = new SOCKSServer(socksServerTorPool, null, false);
	
			this.timeout(WAIT_FOR_CREATE);
	
			await socksServerTorPool.create(1);
			socksPort = await getPort();
	
			await socksServer.listen(socksPort);
		});

		it('should service a request for example.com', async function () {
			this.timeout(PAGE_LOAD_TIME);

			await request({
				url: 'http://example.com',
				agent: new HttpAgent({
					proxyHost: '127.0.0.1',
					proxyPort: socksPort,
					localDNS: false,
					auths: [ auth.None() ]
				})
			});
		});

		after('shutdown server', function () {
			socksServer.close();
		});

		after('shutdown tor pool', async function () {
			socksServer.close();
			await socksServerTorPool.exit();
		});
	});

	describe('#authenticate_user(username, password) - proxy by name', function () {
		let socksPort;
		let socksServerTorPool;
		let socksServer;
		let instance_def = {
			Name: 'instance-3'
		};

		before('start up server', async function (){
			socksServerTorPool = new TorPool(nconf.get('torPath'), {}, nconf.get('parentDataDirectory'), 'round_robin', null);
			socksServer = new SOCKSServer(socksServerTorPool, null, { deny_unidentified_users: true });
	
			this.timeout(WAIT_FOR_CREATE * 3);
			
			await socksServerTorPool.create(2);
			await socksServerTorPool.add(instance_def);

			socksPort = await getPort();
	
			await socksServer.listen(socksPort);
		});

		it(`should service a request for example.com through ${instance_def.Name}`, function (done) {
			this.timeout(PAGE_LOAD_TIME);

			let req;

			socksServer.on('instance-connection', (instance, source) => {
				assert.equal(instance.instance_name, instance_def.Name);
				assert.isTrue(source.by_name);
				req.cancel();
				done();
			});

			req = request({
				url: 'http://example.com',
				agent: new HttpAgent({
					proxyHost: '127.0.0.1',
					proxyPort: socksPort,
					localDNS: false,
					auths: [ auth.UserPassword(instance_def.Name, "doesn't mater") ]
				})
			})
			.catch(done);
		});

		// it(`shouldn't be able to send a request without a username`, async function() {
		// 	let f = () => {};
		// 	try {
		// 		await request({
		// 			url: 'http://example.com',
		// 			agent: new HttpAgent({
		// 				proxyHost: '127.0.0.1',
		// 				proxyPort: socksPort,
		// 				localDNS: false,
		// 				auths: [ auth.None() ]
		// 			}),
		// 			timeout: PAGE_LOAD_TIME
		// 		});
		// 	} catch (error) {
		// 		f = () => { throw error };
		// 	} finally {
		// 		assert.throws(f);
		// 	}
		// });

		// it(`shouldn't be able to send a request with an incorrect username`, async function() {
		// 	let f = () => {};
		// 	try {
		// 		await request({
		// 			url: 'http://example.com',
		// 			agent: new HttpAgent({
		// 				proxyHost: '127.0.0.1',
		// 				proxyPort: socksPort,
		// 				localDNS: false,
		// 				auths: [ auth.UserPassword("foo", "bar") ]
		// 			}),
		// 			timeout: PAGE_LOAD_TIME
		// 		});
		// 	} catch (error) {
		// 		f = () => { throw error };
		// 	} finally {
		// 		assert.throws(f);
		// 	}
		// });

		after('shutdown server', function () {
			socksServer.close();
		});

		after('shutdown tor pool', async function () {
			await socksServerTorPool.exit();
		});
	});
	
});