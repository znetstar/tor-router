const SocksAgent = require('socks-proxy-agent');
const request = require('request');
const async = require('async');
const TorRouter = require('../');
const getPort = require('get-port');
const dns = require('native-dns');
const _ = require('lodash');
const assert = require('assert');
const winston = require('winston');
const del = require('del');
const rpc = require('jrpc2');
const fs = require('fs');

var colors = require('mocha/lib/reporters/base').colors;
var nconf = require('nconf');
nconf = require(`${__dirname}/../src/nconf_load_env.js`)(nconf);		
nconf.defaults(require(`${__dirname}/../src/default_config.js`));

var logger = winston.createLogger({
	level: 'info',
	format: winston.format.simple(),
	silent: true,
	transports: [ new (winston.transports.Console)({ silent: true }) ]
});

const WAIT_FOR_CREATE = 120000;
const PAGE_LOAD_TIME = 60000;

describe('TorProcess', function () {
	var tor = new (TorRouter.TorProcess)(nconf.get('torPath'), { DataDirectory: nconf.get('parentDataDirectory'), ProtocolWarnings: 0 }, null, logger);
	describe('#create()', function () {
		this.timeout(WAIT_FOR_CREATE);

		it('should create the child process', function (done) {
			tor.create(done);
		});

		it('should signal when it is listening on the control port', function (done) {
			if (tor.control_port_listening)
				return done();
			tor.once('control_listen', done);
		});

		it('should signal when connected to the control port', function (done) {
			if (tor.control_port_connected)
				return done();
			tor.once('controller_ready', done);
		});

		it('should signal when it is listening on the socks port', function (done) {
			if (tor.socks_port_listening)
				return done();
			tor.once('socks_listen', done);
		});

		it('should signal when it is listening on the dns port', function (done) {
			if (tor.dns_port_listening)
				return done();
			tor.once('dns_listen', done);
		});

		it('should signal when bootstrapped', function (done) {
			tor.once('error', done);
			if (tor.bootstrapped)
				return done();
			tor.once('ready', done);
		});
	});

	describe('#set_config(keyword, value)', function () {
		it('should set sample configuration option via the control protocol', function (done) {
			tor.set_config('ProtocolWarnings', 1, done);
		});
	});

	describe('#get_config(keyword, value)', function () {
		it('should retrieve sample configuration option via the control protocol', function (done) {
			tor.get_config('ProtocolWarnings', function (error, value) {
				done(error, (value == 1));
			});
		});
	});

	describe('#new_identity()', function () {
		it('should use a new identity', function (done) {
			tor.new_identity(done);
		});
	});

	describe('#signal()', function () {
		it('should send a signal via the control protocol', function (done) {
			tor.signal('DEBUG', done);
		});
	});

	after('shutdown tor', function (done) {
			tor.exit(done);
	});
});

var torPool;

