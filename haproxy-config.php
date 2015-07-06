global
	user root
	group root

defaults
	log     global
	mode    http
	option  dontlognull
	timeout connect 5000ms
	timeout client 50000ms
	timeout server 50000ms
	errorfile 400 /usr/local/etc/haproxy/errors/400.http
	errorfile 403 /usr/local/etc/haproxy/errors/403.http
	errorfile 408 /usr/local/etc/haproxy/errors/408.http
	errorfile 500 /usr/local/etc/haproxy/errors/500.http
	errorfile 502 /usr/local/etc/haproxy/errors/502.http
	errorfile 503 /usr/local/etc/haproxy/errors/503.http
	errorfile 504 /usr/local/etc/haproxy/errors/504.http

listen socks *:<?php echo getenv('TOR_PORT').PHP_EOL; ?>
<?php 
	$instances = intval(getenv("TOR_INSTANCES"));

	$current_instance = 0;
	while( $current_instance < $instances ) 
{ ?>	server <?php echo $current_instance; ?> <?php echo getenv('INSTANCE_PREFIX').$current_instance; ?>:9050 check <?php $current_instance++; echo PHP_EOL; } ?>
	mode tcp
	balance roundrobin
