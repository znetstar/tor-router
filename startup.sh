#!/bin/bash

export TEMP_HA_CONFIG=$(mktemp)
export TOR_CMD='tor --MaxCircuitDirtiness 60 --RunAsDaemon 0 --CookieAuthentication 0 --controlport 0.0.0.0:9051 --HashedControlPassword 16:4E9480609FC7089F604C83E788481164C25C205288E17D9E5E73EB050B --PidFile tor.pid --SocksPort 0.0.0.0:9150 --DataDirectory /data/tor --ExcludeSingleHopRelays 0 --NewCircuitPeriod 30 --EnforceDistinctSubnets 0 --AllowDotExit 1'

index="0" 

#docker -d &

while [ $index -lt $TOR_INSTANCES ]
do
	current_instance="$INSTANCE_PREFIX$index"
	echo "removing instance $current_instance..."
	docker kill $current_instance
	docker rm -f $current_instance
	echo "instance $current_instance removed"

#	control_port=$(cat $2/$current_instance)
	echo "instnce $current_instance will be assigned control port control port $control_port"

	echo "creating instance $current_instance..."
	docker run --name $current_instance -d -v /data --restart="on-failure" znetstar/tor $TOR_CMD
	echo "instance $current_instance created"
	index=$[$index+1]
done

echo "removing haproxy..."
docker kill haproxy
docker rm -f haproxy
echo "writing config..."
cat << EOF > $TEMP_HA_CONFIG
global
        user root
        group root

defaults
        log     global
        mode    http
        option  dontlognull
        timeout connect 5000ms
        timeout client 50000ms
        timeout server 50000ms
        errorfile 400 /usr/local/etc/haproxy/errors/400.http
        errorfile 403 /usr/local/etc/haproxy/errors/403.http
        errorfile 408 /usr/local/etc/haproxy/errors/408.http
        errorfile 500 /usr/local/etc/haproxy/errors/500.http
        errorfile 502 /usr/local/etc/haproxy/errors/502.http
        errorfile 503 /usr/local/etc/haproxy/errors/503.http
        errorfile 504 /usr/local/etc/haproxy/errors/504.http
EOF

echo "listen socks :$TOR_PORT" > $TEMP_HA_CONFIG

cat <<-EOF >> $TEMP_HA_CONFIG
    mode tcp
	balance roundrobin
EOF

index="0"
instances=""
while [ $index -lt $TOR_INSTANCES ]
do
	current_instance=$INSTANCE_PREFIX$index
	instances=$instances" --link $current_instance:$current_instance"
	cat <<-EOF >> $TEMP_HA_CONFIG
		server $current_instance $current_instance:9050 check
	EOF
	index=$[$index+1]
done

echo "starting haproxy..."
docker run -d -p 9050:9050  --name haproxy $instances -v $TEMP_HA_CONFIG:/usr/local/etc/haproxy/haproxy.cfg:ro haproxy:1.5.9
echo "tor server setup is complete"	

exit 0