describe('TorPool', function () {
	torPool = new (TorRouter.TorPool)(nconf.get('torPath'), {}, nconf.get('parentDataDirectory'), 'round_robin', null, logger);

	describe('#create_instance(instance_defintion)', function () {
		var instance_defintion = {
			Name: 'instance-1',
			Config: {
				ProtocolWarnings: 1
			}
		};

		it('should create one tor instance based on the provided definition', function (done) {
			this.timeout(WAIT_FOR_CREATE);
			torPool.create_instance(instance_defintion, (err, _instance) => {
				done(err);
			});
		});

		it('one instance should exist in the instances collection', function () {
			assert.equal(1, torPool.instances.length);
		});

		it('the created instance should have the defintion properties as the input definition', function () {
			assert.deepEqual(instance_defintion, torPool.instances[0].definition);
		});

		it('the created instance should have the same config properties specified in the definiton', function (done) {
			torPool.instances[0].get_config('ProtocolWarnings', (err, v) => {
				if (err)
					return done(err);
				done(null, (v === instance_defintion.Config.ProtocolWarnings));
			});
		});

		after('shutdown tor pool', function (done) {
			torPool.exit(done);
		});
	});

	describe('#add(instance_defintions)', function () {
		var instance_defintions = [
			{ Name: 'instance-1', Config: { ProtocolWarnings: 1} },
			{ Name: 'instance-2', Config: { ProtocolWarnings: 1 } }
		];

		it('should create instances from several instance definitions', function (done) {
			this.timeout(WAIT_FOR_CREATE*2);
			torPool.add(instance_defintions, function (error) {
				done(error)
			});
		});

		it('2 instances should exist in the pool', function () {
			assert.equal(2, torPool.instances.length);
		});

		it('the created instances should have the same defintion properties as the input definitions', function () {
			assert.deepEqual(instance_defintions, torPool.instances.map((i) => { 
				let def_clone = _.extend({}, i.definition);
				delete def_clone.Config.DataDirectory;
				return def_clone;
			}).sort(function(a,b) {return (a.Name > b.Name) ? 1 : ((b.Name > a.Name) ? -1 : 0);}));
		});

		it('the created instances should have the same config properties specified in the definiton', function (done) {
			this.timeout(10000);
			async.map(torPool.instances, function grabConfig(instance, next) {
				instance.get_config('ProtocolWarnings', next);
			}, function (err, values) {
				if (err) return done(err);
				done(null, values.every((v) => v === 1));
			});
		});

		after('shutdown tor pool', function (done) {
			torPool.exit(done);
		});
	});

	describe('#create(number_of_instances)', function () {
		torPool.default_tor_config = { TestSocks: 1 };
		it('should create 2 instances with the default config', function (done) {
			this.timeout(WAIT_FOR_CREATE*2);
			torPool.create(2, done);
		});

		it('2 instances should exist in the pool', function () {
			assert.equal(2, torPool.instances.length);
		});

		it('the created instances should have the same config properties specified in the default config', function (done) {
			this.timeout(10000);
			async.map(torPool.instances, function grabConfig(instance, next) {
				instance.get_config('ProtocolWarnings', next);
			}, function (err, values) {
				if (err) return done(err);
				done(null, values.every((v) => v === 1));
			});
		});

		after('shutdown tor pool', function (done) {
			torPool.default_tor_config = {};
			torPool.exit(done);
		});
	});


	describe('#next()', function () {
		before('create tor instances', function (done) {
			this.timeout(WAIT_FOR_CREATE * 3);
			torPool.add([
				{
					Name: 'instance-1',
					Weight: 50
				},
				{
					Name: 'instance-2',
					Weight: 25
				},
				{
					Name: 'instance-3',
					Weight: 2
				}
			], done);
		});

		it('result of next should be different if run twice', function () {
			var t1 = torPool.next().instance_name;
			var t2 = torPool.next().instance_name;
			assert.notEqual(t1, t2);
		});
	});

	describe('#instance_by_name(instance_name)', function () {
		it('should retrieve instance by name', function () {
			assert.ok(torPool.instance_by_name('instance-1'));
		});	
	});

	describe('#remove_by_name(instance_name)', function () {
		this.timeout(5000);
		it('should remove instance by name', function (done) {
			torPool.remove_by_name('instance-3', done);
		});
	});

	describe('#instance_at(index)', function () {
		this.timeout(5000);
		it('should retrieve an instance by id', function () {
			assert.ok(torPool.instance_at(0));
		});
	});

	describe('#remove_at(index)', function () {
		this.timeout(5000);
		it('should remove an instance by id', function (done) {
			torPool.remove_at(1, done);
		});
	});

	describe('#new_identites()', function () {
		this.timeout(5000);
		it('should signal to retrieve a new identity to all instances', function (done) {
			torPool.new_identites(done);
		});
	});

	describe('#new_identity_at(index)', function () {
		this.timeout(5000);
		it('should signal to retrieve a new identity identified by index', function (done) {
			torPool.new_identity_at(0, done);
		});
	});

	describe('#new_identity_by_name(instance_name)', function () {
		this.timeout(5000);
		it('should signal to retrieve a new identity identified by name', function (done) {
			torPool.new_identity_by_name('instance-1', done);
		});
	});


	describe('#set_config_all(keyword, value)', function () {
		it('should set configuration on all active instances', function (done) {
			this.timeout(5000);
			torPool.set_config_all('TestSocks', 1, done);
		});

		it('all instances should contain the same changed configuration', function (done) {
			this.timeout(5000);

			async.map(torPool.instances, (instance, next) => {
				instance.get_config('TestSocks', next);
			}, function (error, results) {
				if (error) return done(error);	
				done(null, results.every((r) => r === 1));
			});
		});

		after('unset config options', function (done) {
			torPool.set_config_all('TestSocks', 0, done);
		});
	});

	describe('#set_config_by_name(name, keyword, value)', function () {
		this.timeout(5000);
		it('should set a configuration property of an instance identified by name', function (done) {
			torPool.set_config_by_name('instance-1', 'ProtocolWarnings', 1, done);
		});
	});

	describe('#get_config_by_name(name, keyword)', function () {
		this.timeout(5000);
		it('should get retrieve the configuration of an instance identified by name', function (done) {
			torPool.get_config_by_name('instance-1', 'ProtocolWarnings', (error, value) => {
				if (error) return done(error);

				done(null, (value === 1));
			});
		});
	});

	describe('#set_config_at(index, keyword, value)', function () {
		this.timeout(5000);
		it('should set a configuration property of an instance identified by index', function (done) {
			torPool.set_config_at(0, 'ProtocolWarnings', 0, done);
		});
	});

	describe('#get_config_at(index, keyword)', function () {
		this.timeout(5000);
		it('should get retrieve the configuration of an instance identified by name', function (done) {
			torPool.get_config_at(0, 'ProtocolWarnings', (error, value) => {
				if (error) return done(error);

				done(null, (value === 0));
			});
		});
	});

	describe('#signal_all(signal)', function () {
		this.timeout(5000);
		it('should send a signal to all instances', function (done) {
			torPool.signal_all('DEBUG', done);
		});
	});

	describe('#signal_by_name(name, signal)', function () {
		this.timeout(5000);
		it('should send a signal to an instance identified by name', function (done) {
			torPool.signal_by_name('instance-1', 'DEBUG', done);
		});
	});

	describe('#signal_at(index, signal)', function () {
		this.timeout(5000);
		it('should send a signal to an instance identified by index', function (done) {
			torPool.signal_at(0, 'DEBUG', done);
		});
	});

	after('shutdown tor pool', function (done) {
		torPool.exit(done);
	});
});

