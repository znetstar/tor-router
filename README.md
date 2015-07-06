Creates multiple instances of Tor and switches between them in a round-robin fashion.

Based on Docker, HAProxy and of course Tor

Run using 
   TOR_INSTANCES=5 TOR_PORT=9050 docker run --rm -it -e TOR_INSTANCES=$TOR_INSTANCES -e TOR_PORT=$TOR_PORT --name tor-router --privileged -v /tmp:/tmp -v /var/run/docker.sock:/var/run/docker.sock -v /var/lib/docker:/var/lib/docker -v /usr/bin/docker:/usr/bin/docker:ro znetstar/tor-router:0.0.1


Use the enviornment variable TOR_INSTANCES to set how many instances of Tor you'd like to run
Use the enviornment variable TOR_PORT to set the port you'd like to connect to. The TOR_PORT variable can also be an ip address and port (TOR_PORT=127.0.0.1:9050)

By default TOR_INSTANCES is set to 5 and TOR_PORT is set to 0.0.0.0:9050