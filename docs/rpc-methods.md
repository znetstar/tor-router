## RPC Functions

The following functions are available via the RPC

# queryInstances()

Returns an array containing information on the instances currently running under the router.

# createInstances(Array or Integrer)

If passed an integrer, creates thats many Tor instances. An array can also be passed describing the names, weights and configurations of prospective instances. :

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

# addInstances(Array)

Serves the same purpose as "createInstances" but only takes an Array

# removeInstances(Integrer)

Removes a number of instances

# removeInstanceAt(Integrer)

Remove a specific instance from the pool by it's index

# removeInstanceByName(String)

Remove a specific instance from the pool by it's name

# newIdentites()

Get new identites for all instances

# newIdentityAt(Integrer)

Get a new identity for a specific instance by it's index

# newIdentityByName(String)

Get a new identity for a specific instance by it's name

# nextInstance()

Cycle to the next instance using the load balancing method

# closeInstances()

Shutdown all Tor instances

# getTorConfig() 

Retrieve the default Tor Config

# setTorConfig

Set the default Tor Config

# getLoadBalanceMethod

Get the current load balance method

# setLoadBalanceMethod

Set the current load balance method