all: clean multi-tor start_router haproxy check_install rc-local polipo-config

clean:
	rm -rvf build

multi-tor:
	mkdir -pv build/usr/local/bin
	php multi-tor.sh.php > build/usr/local/bin/multi-tor.sh
	chmod +x build/usr/local/bin/multi-tor.sh

start_router: 
	mkdir -pv build/usr/local/bin
	php start_router.sh.php > build/usr/local/bin/start_router.sh
	chmod +x build/usr/local/bin/start_router.sh

haproxy:
	mkdir -pv build/etc/haproxy
	php haproxy.cfg.php > build/etc/haproxy/haproxy.cfg

check_install: 
	mkdir -pv build/usr/local/bin
	php check_install.sh.php > build/usr/local/bin/check_install.sh
	chmod +x build/usr/local/bin/check_install.sh

rc-local: 
	mkdir -pv build/etc
	php rc.local.php > build/etc/rc.local
	chmod +x build/etc/rc.local

polipo-config: 
	mkdir -pv build/etc/polipo
	php polipo-config.php > build/etc/polipo/config
	chmod +x build/etc/polipo/config