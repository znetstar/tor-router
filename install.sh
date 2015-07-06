#!/bin/bash

apt-get update -y
apt-get install -yqq curl git tar

echo 'installing docker...'

# START: docker installer
if [ ! -e /usr/lib/apt/methods/https ]; then
	apt-get update
	apt-get install -y apt-transport-https
fi

# Add the repository to your APT sources
echo deb https://get.docker.com/ubuntu docker main > /etc/apt/sources.list.d/docker.list

# Then import the repository key
apt-key adv --keyserver hkp://p80.pool.sks-keyservers.net:80 --recv-keys 36A1D7869245C8950F966E92D8576A8BA88D21E9

# Install docker
apt-get update
apt-get install -y lxc-docker-1.5.0

#
# Alternatively, just use the curl-able install.sh script provided at https://get.docker.com
#

# END: docker installer

echo 'running tor-router...'
/usr/bin/docker run --privileged -v /var/run/docker.sock:/var/run/docker.sock -p 9050:9050 --rm -it znetstar/tor-router:0.0.1

exit 0