#!/bin/bash

wrapdocker &
sleep 5

echo 'starting tor router...'
/usr/local/bin/start-tor-router

docker kill haproxy
docker start -a -i haproxy

echo 'stopping tor router...'
/usr/local/bin/stop-tor-router
start-stop-daemon --stop --pidfile "/var/run/docker.pid"

exit 0