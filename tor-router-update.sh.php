<?php require('./config.php'); ?>
#!/bin/bash

URL=<?php echo UPDATE_URL."\n"; ?>
WAIT=1
export UPDATE_CHECKSUM=$(cat /etc/update_checksum)
wget $URL -O /tmp/master.zip; 
export CURRENT_CHECKSUM=$(sha1sum /tmp/master.zip) 
if [ "$CURRENT_CHECKSUM" == "$UPDATE_CHECKSUM" ]; then
	echo "Nothing to Update" | tee >(exec logger);
else
	echo "Updating Apt"
	sha1sum /tmp/master.zip > /etc/update_checksum
	apt-get update; 
	echo "Downloading auto-configuration toolkit from $URL"
	cd /tmp && unzip ./master.zip; 
	cd /tmp/tor-router-master && make && make install;
	echo "Unit $(hostname) updated!" | tee >(exec logger);
	/sbin/reboot
fi
