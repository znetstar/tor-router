<?php require('./config.php'); ?>
#!/bin/bash

/etc/init.d/tor stop
/etc/init.d/polipo stop
/etc/init.d/haproxy stop
killall haproxy
killall tor
bash -c "/usr/local/bin/multi-tor.sh <?php echo INSTANCES; ?>"
bash -c "haproxy -f /etc/haproxy/haproxy.cfg -D"
sleep 5
/etc/init.d/polipo start