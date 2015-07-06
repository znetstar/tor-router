#!/bin/bash

export TOR_CMD='tor --MaxCircuitDirtiness 60 --RunAsDaemon 0 --CookieAuthentication 0 --controlport 0.0.0.0:9051 --HashedControlPassword 16:4E9480609FC7089F604C83E788481164C25C205288E17D9E5E73EB050B --PidFile tor.pid --SocksPort 0.0.0.0:9050 --DataDirectory /data/tor --ExcludeSingleHopRelays 0 --NewCircuitPeriod 30 --EnforceDistinctSubnets 0 --AllowDotExit 1'

index=0
instances=''
#docker -d &

while [ $index -lt $TOR_INSTANCES ]
do
	current_instance="$INSTANCE_PREFIX$index"
	echo "removing instance $current_instance..."
	docker kill $current_instance
	docker rm -f $current_instance
	echo "instance $current_instance removed"

	echo "creating instance $current_instance..."
	docker run -d -v /tmp/tor/$current_instance:/data --name $current_instance --restart="on-failure" znetstar/tor $TOR_CMD
	echo 'created $current_instance'
	instances="$instances --link $current_instance:$current_instance"

	index=$[$index+1]
done

echo "removing haproxy..."
docker rm -f haproxy

echo "writing config..."
php /opt/haproxy-config.php > /tmp/haproxy.cfg

echo "started tor-router"
clear;
docker run --name haproxy -d -p $TOR_PORT:9050 $instances -v /tmp/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro haproxy:1.5.9

exit 0