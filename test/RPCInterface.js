
const _ = require('lodash');
const assert = require('chai').assert;
const Promise = require('bluebird');
const { Provider } = require('nconf');
const nconf = new Provider();
const { Client, JSONSerializer, TCPTransport } = require('multi-rpc');
const getPort = require('get-port');
const temp = require('temp');
const fs = require('fs');

nconf.use('memory');
require(`${__dirname}/../src/nconf_load_env.js`)(nconf);
nconf.defaults(require(`${__dirname}/../src/default_config.js`));
const { ControlServer } = require('../');
const { WAIT_FOR_CREATE } = require('./constants');
Promise.promisifyAll(fs);
Promise.promisifyAll(temp);

let rpcControlServer = new ControlServer(nconf);
let rpcControlPort;
let rpcClient;

describe('ControlServer - RPC Interface', function () {
	before('setup control server', async function () {
		rpcControlPort = await getPort();
		await rpcControlServer.listen(rpcControlPort);
		rpcClient = new Client(new TCPTransport(new JSONSerializer(), rpcControlPort));
	});

	describe('#createInstances(number_of_instances)', function () {
		this.timeout(WAIT_FOR_CREATE*2);
		it('should create an instance', async function () {
			await rpcClient.invoke('createInstances', [{ Name: 'instance-1', Group: "foo" }]);		
		});
	});

	describe('#queryInstanceNames()', function () {
		it("should have an instance named \"instance-1\"", async function () {
			let instances = await rpcClient.invoke('queryInstanceNames', [ ]);

			assert.deepEqual(instances, [ 'instance-1' ]);
		});
	});

	describe('#queryGroupNames()', function () {
		it("should have a group named \"foo\"", async function () {
			let groups = await rpcClient.invoke('queryGroupNames', [ ]);

			assert.deepEqual(groups, [ 'foo' ]);
		});
	});

	describe('#queryInstancesByGroup()', function () {
		it("should return an instance named \"instance-1\"", async function () {
			let instances = await rpcClient.invoke('queryInstancesByGroup', [ 'foo' ]);

			assert.equal(instances.length, 1);
			assert.ok(instances[0]);
			assert.equal(instances[0].name, 'instance-1');
		});
	});

	describe('#queryInstances()', function () {
		this.timeout(3000);
		it('should return a list of instances', async function () {
			let instances = await rpcClient.invoke('queryInstances', []);

			assert.isArray(instances, 'Did not return an array');
			assert.isNotEmpty(instances, 'Returned an empty array');
			assert.isTrue(instances.every((instance) => ( typeof(instance.name) !== 'undefined' ) && ( instance.name !== null )), 'Objects were not valid');
		});
	});

	describe('#addInstances(definitions)', function () {
		this.timeout(WAIT_FOR_CREATE);
		it("should add an instance based on a defintion", async function () {
			let def = {
				Name: 'instance-2',
				Group: 'bar'
			};
			await rpcClient.invoke('addInstances', [ def ]);
		});

		it("tor pool should now contain and instance that has the same name as the name specified in the defintion", function () {
			assert.ok(rpcControlServer.tor_pool.instance_by_name('instance-2'));
		});
	});

	describe('#queryInstanceByName(instance_name)', function () {
		this.timeout(3000);
		it('should return a single instance by name', async function () {
			let instance = await rpcClient.invoke('queryInstanceByName', ['instance-1']);
			
			assert.isOk(instance);
		});
	});

	describe('#queryInstanceAt(index)', function () {
		this.timeout(3000);
		it('should return a single instance by index', async function () {
			let instance = await rpcClient.invoke('queryInstanceAt', [0]);
			
			assert.isOk(instance);
		});
	});

	describe('#addInstanceToGroupByName()', function () {
		it(`should add "instance-1" to baz`, async function () {
			await rpcClient.invoke('addInstanceToGroupByName', [ 'baz', "instance-1" ]);
		});

		it('"instance-1" should be added to "baz"', function () {
			assert.include(rpcControlServer.tor_pool.instances_by_group('baz').map((i) => i.instance_name), "instance-1");
		});

		after('remove from group', function () {
			rpcControlServer.tor_pool.groups['baz'].remove_by_name('instance-1');
		});
	});

	describe('#addInstanceToGroupAt()', function () {
		it(`should add "instance-1" to baz`, async function () {
			await rpcClient.invoke('addInstanceToGroupAt', [ 'baz', 0 ]);
		});

		it('"instance-1" should be added to "baz"', function () {
			assert.include(rpcControlServer.tor_pool.instances_by_group('baz').map((i) => i.instance_name), "instance-1");
		});

		after('remove from group', function () {
			rpcControlServer.tor_pool.groups['baz'].remove_by_name('instance-1');
		});
	});

	describe('#removeInstanceFromGroupByName()', function () {
		before('add to group', function () {
			rpcControlServer.tor_pool.groups['baz'].add_by_name('instance-1');
		});

		it(`should remove "instance-1" from baz`, async function () {
			await rpcClient.invoke('removeInstanceFromGroupByName', [ 'baz', "instance-1" ]);
		});

		it('"instance-1" should be remove from to "baz"', function () {
			assert.notInclude(rpcControlServer.tor_pool.group_names, "baz");
		});
	});

	describe('#removeInstanceFromGroupAt()', function () {
		before('add to group', function () {
			rpcControlServer.tor_pool.groups['baz'].add_by_name('instance-1');
		});

		it(`should remove "instance-1" from baz`, async function () {
			await rpcClient.invoke('removeInstanceFromGroupAt', [ 'baz', 0 ]);
		});

		it('"instance-1" should be remove from to "baz"', function () {
			assert.notInclude(rpcControlServer.tor_pool.group_names, "baz");
		});
	});
	
	describe('#newIdentites()', function () {
		this.timeout(3000);
		it('should request new identities for all instances', async function () {
			await rpcClient.invoke('newIdentites', []);		
		});
	});

	describe('#newIdentityByName(instance_name)', function () {
		this.timeout(3000);
		it('should request new identities for all instances', async function () {
			await rpcClient.invoke('newIdentityByName', ['instance-1']);		
		});
	});

	describe('#newIdentityAt(index)', function () {
		this.timeout(3000);
		it('should request new identities for all instances', async function () {
			await rpcClient.invoke('newIdentityAt', [0]);		
		});
	});


	describe('#newIdentitiesByGroup()', function () {
		it(`should get new identites for all instances in group`, async function () {
			await rpcClient.invoke('newIdentitiesByGroup', [ 'foo' ]);
		});
	});

	describe("#setTorConfig(config_object)", function () {
		this.timeout(3000);
		it('should set several config variables on all instances', async function () {
			await rpcClient.invoke('setTorConfig', [ { TestSocks: 1, ProtocolWarnings: 1 } ]);
		});

		it('all instances should have the modified variables', async function() {
			await Promise.all(rpcControlServer.tor_pool.instances.map(async (instance) => {
				let var1 = await instance.get_config('TestSocks');
				let var2 = await instance.get_config('ProtocolWarnings');

				assert.equal(var1, 1);
				assert.equal(var2, 1);
			}));
		});

		after('unset config variables', async function () {
			await rpcControlServer.tor_pool.set_config_all('TestSocks', 0);
			await rpcControlServer.tor_pool.set_config_all('ProtocolWarnings', 0);
		});
	});

	describe('#setConfig(key, value)', function () {
		it('should set the default config of new instances', async function () {
			this.timeout(3000);
			await rpcClient.invoke('setConfig', [ 'foo', 'bar' ]);
		});

		it('a new instance should be created with the modified property', function () {
			assert.equal(nconf.get('foo'), 'bar');;
		});

		after('remove instance', function () {
			nconf.reset();
		});
	});

	describe('#setTorConfigByGroup()', function () {
		it(`should set the config value on all instances`, async function () {
			await rpcClient.invoke('setTorConfigByGroup', [ 'foo', { 'ProtocolWarnings': 1 } ]);
		});

		it('all instances should have the config value set', async function () {
			let values = _.flatten(await Promise.all(rpcControlServer.tor_pool.instances_by_group('foo').map((i) => i.get_config('ProtocolWarnings'))));

			assert.isTrue(values.every((v) => v === "1"));
		});

		after('unset config values', async function () {
			rpcControlServer.tor_pool.set_config_by_group('foo', 'ProtocolWarnings', 0);
		});
	});

	describe('#getConfig()', function () {
		before('set a property', function () {
			nconf.set('foo', 'bar');
		});

		it('should return the property that was set', async function () {
			this.timeout(6000);
			let value = await rpcClient.invoke('getConfig', [ 'foo' ]);

			assert.equal(value, 'bar');
		});

		after('unset property', function () {
			nconf.reset();
		});
	});

	describe('#saveConfig()', function () {
		let file_path;

		before('set a property and create temp file', async function () {
			file_path = temp.path({ suffix: '.json' });
			nconf.remove('memory');
			nconf.file({ file: file_path });
			nconf.set('foo', 'bar');
		});

		it('should save the config to the the temp file', async function () {
			this.timeout(6000);
			await rpcClient.invoke('saveConfig', []);
		});

		it('the temp file should contain the property', async function () {
			let tmp_file = await fs.readFileAsync(file_path, 'utf8');
			let tmp_json = JSON.parse(tmp_file);

			assert.equal(tmp_json.foo, 'bar');
		});

		after('unset property and delete file', async function () {
			nconf.remove('file');
			nconf.use('memory');
			nconf.reset();

			await fs.unlinkAsync(file_path);
		});
	});

	describe('#loadConfig()', function () {
		let file;

		before('create temp file with property', async function () {
			file = await temp.openAsync({ suffix: '.json' });

			await fs.writeFileAsync(file.fd, JSON.stringify({ foo: 'bar' }));

			nconf.remove('memory');
			nconf.file({ file: file.path });
		});

		it('should load the config from the the temp file', async function () {
			this.timeout(6000);
			await rpcClient.invoke('loadConfig', []);
		});

		it("the application's config should contain the property", async function () {
			assert.equal(nconf.get('foo'), 'bar');
		});

		after('unset property and delete file', async function () {
			nconf.remove('file');
			nconf.use('memory');
			nconf.reset();

			await fs.unlinkAsync(file.path);
		});
	});

	describe('#getLoadBalanceMethod()', function () {
		this.timeout(3000);
		before(function () {
			rpcControlServer.tor_pool.load_balance_method = 'round_robin';
		});

		it('should return the current load balance method', async function () {
			let lb_method = await rpcClient.invoke('getLoadBalanceMethod', []);
			assert.equal(lb_method, 'round_robin');
		});
	});

	describe('#setLoadBalanceMethod(load_balance_method)', function () {
		this.timeout(3000);

		it('should set the load balance method', async function () {
			await rpcClient.invoke('setLoadBalanceMethod', ['weighted']);
		});

		it('the load balance method should be changed', function () {
			assert.equal(rpcControlServer.tor_pool.load_balance_method, 'weighted');
		});

		after(function () {
			rpcControlServer.tor_pool.load_balance_method = 'round_robin';
		});	
	});

	describe("#getInstanceConfigByName(instance_name)", function () {
		this.timeout(3000);

		before('set config property', async function () {
			await rpcControlServer.tor_pool.instance_by_name('instance-1').set_config('TestSocks', 1);
		});

		it('should retrieve the property from the tor instance', async function () {
			let values = await rpcClient.invoke('getInstanceConfigByName', ['instance-1', "TestSocks"]);

			assert.isNotEmpty(values);
			assert.equal(values[0], "1");
		});

		after('unset config property', async function () {
			await rpcControlServer.tor_pool.instance_by_name('instance-1').set_config('TestSocks', 0);
		});
	});

	describe("#getInstanceConfigAt(index)", function () {
		this.timeout(3000);

		before('set config property', async function () {
			await rpcControlServer.tor_pool.instance_at(0).set_config('TestSocks', 1);
		});

		it('should retrieve the property from the tor instance', async function () {
			let values = await rpcClient.invoke('getInstanceConfigAt', [0, "TestSocks"]);
			
			assert.isNotEmpty(values);
			assert.equal(values[0], "1");
		});

		after('unset config property', async function () {
			await rpcControlServer.tor_pool.instance_at(0).set_config('TestSocks', 0);
		});
	});

	describe("#setInstanceConfigByName(instance_name)", function () {
		this.timeout(3000);

		before('set config property', async function () {
			await rpcControlServer.tor_pool.instance_by_name('instance-1').set_config('TestSocks', 0);
		});

		it('should set the property for the tor instance', async function () {
			await rpcClient.invoke('setInstanceConfigByName', ['instance-1', 'TestSocks', 1]);			
		});

		it('tor instance should have the modified property', async function () {
			let value = await rpcControlServer.tor_pool.instance_by_name('instance-1').get_config('TestSocks');
			assert.equal(value, 1);
		});

		after('unset config property', async function () {
			await rpcControlServer.tor_pool.instance_by_name('instance-1').set_config('TestSocks', 0);
		});
	});

	describe("#setInstanceConfigAt(index)", function () {
		this.timeout(3000);

		before('set config property', async function () {
			await rpcControlServer.tor_pool.instance_at(0).set_config('TestSocks', 0);
		});

		it('should set the property for the tor instance', async function () {
			await rpcClient.invoke('setInstanceConfigAt', [0, 'TestSocks', 1]);			
		});

		it('tor instance should have the modified property', async function () {
			let value = await rpcControlServer.tor_pool.instance_at(0).get_config('TestSocks');
			assert.equal(value, 1);
		});

		after('unset config property', async function () {
			await rpcControlServer.tor_pool.instance_at(0).set_config('TestSocks', 0);
		});
	});

	describe('#signalAllInstances(signal)', function () {
		this.timeout(3000);
		it('should signal to all interfaces', async function () {
			await rpcClient.invoke('signalAllInstances', [ 'DEBUG' ]);
		});
	});

	describe('#signalInstanceAt(signal)', function () {
		this.timeout(3000);
		it('should signal to all interfaces', async function () {
			await rpcClient.invoke('signalInstanceAt', [ 0, 'DEBUG' ]);
		});
	});

	describe('#signalAllInstances(signal)', function () {
		this.timeout(3000);
		it('should signal to all interfaces', async function () {
			await rpcClient.invoke('signalInstanceByName', [ 'instance-1', 'DEBUG' ]);
		});
	});

	describe('#signalInstancesByGroup()', function () {
		it(`should get new identites for all instances in group`, async function () {
			await rpcClient.invoke('signalInstancesByGroup', [ 'foo', 'DEBUG' ]);
		});
	});

	describe("#nextInstance()", function () {
		this.timeout(3000);
		let instance_name;
		it('should rotate the 0th item in the instances array', async function () {
			instance_name = rpcControlServer.tor_pool.instances[0].instance_name;
			await rpcClient.invoke('nextInstance', []);					
		});

		it('0th item in the instances array should be different after nextInstance is called', function () {
			assert.notEqual(rpcControlServer.tor_pool.instances[0].instance_name, instance_name);
		});
	});

	describe('#nextInstanceByGroup(group)', function () {
		before('add "instance-1" to "foo"', function () {
			rpcControlServer.tor_pool.add_instance_to_group_by_name('foo', 'instance-2');
		});

		it('should rotate the instances in group "foo"', async function () {
			this.timeout(5000);
			let first_instance_name_before = rpcControlServer.tor_pool.groups['foo'][0].instance_name;
			await rpcClient.invoke('nextInstanceByGroup', [ 'foo' ]);		
			let first_instance_name_after = rpcControlServer.tor_pool.groups['foo'][0].instance_name;
			
			assert.notEqual(first_instance_name_after, first_instance_name_before);
		});

		after('remove "instance-1" from "foo"', function () {
			rpcControlServer.tor_pool.remove_instance_from_group_by_name('foo', 'instance-2');
		})
	});

	var instance_num1, instance_num2, i_num;
	describe('#removeInstanceAt(index)', function () {
		this.timeout(10000);
		it("should remove an instance at the position specified", async function () {
			instance_num1 = rpcControlServer.tor_pool.instances.length;
			await rpcClient.invoke('removeInstanceAt', [0]);
		});

		it('the tor pool should contain one instance fewer', function () {
			assert.equal(rpcControlServer.tor_pool.instances.length, (instance_num1 - 1));
		});
	});

	describe('#removeInstanceByName(instance_name)', function () {
		this.timeout(10000);
		it("should remove an instance at the position specified", async function () {
			instance_num2 = rpcControlServer.tor_pool.instances.length;
			await rpcClient.invoke('removeInstanceByName', [ "instance-1" ]);
		});

		it('the tor pool should contain one instance fewer', function () {
			assert.equal(rpcControlServer.tor_pool.instances.length, (instance_num2 - 1));
		});
	});

	describe('#closeInstances()', function () {
		this.timeout(10000);
		it('should shutdown all instances', async function () {
			instance_num = rpcControlServer.tor_pool.instances.length;
			await rpcClient.invoke('closeInstances', [ ]);	
		});

		it('no instances should be present in the pool', function () {
			assert.equal(rpcControlServer.tor_pool.instances.length, 0);
		});
	});

	after('shutdown tor pool', async function () {
		this.timeout(10000);
		await rpcControlServer.tor_pool.exit();
	});	
});