# RPC Functions

The following functions are available via the RPC

## queryInstances()

Returns an array containing information on the instances currently running under the router.

## queryInstanceByName(instance_name: String)

Returns information on an instance identified by name

## queryInstancesByGroup(instance_name: String)

Returns an array containing information on the instances within a group.

## queryInstanceAt(instance_index: Integer)

Returns information on an instance identified by index.

## queryInstanceNames()

Returns a list of all instance names.

## queryGroupNames()

Returns a list of all instance groups.

## addInstanceToGroupByName(group: String, instance_name: String)

Adds an instance, identified by name, to a group

## addInstanceToGroupAt(group: String, instance_index: Integer)

Adds an instance, identified by index, to a group

## removeInstanceFromGroupByName(group: String, instance_name: String)

Removes an instance, identified by name, from a group

## removeInstanceFromGroupAt(group: String, instance_index: Integer)

Removes an instance, identified by index, from a group

## createInstances(instances: Array or Integer)

If passed an Integer, creates that many Tor instances. An array can also be passed describing the names, weights and configurations of prospective instances. :

```
var rpcRequest = {
	"method": "createInstances",
	"params": [
		{
			"Config": {

			},
			"Name": "instance-1",
			"Weight": 10
		},
		...
	], 
	"jsonrpc":"2.0", 
	"id": 1
};
```

Will wait until the Tor Instance has fully connected to the network before returning

## addInstances(instances: Array)

Serves the same purpose as "createInstances" but only takes an Array

## removeInstances(instances: Integer)

Removes a number of instances

## removeInstanceAt(instance_index: Integer)

Remove a specific instance from the pool by its index

## removeInstanceByName(instance_name: String)

Remove a specific instance from the pool by its name

## newIdentites()

Get new identites for all instances

## newIdentityAt(instance_index: Integer)

Get a new identity for a specific instance by its index

## newIdentityByName(instance_name: String)

Get a new identity for a specific instance by its name

## newIdentitiesByGroup(group: String)

Get new identities for all instances in a group

## nextInstance()

Cycle to the next instance using the load balancing method

## closeInstances()

Shutdown all Tor instances

## setTorConfig(config: Object)

Apples the provided configuration to all instances using the control protocol. Changes will be applied immediately.

## setTorConfigByGroup(group: String, config: Object)

Apples the provided configuration to all instances in a group using the control protocol. Changes will be applied immediately.

## getConfig(key: String) 

Retrieve a value from application configuration.

## setConfig(key: String, value: Any)

Sets a value in application configuration.

## saveConfig()

If the application was started using a config file will save the current configuration.

## loadConfig()

If the application was started using a config file will load the configuration from the config file.

## getLoadBalanceMethod()

Get the current load balance method

## setLoadBalanceMethod(load_balance_method: String)

Set the current load balance method

## getInstanceConfigAt(instance_index: Integer, keyword: String)

Retrieves the current value of an option set in the configuration by the index of the instance using the control protocol. 

Example:

The following would retrieve the path to the data directory of the instance

```
var rpcRequest = {
	"method": "getInstanceConfigAt",
	"params": [0, "DataDirectory"], 
	"jsonrpc":"2.0", 
	"id": 1
};
```

## getInstanceConfigByName(name: String, keyword: String)

Works the same way as `getInstanceConfigAt` except takes an instance name instead of an index

## setInstanceConfigAt(index: Integer, keyword: String, value: String)

Sets the value in the configuration of an instance using the control protocol. Changes will be applied immediately.

## setInstanceConfigByName(index: Integer, keyword: String, value: String)

Works the same way as `setInstanceConfigAt` except takes an instance name instead of an index

## signalAllInstances(signal: String)

Sends a signal using the control protocol to all instances

A list of all signals can be [found here](https://gitweb.torproject.org/torspec.git/tree/control-spec.txt)

## signalInstancesByGroup(group: String, signal: String)

Sends a signal using the control protocol to all instances in a group

## signalInstanceAt(index: Integer, signal: String)

Sends a signal using the control protocol to an instance identified by its index

## signalInstanceByName(name: String, signal: String)

Sends a signal using the control protocol to an instance identified by its name