var socksServerTorPool;
var socksServer;
describe('SOCKSServer', function () {
	socksServerTorPool = new (TorRouter.TorPool)(nconf.get('torPath'), {}, nconf.get('parentDataDirectory'), 'round_robin', null, logger);
	socksServer = new (TorRouter.SOCKSServer)(socksServerTorPool, logger);
	var socksPort;
	before('start up server', function (done){
		this.timeout(WAIT_FOR_CREATE);
		async.waterfall([
			(callback) => { socksServerTorPool.create(1, callback); },
			(callback) => { getPort().then((port) => callback(null, port)); },
			(port, callback) => {
				socksPort = port;
				socksServer.listen(port);
				callback();
			}
		], done);	
	});

	describe('#handleConnection(socket)', function () {
		it('should service a request for example.com', function (done) {
			this.timeout(PAGE_LOAD_TIME);

			var req = request({
				url: 'http://example.com',
				agent: new SocksAgent(`socks://localhost:${socksPort}`)
			});

			req.on('error', function (error) {
				done(error);
			});

			req.on('response', function (res) {
				done();
			})
		});
	});

	after('shutdown tor pool', function (done) {
		socksServerTorPool.exit(done);
	});
});


var httpServerTorPool;
var httpServer;
describe('HTTPServer', function () {
	httpServerTorPool = new (TorRouter.TorPool)(nconf.get('torPath'), {}, nconf.get('parentDataDirectory'), 'round_robin', null, logger);
	httpServer = new (TorRouter.HTTPServer)(httpServerTorPool, logger);
	var httpPort;
	before('start up server', function (done){
		this.timeout(WAIT_FOR_CREATE);
		async.waterfall([
			(callback) => { httpServerTorPool.create(1, callback); },
			(callback) => { getPort().then((port) => callback(null, port)); },
			(port, callback) => {
				httpPort = port;
				httpServer.listen(port);
				callback();
			}
		], done);	
	});

	describe('#handle_http_connections(req, res)', function () {
		it('should service a request for example.com', function (done) {
			this.timeout(PAGE_LOAD_TIME);

			var req = request({
				url: 'http://example.com',
				proxy: `http://localhost:${httpPort}`
			});

			req.on('error', function (error) {
				done(error);
			});

			req.on('response', function (res) {
				done();
			});
		});
	});

	describe('#handle_connect_connections(req, inbound_socket, head)', function () {
		it('should service a request for example.com', function (done) {
			this.timeout(PAGE_LOAD_TIME);

			var req = request({
				url: 'https://example.com',
				proxy: `http://localhost:${httpPort}`
			});

			req.on('error', function (error) {
				done(error);
			});

			req.on('response', function (res) {
				done();
			});
		});
	});

	after('shutdown tor pool', function (done) {
		httpServerTorPool.exit(done);
	});
});

