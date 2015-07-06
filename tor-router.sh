#!/bin/bash

wrapdocker &
sleep 5

echo 'starting tor router...'
/usr/local/bin/start-tor-router

docker logs -f haproxy &
docker wait haproxy

echo 'stopping tor router...'
/usr/local/bin/stop-tor-router
start-stop-daemon --stop --pidfile "/var/run/docker.pid"

exit 0