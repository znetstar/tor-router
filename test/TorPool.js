const { Provider } = require('nconf');
const nconf = new Provider();
const { assert } = require('chai');
const Promise = require('bluebird');
const _ = require('lodash');

const { TorPool } = require('../');
const { WAIT_FOR_CREATE } = require('./constants');

nconf.use('memory');
require(`${__dirname}/../src/nconf_load_env.js`)(nconf);		
nconf.defaults(require(`${__dirname}/../src/default_config.js`));

describe('TorPool', function () {
	const torPoolFactory = () => new TorPool(nconf.get('torPath'), {}, nconf.get('parentDataDirectory'), 'round_robin', null);

	describe('#default_tor_config', function () {
		let tor_pool;
		let cfg = { "TestSocks": 1, "Log": "notice stdout", "NewCircuitPeriod": "10" };

		before('create tor config based on nconf', function () {
			nconf.set('torConfig', cfg); 
			tor_pool = new TorPool(nconf.get('torPath'), (() => nconf.get('torConfig')), nconf.get('parentDataDirectory'), 'round_robin', null);
		});

		it('the tor config should have the same value as set in nconf', function () {
			assert.deepEqual(nconf.get('torConfig'), tor_pool.default_tor_config);
		});

		after('shutdown tor pool', async function () { await tor_pool.exit(); });

		before('create tor config based on nconf', function () {
			tor_pool = new TorPool(nconf.get('torPath'), cfg, nconf.get('parentDataDirectory'), 'round_robin', null);
		});

		it('the tor config should have the same value as set', function () {
			assert.deepEqual(cfg, tor_pool.default_tor_config);
		});

		after('shutdown tor pool', async function () { await tor_pool.exit(); });
	});

	describe('#create_instance(instance_defintion)', function () {
		let instance_defintion = {
			Name: 'instance-1',
			Config: {
				ProtocolWarnings: 1
			}
		};

		let torPool;
		before('create tor pool', () => { torPool = torPoolFactory(); })

		it('should create one tor instance based on the provided definition', async function () {
			this.timeout(WAIT_FOR_CREATE);
			await torPool.create_instance(instance_defintion);
		});

		it('one instance should exist in the instances collection', function () {
			assert.equal(1, torPool.instances.length);
		});

		it('the created instance should have the defintion properties as the input definition', function () {
			assert.deepEqual(instance_defintion, torPool.instances[0].definition);
		});

		it('the created instance should have the same config properties specified in the definiton', async function () {
			let value = await torPool.instances[0].get_config('ProtocolWarnings');
			assert.equal(value, instance_defintion.Config.ProtocolWarnings);
		});

		it('should not be able to create an instance with an existing name', async function () {
			let fn = () => {}

			try {
				await torPool.create_instance({ Name: 'foo' });
				await torPool.create_instance({ Name: 'foo' });
			}
			catch (error) {
				fn = () => { throw error };
			} finally {
				assert.throws(fn);
			}
		});

		after('shutdown tor pool', async function () {
			await torPool.exit();
		});
	});

	describe('#add(instance_defintions)', function () {
		let instance_defintions = [
			{ Name: 'instance-1', Group: [], Config: { ProtocolWarnings: 1} },
			{ Name: 'instance-2', Group: [], Config: { ProtocolWarnings: 1 } }
		];

		let torPool;
		before('create tor pool', () => { torPool = torPoolFactory(); })

		it('should throw if the "instance_defintions" field is falsy', async function () {
			let fn = () => {};
			try {
				await torPool.add();
			} catch (error) {
				fn = () => { throw error };
			}
			finally {
				assert.throws(fn);
			}
		});

		it('should create instances from several instance definitions', async function () {
			this.timeout(WAIT_FOR_CREATE*2);
			await torPool.add(_.cloneDeep(instance_defintions))
		});

		it('2 instances should exist in the pool', function () {
			assert.equal(2, torPool.instances.length);
		});

		it('the created instances should have the same defintion properties as the input definitions', function () {
			let live_instance_definitions = torPool.instances.map((instance) => { 
				let def_clone = _.cloneDeep(instance.definition);
				delete def_clone.Config.DataDirectory;
				return def_clone;
			}).sort((a,b) => (a.Name > b.Name) ? 1 : ((b.Name > a.Name) ? -1 : 0));
			
			assert.deepEqual(instance_defintions, live_instance_definitions);
		});

		it('the created instances should have the same config properties specified in the definiton', async function () {
			this.timeout(10000);

			let values = await Promise.all(torPool.instances.map((instance) => instance.get_config('ProtocolWarnings')));
			values = _.flatten(values);
			assert.isTrue( values.every((value) => value === "1") );
		});

		after('shutdown tor pool', async function () {
			await torPool.exit();
		});
	});

	describe('#create(instances)', function () {
		let torPool;

		before('create tor pool', () => { 
			torPool = torPoolFactory(); 
			torPool.default_tor_config = { TestSocks: 1 };
		});

		it('should throw if the "number_of_instances" field is falsy', async function () {
			let fn = () => {};
			try {
				await torPool.create();
			} catch (error) {
				fn = () => { throw error; }
			}
			finally {
				assert.throws(fn);
			}
		});

		it('should create 2 instances with the default config', async function () {
			this.timeout(WAIT_FOR_CREATE*2);
			await torPool.create(2);
		});

		it('2 instances should exist in the pool', function () {
			assert.equal(2, torPool.instances.length);
		});

		it('the created instances should have the same config properties specified in the default config', async function () {
			this.timeout(10000);

			let values = await Promise.all(torPool.instances.map((instance) => instance.get_config('TestSocks')));
			values = _.flatten(values);
			assert.isTrue( values.every((value) => value === "1") );
		});

		after('shutdown tor pool', async function () {
			torPool.default_tor_config = {};
			await torPool.exit();
		});
	});

	describe('#instances_by_group(group)', function () {
		let tor_pool;
		let instances;

		before('create tor pool', async function () { 
			tor_pool = torPoolFactory(); 
			this.timeout(WAIT_FOR_CREATE);
			instances = (await tor_pool.add([ { Name: 'instance-1', Group: [ "bar", "foo" ] }, { Name: 'instance-2', Group: ["foo", "bar"] } ]));
		});

		it('should throw if the provided group does not exist', function () {
			assert.throws(() => {
				tor_pool.instances_by_group('baz');
			});
		});

		it('should return both instances', function () {
			assert.deepEqual(tor_pool.instances_by_group('bar'), instances);
		});

		after('shutdown tor pool', async function () { await tor_pool.exit(); });
	});

	describe('#next()', function () {
		let torPool;
		before('create tor pool', async function () { 
			torPool = torPoolFactory(); 

			this.timeout(WAIT_FOR_CREATE * 3);
			await torPool.add([
				{
					Name: 'instance-1',
					Weight: 50,
					Group: 'foo'
				},
				{
					Name: 'instance-2',
					Weight: 25,
					Group: 'bar'
				},
				{
					Name: 'instance-3',
					Weight: 2,
					Group: 'bar'
				}
			]);
		});

		it('result of next should be different if run twice', function () {
			let t1 = torPool.next().instance_name;
			let t2 = torPool.next().instance_name;
			assert.notEqual(t1, t2);
		});

		after('shutdown tor pool', async function () { await torPool.exit(); });
	});


	describe('#next_by_group(group)', function () {
		let tor_pool;

		before('create tor pool', async function () {
			tor_pool = new TorPool(nconf.get('torPath'), (() => nconf.get('torConfig')), nconf.get('parentDataDirectory'), 'round_robin', null);
			this.timeout(WAIT_FOR_CREATE * 3);
			await tor_pool.add([
				{ Group: 'foo' },
				{ Group: 'bar' },
				{ Group: 'bar' }
			]);
		});

		it('after rotating the first instance in group should be different', function () {
			let first_instance_name_before = tor_pool.groups['bar'][0].instance_name;

			tor_pool.next_by_group('bar');

			let first_instance_name_after = tor_pool.groups['bar'][0].instance_name;
			
			assert.notEqual(first_instance_name_after, first_instance_name_before);
		});

		after('shutdown tor pool', async function () { await tor_pool.exit(); });
	});

	describe('#instance_by_name(instance_name)', function () {
		let torPool;
		before('create tor pool', async function () { 
			torPool = torPoolFactory(); 

			this.timeout(WAIT_FOR_CREATE);
			await torPool.add([
				{
					Name: 'instance-1'
				}
			]);
		});
		
		it('should retrieve instance by name', function () {
			assert.ok(torPool.instance_by_name('instance-1'));
		});	

		after('shutdown tor pool', async function () { await torPool.exit(); });
	});

	describe('#remove_by_name(instance_name)', function () {
		let torPool;
		before('create tor pool', async function () { 
			torPool = torPoolFactory(); 

			this.timeout(WAIT_FOR_CREATE);
			await torPool.add([
				{
					Name: 'instance-3'
				}
			]);
		});

		it('should remove instance by name', async function () {
			this.timeout(5000);

			await torPool.remove_by_name('instance-3');

			assert.notInclude(torPool.instance_names, "instance-3");
		});

		after('shutdown tor pool', async function () { await torPool.exit(); });
	});

	describe('#instance_at(index)', function () {
		let torPool;
		before('create tor pool', async function () { 
			torPool = torPoolFactory(); 

			this.timeout(WAIT_FOR_CREATE);
			await torPool.create(1);

		});

		it('should retrieve an instance by id', function () {
			this.timeout(5000);
			assert.ok(torPool.instance_at(0));
		});
		
		after('shutdown tor pool', async function () { await torPool.exit(); });
	});

	describe('#remove_at(index)', function () {
		let torPool;
		before('create tor pool', async function () { 
			torPool = torPoolFactory(); 

			this.timeout(WAIT_FOR_CREATE );
			await torPool.create(1);

		});
		
		it('should remove an instance by id', async function () {
			this.timeout(5000);
			await torPool.remove_at(0);

			assert.notOk(torPool.instances[0]);
		});

		after('shutdown tor pool', async function () { await torPool.exit(); });
	});

	
	describe('#new_identites()', function () {
		let torPool;
		before('create tor pool', async function () { 
			torPool = torPoolFactory(); 

			this.timeout(WAIT_FOR_CREATE * 2);
			await torPool.create(2);

		});

		it('should signal to retrieve a new identity to all instances', async function () {
			this.timeout(5000);
			await torPool.new_identites();
		});

		after('shutdown tor pool', async function () { await torPool.exit(); });
	});

	describe('#new_identites_by_group(group)', function () {
		let torPool;
		before('create tor pool', async function () { 
			torPool = torPoolFactory(); 

			this.timeout(WAIT_FOR_CREATE * 3);
			await torPool.add([
				{ Name: 'instance-1', Group: 'bar' },
				{ Name: 'instance-2', Group: 'foo' }
			]);

		});
		
		it('should signal to retrieve a new identity to all instances', async function () {
			this.timeout(5000);
			await torPool.new_identites_by_group('bar');
		});

		after('shutdown tor pool', async function () { await torPool.exit(); });
	});

	describe('#new_identity_at(index)', function () {
		let torPool;
		before('create tor pool', async function () { 
			torPool = torPoolFactory(); 

			this.timeout(WAIT_FOR_CREATE);
			await torPool.create(1);

		});
		
		it('should signal to retrieve a new identity identified by index', async function () {
			this.timeout(5000);
			await torPool.new_identity_at(0);
		});

		after('shutdown tor pool', async function () { await torPool.exit(); });
	});

	describe('#new_identity_by_name(instance_name)', function () {
		let torPool;
		before('create tor pool', async function () { 
			torPool = torPoolFactory(); 

			this.timeout(WAIT_FOR_CREATE);
			await torPool.add({ Name: 'instance-1' });
		});
		
		it('should signal to retrieve a new identity identified by name', async function () {
			this.timeout(5000);
			await torPool.new_identity_by_name('instance-1');
		});

		after('shutdown tor pool', async function () { await torPool.exit(); });
	});


	describe('#set_config_all(keyword, value)', function () {
		let torPool;
		before('create tor pool', async function () { 
			torPool = torPoolFactory(); 

			this.timeout(WAIT_FOR_CREATE * 2);
			await torPool.create(2);
		});

		it('should set configuration on all active instances', async function () {
			this.timeout(5000);
			await torPool.set_config_all('TestSocks', 1);
		});

		it('all instances should contain the same changed configuration', async function () {
			this.timeout(5000);

			let values = await Promise.all(torPool.instances.map((instance) => instance.get_config('TestSocks')));
			values = _.flatten(values);
			assert.isTrue( values.every((value) => value === "1") );
		});

		after('shutdown tor pool', async function () { await torPool.exit(); });
	});

	describe('#set_config_by_group(group, keyword, value)', function () {
		let torPool;
		before('create tor pool', async function () { 
			torPool = torPoolFactory(); 

			this.timeout(WAIT_FOR_CREATE);
			await torPool.add([ { Name: 'instance-1', Group: 'foo' }, { Name: 'instance-2', Group: 'bar' }  ]);

		});

		it('should set configuration on all active instances', async function () {
			this.timeout(5000);
			await torPool.set_config_by_group('bar', 'TestSocks', 1);
		});

		it('all instances should contain the same changed configuration', async function () {
			this.timeout(5000);

			let values_from_bar = await Promise.all(torPool.instances_by_group('bar').map((instance) => instance.get_config('TestSocks')));
			values_from_bar = _.flatten(values_from_bar);
			assert.isTrue( values_from_bar.every((value) => value === "1") );

			let values_from_foo = await Promise.all(torPool.instances_by_group('foo').map((instance) => instance.get_config('TestSocks')));
			values_from_foo = _.flatten(values_from_foo);
			assert.isTrue( values_from_foo.every((value) => value !== "1") );
		});

		after('shutdown tor pool', async function () { await torPool.exit(); });
	});

	describe('#set_config_by_name(name, keyword, value)', function () {
		let torPool;
		before('create tor pool', async function () { 
			torPool = torPoolFactory(); 

			this.timeout(WAIT_FOR_CREATE);
			await torPool.add({ Name: 'instance-1' });

		});

		it('should set a configuration property of an instance identified by name', async function () {
			this.timeout(5000);
			await torPool.set_config_by_name('instance-1', 'ProtocolWarnings', 1);
		});

		it('should have the set value', async function () {
			this.timeout(5000);
			let value = _.flatten(await torPool.get_config_by_name('instance-1', 'ProtocolWarnings'))[0];
			assert.equal(value, '1');
		});

		after('shutdown tor pool', async function () { await torPool.exit(); });
	});

	describe('#get_config_by_name(name, keyword)', function () {
		let torPool;
		before('create tor pool', async function () { 
			torPool = torPoolFactory(); 

			this.timeout(WAIT_FOR_CREATE);
			await torPool.add({ Name: 'instance-1', Config: { ProtocolWarnings: 1 } });
		});

		it('should get retrieve the configuration of an instance identified by name', async function () {
			this.timeout(5000);
			let value = _.flatten(await torPool.get_config_by_name('instance-1', 'ProtocolWarnings'))[0];
			assert.equal(value, '1');
		});

		after('shutdown tor pool', async function () { await torPool.exit(); });
	});

	describe('#set_config_at(index, keyword, value)', function () {
		let torPool;
		before('create tor pool', async function () { 
			torPool = torPoolFactory(); 

			this.timeout(WAIT_FOR_CREATE);
			await torPool.create(1);
		});

		it('should set a configuration property of an instance identified by index', async function () {
			this.timeout(5000);
			await torPool.set_config_at(0, 'ProtocolWarnings', 1);
		});

		it('should have the set value', async function () {
			this.timeout(5000);
			let value = _.flatten(await torPool.get_config_at(0, 'ProtocolWarnings'))[0];
			assert.equal(value, '1');
		});
		
		after('shutdown tor pool', async function () { await torPool.exit(); });
	});

	describe('#get_config_at(index, keyword)', function () {
		let torPool;
		before('create tor pool', async function () { 
			torPool = torPoolFactory(); 

			this.timeout(WAIT_FOR_CREATE);
			await torPool.add({ Config: { ProtocolWarnings: 1 } });
		});
		
		it('should get retrieve the configuration of an instance identified by name', async function () {
			this.timeout(5000);
			let value = _.flatten(await torPool.get_config_at(0, 'ProtocolWarnings'))[0];

			assert.equal(value, '1');
		});

		after('shutdown tor pool', async function () { await torPool.exit(); });
	});

	describe('#signal_all(signal)', function () {
		let torPool;
		before('create tor pool', async function () { 
			torPool = torPoolFactory(); 

			this.timeout(WAIT_FOR_CREATE);
			await torPool.create(1);

		});
		
		it('should send a signal to all instances', async function () {
			this.timeout(5000);
			await torPool.signal_all('DEBUG');
		});

		after('shutdown tor pool', async function () { await torPool.exit(); });
	});

	describe('#signal_by_name(name, signal)', async function () {
		let torPool;
		before('create tor pool', async function () { 
			torPool = torPoolFactory(); 

			this.timeout(WAIT_FOR_CREATE);
			await torPool.create({ Name: 'instance-1' });
		});

		it('should send a signal to an instance identified by name', async function () {
			this.timeout(5000);
			await torPool.signal_by_name('instance-1', 'DEBUG');
		});

		after('shutdown tor pool', async function () { await torPool.exit(); });
	});

	describe('#signal_by_group(group, name, signal)', async function () {
		let torPool;
		before('create tor pool', async function () { 
			torPool = torPoolFactory(); 

			this.timeout(WAIT_FOR_CREATE);
			await torPool.create([ { "Name": "instance-1", "Group": ["foo"] }, { "Name": "instance-2", "Group": ["foo"] } ]);
		});

		it('should send a signal to a group of instances', async function () {
			this.timeout(5000);
			await torPool.signal_by_group('foo', 'DEBUG');
		});

		after('shutdown tor pool', async function () { await torPool.exit(); });
	});

	describe('#signal_at(index, signal)', function () {
		let torPool;
		before('create tor pool', async function () { 
			torPool = torPoolFactory(); 

			this.timeout(WAIT_FOR_CREATE);
			await torPool.create(1);
		});
		
		it('should send a signal to an instance identified by index', async function () {
			this.timeout(5000);
			await torPool.signal_at(0, 'DEBUG');
		});

		after('shutdown tor pool', async function () { await torPool.exit(); });
	});

	describe('#group_names', function () {
		let tor_pool;
		before('create tor pool', async function () { 
			tor_pool = torPoolFactory(); 
			this.timeout(WAIT_FOR_CREATE * 2);
			await tor_pool.add([
				{ Name: 'instance-1', Group: [ "foo", "bar" ] },
				{ Name: 'instance-2', Group: "baz" }
			]);
		});

		it('the pool should contain three groups, bar, baz and foo', function () {
			assert.deepEqual(tor_pool.group_names, (new Set([ "bar", "baz", "foo" ])));
		});

		after('shutdown tor pool', async function () { await tor_pool.exit(); });
	});

	describe('#add_instance_to_group(group, instance)', function () {
		let tor_pool;
		let instance;

		before('create tor pool', async function () { 
			tor_pool = torPoolFactory(); 
			this.timeout(WAIT_FOR_CREATE);
			instance = (await tor_pool.create(1))[0];
		});

		it('should add the instance to the group successfully', function () {
			tor_pool.add_instance_to_group("foo", instance);
		});

		it('the instance should be added to the group', function () {
			assert.deepEqual(instance.instance_group, ["foo"]);
		});

		after('shutdown tor pool', async function () { await tor_pool.exit(); });
	});

	describe('#add_instance_to_group_by_name(group, instance_name)', function () {
		let tor_pool;
		let instance;

		before('create tor pool', async function () { 
			tor_pool = torPoolFactory(); 
			this.timeout(WAIT_FOR_CREATE);
			instance = (await tor_pool.add({ Name: 'instance-1' }))[0];
		});

		it('should add the instance to the group successfully', function () {
			tor_pool.add_instance_to_group_by_name("foo", instance.definition.Name);
		});

		it('the instance should be added to the group', function () {
			assert.deepEqual(instance.instance_group, ["foo"]);
		});

		after('shutdown tor pool', async function () { await tor_pool.exit(); });
	});

	describe('#add_instance_to_group_at(group, instance_index)', function () {
		let tor_pool;
		let instance;

		before('create tor pool', async function () { 
			tor_pool = torPoolFactory(); 
			this.timeout(WAIT_FOR_CREATE);
			instance = (await tor_pool.create(1))[0];
		});

		it('should add the instance to the group successfully', function () {
			tor_pool.add_instance_to_group_at("foo", 0);
		});

		it('the instance should be added to the group', function () {
			assert.deepEqual(instance.instance_group, ["foo"]);
		});

		after('shutdown tor pool', async function () { await tor_pool.exit(); });
	});

	describe('#remove_instance_from_group(group, instance)', function () {
		let tor_pool;
		let instance;

		before('create tor pool', async function () { 
			tor_pool = torPoolFactory(); 
			this.timeout(WAIT_FOR_CREATE);
			instance = (await tor_pool.add({ Group: "foo" }))[0];
		});

		it('should remove the instance from the group successfully', function () {
			tor_pool.remove_instance_from_group("foo", instance);
		});

		it('the instance should be no longer be in the group', function () {
			assert.notInclude(instance.instance_group, "foo");
		});

		after('shutdown tor pool', async function () { await tor_pool.exit(); });
	});

	describe('#remove_instance_from_group_by_name(group, instance_name)', function () {
		let tor_pool;
		let instance;

		before('create tor pool', async function () { 
			tor_pool = torPoolFactory(); 
			this.timeout(WAIT_FOR_CREATE);
			instance = (await tor_pool.add({ Name: 'instance-1', Group: "foo" }))[0];
		});

		it('should remove the instance from the group successfully', function () {
			tor_pool.remove_instance_from_group_by_name("foo", instance.definition.Name);
		});

		it('the instance should no longer be in the group', function () {
			assert.notInclude(instance.instance_group, "foo");
		});

		after('shutdown tor pool', async function () { await tor_pool.exit(); });
	});

	describe('#remove_instance_from_group_at(group, instance_index)', function () {
		let tor_pool;
		let instance;

		before('create tor pool', async function () { 
			tor_pool = torPoolFactory(); 
			this.timeout(WAIT_FOR_CREATE);
			instance = (await tor_pool.add({ Group: "foo" }))[0];
		});

		it('should remove the instance from the group successfully', function () {
			tor_pool.remove_instance_from_group_at("foo", 0);
		});

		it('the instance should no longer be in the group', function () {
			assert.notInclude(instance.instance_group, "foo");
		});

		after('shutdown tor pool', async function () { await tor_pool.exit(); });
	});

	describe('#groups', function () {
		let tor_pool;
		let instances;

		let get_instance_names = (group_name) => { 
			let instances = [];
			let group = tor_pool.groups[group_name];
			for (let i = 0; i < group.length; i++)
				instances.push(group[i]);
			
			return instances.map((i) => i.instance_name).sort();
		};

		before('create tor pool', async function () { 
			tor_pool = torPoolFactory(); 
			this.timeout(WAIT_FOR_CREATE * 3);
			instances = (await tor_pool.add([
				{ Group: ["foo", "flob"], Name: 'instance-1' },
				{ Group: ["bar", "baz"], Name: 'instance-2' },
				{ Group: ["flob"], Name: 'instance-3' }
			]));
		});		


		it('should contain three groups, bar, baz and foo', function () {
			assert.deepEqual(Array.from(tor_pool.group_names).sort(), [ "bar", "baz", "flob", "foo" ]);
		});

		it('#[Number] - the 1st element should be "instance-1"', function () {
			assert.equal(tor_pool.groups["foo"][0], instances[0]);
		});

		it('#length() - group "foo" should contain 1 instance', function () {
			assert.equal(tor_pool.groups["foo"].length, 1);
		});

		it('#add() - adding "instance-1" to "baz" should result in "baz" having "instance-1" and "instance-2"', function () {
			tor_pool.groups["baz"].add(instances[0]);

			assert.deepEqual(get_instance_names("baz"), [ "instance-1", "instance-2" ] );
		});

		it('#remove() - removing "instance-1" firom "baz" should result in "baz" having just "instance-2"', function () {
			tor_pool.groups["baz"].remove(instances[0]);

			assert.deepEqual(get_instance_names("baz"), [ "instance-2" ] );
		});

		it('#add_by_name() - adding "instance-1" to "baz" should result in "baz" having "instance-1" and "instance-2"', function () {
			tor_pool.groups["baz"].add_by_name('instance-1');

			assert.deepEqual(get_instance_names("baz"), [ "instance-1", "instance-2" ] );
		});

		it('#remove_by_name() - removing "instance-1" from "baz" should result in "baz" having just "instance-2"', function () {
			tor_pool.groups["baz"].remove_by_name('instance-1');

			assert.deepEqual(get_instance_names("baz"), [ "instance-2" ] );
		});

		it('#remove_at() - removing "instance-1" from "baz" should result in "baz" having just "instance-2"', function () {
			tor_pool.groups["baz"].add_by_name('instance-1');
			tor_pool.groups["baz"].remove_at(0);

			assert.deepEqual(get_instance_names("baz"), [ "instance-1" ] );
		});

		it('#rotate() - the name of the first instance should change', function () {
			let first_instance_name_before = tor_pool.groups["flob"][0].instance_name;
			tor_pool.groups["flob"].rotate();
			let first_instance_name_after = tor_pool.groups["flob"][0].instance_name;
			assert.notEqual(first_instance_name_after, first_instance_name_before);
		});

		after('shutdown tor pool', async function () { await tor_pool.exit(); });
	});
});