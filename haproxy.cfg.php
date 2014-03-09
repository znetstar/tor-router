<?php require('./config.php'); ?>
global
        log /dev/log    local0
        log /dev/log    local1 notice
        chroot /var/lib/haproxy
        user haproxy
        group haproxy
        daemon

defaults
        log     global
        mode    http
        option  dontlognull
        contimeout 5000
        clitimeout 50000
        srvtimeout 50000
        errorfile 400 /etc/haproxy/errors/400.http
        errorfile 403 /etc/haproxy/errors/403.http
        errorfile 408 /etc/haproxy/errors/408.http
        errorfile 500 /etc/haproxy/errors/500.http
        errorfile 502 /etc/haproxy/errors/502.http
        errorfile 503 /etc/haproxy/errors/503.http
        errorfile 504 /etc/haproxy/errors/504.http

listen socks :<?php echo SOCKS_PORT."\n"; ?>
        mode tcp
        balance <?php echo BALANCE_MODE."\n"; ?>
       
        <?php $i = 1; $port = BASE_PORT; while ($i < INSTANCES) { ?>
server tor<?php echo $i++; ?> 127.0.0.1:<?php echo $port++; ?> check
        <?php } ?>