<?php require('./config.php'); ?>
#!/bin/bash

# Original script from
# http://blog.databigbang.com/distributed-scraping-with-multiple-tor-circuits/

base_socks_port=<?php echo BASE_PORT."\n"; ?>
base_control_port=<?php echo CONTROL_PORT."\n"; ?>

# Create data directory if it doesn't exist
if [ ! -d "<?php echo TOR_DATA_DIR; ?>" ]; then
	mkdir "<?php echo TOR_DATA_DIR; ?>"
fi

TOR_INSTANCES="$1"

if [ ! $TOR_INSTANCES ] || [ $TOR_INSTANCES -lt 1 ]; then
    echo "Please supply an instance count"
    echo "Example: ./multi-tor.sh 5"
    exit 1
fi

for i in $(seq $TOR_INSTANCES)
do
	j=$((i+1))
	socks_port=$((base_socks_port+i))
	control_port=$((base_control_port+i))
	if [ ! -d "<?php echo TOR_DATA_DIR; ?>/tor$i" ]; then
		echo "Creating directory data/tor$i"
		mkdir "<?php echo TOR_DATA_DIR; ?>/tor$i"
	fi

	# Take into account that authentication for the control port is disabled. Must be used in secure and controlled environments
	echo "Running: tor --MaxCircuitDirtiness 60 --RunAsDaemon 1 --CookieAuthentication 0 --HashedControlPassword \"\" --ControlPort $control_port --PidFile tor$i.pid --SocksPort $socks_port --DataDirectory <?php echo TOR_DATA_DIR; ?>/tor$i"

	tor --MaxCircuitDirtiness 60 --RunAsDaemon 1 --CookieAuthentication 0 --HashedControlPassword "" --ControlPort $control_port --PidFile tor$i.pid --SocksPort $socks_port --DataDirectory <?php echo TOR_DATA_DIR; ?>/tor$i
done