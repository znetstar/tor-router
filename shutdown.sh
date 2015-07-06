#!/bin/bash

index="0" 

while [ $index -lt $TOR_INSTANCES ]
do
	current_instance=$INSTANCE_PREFIX$index
	echo "shutting down $current_instance"
	docker rm -f $current_instance
	index=$[index+1]
done

echo "shutting down haproxy..."
docker rm -f haproxy

echo 'removing files...'
rm -rf /tmp/haproxy.cfg
rm -rf /tmp/tor

#sleep 5

echo 'tor router has shut down'

exit 0 