var dnsServerTorPool;
var dnsServer;
describe('DNSServer', function () {
	dnsServerTorPool = new (TorRouter.TorPool)(nconf.get('torPath'), {}, nconf.get('parentDataDirectory'), 'round_robin', null, logger);
	dnsServer = new (TorRouter.DNSServer)(dnsServerTorPool, {}, 10000, logger);
	var dnsPort;
	before('start up server', function (done){
		this.timeout(WAIT_FOR_CREATE);
		async.waterfall([
			(callback) => { dnsServerTorPool.create(1, callback); },
			(callback) => { getPort().then((port) => callback(null, port)); },
			(port, callback) => {
				dnsPort = port;
				dnsServer.serve(port);
				callback();
			}
		], done);	
	});

	describe('#handle_dns_request(req, res)', function () {
		it('should service a request for example.com', function (done) {
			this.timeout(10000);

			var req = dns.Request({
				question: dns.Question({
					name: 'example.com',
					type: 'A'
				}),
				server: { address: '127.0.0.1', port: dnsPort, type: 'udp' },
				timeout: 1000,
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

	after('shutdown tor pool', function (done) {
		dnsServerTorPool.exit(done);
	});
});

var controlServer = new (TorRouter.ControlServer)(logger, nconf);
var controlPort;
describe('ControlServer', function () {
	describe('#listen(port)', function () {
		it('should bind to a given port', function (done) {
			getPort().then((port) => {
				controlPort = port;
				controlServer.listen(port, done);
			});
		});
	});
	describe('#createTorPool(options)', function () {
		it('should create a TorPool with a given configuration', function () {
			let torPool = controlServer.createTorPool({ ProtocolWarnings: 1 });

			assert.ok((controlServer.torPool instanceof (TorRouter.TorPool)));
			assert.equal(1, torPool.default_tor_config.ProtocolWarnings);
		});
	});
	describe('#createSOCKSServer(port)', function () {
		it('should create a SOCKS Server', function (done) {
			getPort().then((port) => {
				controlServer.createSOCKSServer(port);
				done(null, (
					(controlServer.socksServer instanceof (TorRouter.SOCKSServer))
				));
			});
		});
	});
	describe('#createDNSServer(port)', function () {
		it('should create a DNS Server', function (done) {
			getPort().then((port) => {
				controlServer.createDNSServer(port);
				done(null, (
					(controlServer.dnsServer instanceof (TorRouter.DNSServer))
				));
			});
		});
	});
	describe('#createHTTPServer(port)', function () {
		it('should create a HTTP Server', function (done) {
			getPort().then((port) => {
				controlServer.createHTTPServer(port);
				done(null, (
					(controlServer.httpServer instanceof (TorRouter.HTTPServer))
				));
			});
		});
	});

	describe('#close()', function () {
		it('should close the RPC Server', function () {
			controlServer.close();
		});
	});

	after('shutdown tor pool', function (done) {
		controlServer.torPool.exit(done);
	});
});

var rpcControlServer = new (TorRouter.ControlServer)(logger, nconf);
var rpcControlPort;
var rpcClient;
describe('ControlServer - RPC', function () {
	before('setup control server', function (done) {
		async.waterfall([
			(callback) => { getPort().then((port) => callback(null, port)); },
			(port, callback) => { rpcControlPort = port; rpcControlServer.listen(port, callback); },
			(callback) => {
				rpcClient = new rpc.Client(new rpc.tcpTransport({ port: rpcControlPort, hostname: 'localhost' }));
				return callback();
			}
		], done);
	});

	describe('#createInstances(number_of_instances)', function () {
		this.timeout(WAIT_FOR_CREATE*2);
		it('should create an instance', function (done) {
			rpcClient.invoke('createInstances', [2], function (error) {
				if (error)
					return done(error);
				done();
			});			
		});
	});

	describe('#queryInstances()', function () {
		this.timeout(3000);
		it('should return a list of instances', function (done) {
			rpcClient.invoke('queryInstances', [], function (error, raw) {
				if (error)
					return done(error);

				var instances = JSON.parse(raw).result;

				if (!Array.isArray(instances))
					done(new Error('Did not return an array'));

				done(null, (instances.every((i) => (typeof(i.name) !== 'undefined') && (i.name !== null)) && instances.length));
			});
		});
	});

	describe('#addInstances(definitions)', function () {
		this.timeout(WAIT_FOR_CREATE);
		it("should add an instance based on a defintion", function (done) {
			var def = {
				Name: 'instance-1'
			};
			rpcClient.invoke('addInstances', [ [ def ] ], done);
		});

		it("tor pool should now contain and instance that has the same name as the name specified in the defintion", function () {
			assert.ok(rpcControlServer.torPool.instance_by_name('instance-1'));
		});
	});

	describe('#queryInstanceByName(instance_name)', function () {
		this.timeout(3000);
		it('should return a single instance', function (done) {
			rpcClient.invoke('queryInstanceByName', ['instance-1'], function (error, raw) {
				if (error)
					return done(error);

				var instance = JSON.parse(raw).result;

				done(null, (typeof(instance.name) !== undefined) && (instance.name !== null));
			});
		});
	});

	describe('#queryInstanceAt(index)', function () {
		this.timeout(3000);
		it('should return a single instance', function (done) {
			rpcClient.invoke('queryInstanceAt', [0], function (error, raw) {
				if (error)
					return done(error);

				var instance = JSON.parse(raw).result;

				done(null, (typeof(instance.name) !== undefined) && (instance.name !== null));
			});
		});
	});

	describe('#newIdentites()', function () {
		this.timeout(3000);
		it('should request new identities for all instances', function (done) {
			rpcClient.invoke('newIdentites', [], done);		
		});
	});

	describe('#newIdentityByName(instance_name)', function () {
		this.timeout(3000);
		it('should request new identities for all instances', function (done) {
			rpcClient.invoke('newIdentityByName', ['instance-1'], done);		
		});
	});

	describe('#newIdentityAt(index)', function () {
		this.timeout(3000);
		it('should request new identities for all instances', function (done) {
			rpcClient.invoke('newIdentityAt', [0], done);		
		});
	});

	describe("#setTorConfig(config_object)", function () {
		this.timeout(3000);
		it('should set several config variables on all instances', function (done) {
			rpcClient.invoke('setTorConfig', [ { TestSocks: 1, ProtocolWarnings: 1 } ], done);
		});

		it('all instances should have the modified variables', function(done) {
			async.map(rpcControlServer.torPool.instances, (instance, next) => {
				async.series([
					(cb) => { instance.get_config('TestSocks', next); },
					(cb) => { instance.get_config('ProtocolWarnings', next); }
				], next);
			}, (error, results) => {
				if (error) return done(error);

				done(null, results.every((i) => i[0] === 1 && i[1] === 1));
			});
		});

		after('unset config variables', function (done) {
			async.series([
				(cb) => { rpcControlServer.torPool.set_config_all('TestSocks', 0, cb);  },
				(cb) => { rpcControlServer.torPool.set_config_all('ProtocolWarnings', 0, cb);  }
			], done);
		});
	});

	describe('#setDefaultTorConfig(object)', function () {
		it('should set the default config of new instances', function (done) {
			this.timeout(3000);
			rpcClient.invoke('setDefaultTorConfig', [ { TestSocks: 1 } ], done);
		});

		it('a new instance should be created with the modified property', function (done) {
			this.timeout(WAIT_FOR_CREATE);

			rpcControlServer.torPool.create_instance({ Name: 'config-test' }, (err) => {
				if (err) return done(err);

				rpcControlServer.torPool.instance_by_name('config-test').get_config('TestSocks', (err, val) => {
					if (err) return done(err);

					done(null, val === 1);
				});
			});
		});

		after('remove instance', function (done) {
			this.timeout(10000);
			nconf.set('torConfig', {});
			rpcControlServer.torPool.remove_by_name('config-test', done);
		});
	});

	describe('#getDefaultTorConfig()', function () {
		before('set tor config', function () {
			nconf.set('torConfig', { TestSocks: 1 });
		});

		it('should return a tor config with a modified property', function (done) {
			this.timeout(3000);
			rpcClient.invoke('getDefaultTorConfig', [ { } ], function (error, raw) {
				if (error) return done(error);

				var config = JSON.parse(raw).result;

				done(null, (config.TestSocks === 1))
			});
		});

		after('unset property', function () {
			nconf.set('torConfig', {});
		});
	});

	describe('#getLoadBalanceMethod()', function () {
		this.timeout(3000);
		before(function () {
			rpcControlServer.torPool.load_balance_method = 'round_robin';
		});

		it('should return the current load balance method', function (done) {
			rpcClient.invoke('getLoadBalanceMethod', [], function (error, raw) {
				if (error) return done(error);
				var lb_method = JSON.parse(raw).result;
				done(null, (lb_method === 'round_robin'));
			});	
		});
	});

	describe('#setLoadBalanceMethod(load_balance_method)', function () {
		this.timeout(3000);

		it('should set the load balance method', function (done) {
			rpcClient.invoke('setLoadBalanceMethod', ['weighted'], function (error) {
				return done(error);
			});	
		});

		it('the load balance method should be changed', function () {
			assert.equal(rpcControlServer.torPool.load_balance_method, 'weighted');
		});

		after(function () {
			rpcControlServer.torPool.load_balance_method = 'round_robin';
		});	
	});

	describe("#getInstanceConfigByName(instance_name)", function () {
		this.timeout(3000);

		before('set config property', function (done) {
			rpcControlServer.torPool.instance_by_name('instance-1').set_config('TestSocks', 1, done);
		});

		it('should retrieve the property from the tor instance', function (done) {
			rpcClient.invoke('getInstanceConfigByName', ['instance-1'], function (error, raw) {
				if (error) return done(error);

				var value = JSON.parse(raw).result;

				done(null, value === 1);
			});			
		});

		after('unset config property', function (done) {
			rpcControlServer.torPool.instance_by_name('instance-1').set_config('TestSocks', 0, done);
		});
	});

	describe("#getInstanceConfigAt(index)", function () {
		this.timeout(3000);

		before('set config property', function (done) {
			rpcControlServer.torPool.instance_at(0).set_config('TestSocks', 1, done);
		});

		it('should retrieve the property from the tor instance', function (done) {
			rpcClient.invoke('getInstanceConfigByName', [0], function (error, raw) {
				if (error) return done(error);

				var value = JSON.parse(raw).result;

				done(null, value === 1);
			});			
		});

		after('unset config property', function (done) {
			rpcControlServer.torPool.instance_at(0).set_config('TestSocks', 0, done);
		});
	});

	describe("#setInstanceConfigByName(instance_name)", function () {
		this.timeout(3000);

		before('set config property', function (done) {
			rpcControlServer.torPool.instance_by_name('instance-1').set_config('TestSocks', 0, done);
		});

		it('should set the property for the tor instance', function (done) {
			rpcClient.invoke('setInstanceConfigByName', ['instance-1', 'TestSocks', 1], function (error, value) {
				done(error);
			});			
		});

		it('tor instance should have the modified property', function (done) {
			rpcControlServer.torPool.instance_by_name('instance-1').get_config('TestSocks', function (error, value) {
				if (error) return done(error);
				done(null, (value === 1));
			});
		});

		after('unset config property', function (done) {
			rpcControlServer.torPool.instance_by_name('instance-1').set_config('TestSocks', 0, done);
		});
	});

	describe("#setInstanceConfigAt(index)", function () {
		this.timeout(3000);

		before('set config property', function (done) {
			rpcControlServer.torPool.instance_at(0).set_config('TestSocks', 0, done);
		});

		it('should set the property for the tor instance', function (done) {
			rpcClient.invoke('setInstanceConfigAt', [0, 'TestSocks', 1], function (error, value) {
				done(error);
			});			
		});

		it('tor instance should have the modified property', function (done) {
			rpcControlServer.torPool.instance_at(0).get_config('TestSocks', function (error, value) {
				if (error) return done(error);
				done(null, (value === 1));
			});
		});

		after('unset config property', function (done) {
			rpcControlServer.torPool.instance_at(0).set_config('TestSocks', 0, (err) => {
				done(err);
			});
		});
	});

	describe('#signalAllInstances(signal)', function () {
		this.timeout(3000);
		it('should signal to all interfaces', function (done) {
			rpcClient.invoke('signalAllInstances', [ 'DEBUG' ], function (error) { 
				done(error);
			});
		});
	});

	describe('#signalInstanceAt(signal)', function () {
		this.timeout(3000);
		it('should signal to all interfaces', function (done) {
			rpcClient.invoke('signalInstanceAt', [ 0, 'DEBUG' ], function (error) { 
				done(error);
			});
		});
	});

	describe('#signalAllInstances(signal)', function () {
		this.timeout(3000);
		it('should signal to all interfaces', function (done) {
			rpcClient.invoke('signalInstanceByName', [ 'instance-1', 'DEBUG' ], function (error) { 
				done(error);
			});
		});
	});

	describe("#nextInstance()", function () {
		this.timeout(3000);
		var i_name;
		it('should rotate the 0th item in the instances array', function (done) {
			i_name = rpcControlServer.torPool.instances[0].instance_name;
			rpcClient.invoke('nextInstance', [], function (error) {
				done(error);
			});					
		});

		it('0th item in the instances array should be different after nextInstance is called', function () {
			assert.notEqual(rpcControlServer.torPool.instances[0].instance_name, i_name);
		});
	});
	var instance_num1, instance_num2, i_num;
	describe('#removeInstanceAt(index)', function () {
		this.timeout(10000);
		it("should remove an instance at the position specified", function (done) {
			instance_num1 = rpcControlServer.torPool.instances.length;
			rpcClient.invoke('removeInstanceAt', [0], function (error) { 
				done(error);
			});
		});

		it('the tor pool should contain one instance fewer', function () {
			assert.equal(rpcControlServer.torPool.instances.length, (instance_num1 - 1));
		});
	});

	describe('#removeInstanceByName(instance_name)', function () {
		this.timeout(10000);
		it("should remove an instance at the position specified", function (done) {
			instance_num2 = rpcControlServer.torPool.instances.length;
			rpcClient.invoke('removeInstanceByName', [ "instance-1" ], function (error) { 
				done(error);
			});
		});

		it('the tor pool should contain one instance fewer', function () {
			assert.equal(rpcControlServer.torPool.instances.length, (instance_num2 - 1));
		});
	});

	describe('#closeInstances()', function () {
		this.timeout(10000);
		it('should shutdown all instances', function (done) {
			i_num = rpcControlServer.torPool.instances.length;
			rpcClient.invoke('closeInstances', [ ], function (error) { 
				done(error);
			});	
		});

		it('no instances should be present in the pool', function () {
			assert.equal(rpcControlServer.torPool.instances.length, 0);
			assert.notEqual(rpcControlServer.torPool.instances.length, i_num);
		});
	});

	after('shutdown tor pool', function (done) {
		this.timeout(10000);
		rpcControlServer.torPool.exit(done);
	});	
});