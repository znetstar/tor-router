<?php require('./config.php'); ?>
#!/bin/bash

while :
do
	if export http_proxy=http://<?php echo PROXY_USERNAME; ?>:<?php echo PROXY_PASSWORD; ?>@localhost:<?php echo PROXY_PORT; ?> && wget -qO- http://ifconfig.me/ip; then
		sleep 1;
	else 
		echo "test failed";
		break;
	fi
done