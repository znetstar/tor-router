#!/bin/bash

URL=http://bit.ly/tor-router-zip
WAIT=1

echo "Updating Apt"
apt-get update; 
echo "Installing prerequisites"
apt-get install -y -qq php5-cli unzip make uuid screen;
export UUID=$(uuid -v4)
echo "Downloading auto-configuration toolkit from $URL"
wget $URL -O /tmp/master.zip; 
sha1sum /tmp/master.zip > /etc/update_checksum
cd /tmp && unzip ./master.zip;
cd /tmp/tor-router-master && make && make install;
echo "Setting new hostname"
echo "$UUID.tor-routers" > /etc/hostname;

echo "Hostname >>>$UUID.tor-routers<<<"
/sbin/reboot