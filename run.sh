#!/bin/bash

echo "using docker host $DOCKER"

cd /app && node bin/tor-router.js

exit 0