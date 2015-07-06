#!/bin/bash

index="0" 

while [ $index -lt $TOR_INSTANCES ]
do
	current_instance=$INSTANCE_PREFIX$index
	echo "shutting down $current_instance"
	docker rm -f $current_instance
	index=$[index+1]
done

echo "stop haproxy"
docker rm -f haproxy

echo "closing port"
iptables -A INPUT -p tcp --dport 9050 -j REJECT

#sleep 5

exit 0 
