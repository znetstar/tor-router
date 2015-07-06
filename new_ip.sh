#!/bin/bash

# Sends a HUP signal to Tor instances, generating a new IP

source env.sh

index="0" 

while [ $index -lt $TOR_INSTANCES ]
do
	current_instance="$INSTANCE_PREFIX$index"
	
	echo "sending signal to $current_instance..."
	docker exec -t $current_instance /bin/bash -c 'pgrep -f tor | xargs kill -HUP'
	index=$[$index+1]
done

sleep 1

exit 0
