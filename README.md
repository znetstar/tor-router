Creates multiple instances of Tor and switches between them in a round-robin fashion.

Based on Docker, HAProxy and of course Tor

Run using 
   ./run.sh

Use the enviornment variable TOR_INSTANCES to set how many instances of Tor you'd like to run
Use the enviornment variable TOR_PORT to set the port you'd like to connect to. The TOR_PORT variable can also be an ip address and port (TOR_PORT=127.0.0.1:9050)

By default TOR_INSTANCES is set to 5 and TOR_PORT is set to 0.0.0.0:9050