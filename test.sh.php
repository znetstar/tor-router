<?php require('./config.php'); ?>
#!/bin/bash

if export http_proxy=http://<?php echo PROXY_USERNAME; ?>:<?php echo PROXY_PASSWORD; ?>@localhost:<?php echo PROXY_PORT; ?> && wget -qO- http://ifconfig.me/ip; then
		exit 0;
else 
	echo "test failed";
	init 6;
	exit 1;
fi