#!/bin/bash

URL=http://bit.ly/tor-router-zip
WAIT=1

# Add Tor repository on debian-based systems for latest stable releases
TORREPO=$(grep -ci "torproject.org" /etc/apt/sources.list)
if [ -f /etc/lsb-release -o -d /etc/lsb-release.d ] && [ $TORREPO -eq 0 ]; then
	codename=$(lsb_release -c | cut -f 2)
	echo "deb http://deb.torproject.org/torproject.org $codename main" >> /etc/apt/sources.list
	gpg --keyserver keys.gnupg.net --recv 886DDD89
	gpg --export A3C4F0F979CAA22CDBA8F512EE8CBC9E886DDD89 | sudo apt-key add -
fi

if [ ! -e /etc/update_checksum ]; then
	echo "Updating Apt"
	apt-get update; 
	echo "Installing prerequisites"
	apt-get install -y -qq php5-cli unzip make uuid screen;
	echo "Downloading auto-configuration toolkit from $URL"
	wget $URL -O /tmp/master.zip; 
	sha1sum /tmp/master.zip > /etc/update_checksum
	cd /tmp && unzip ./master.zip;
	cd /tmp/tor-router-master && make && make install;
	echo "Setting new hostname"

	echo "Hostname >>>$(hostname -f)<<<"
	/sbin/reboot
else 
	/usr/local/bin/tor-router-update.sh	
fi
