all: dind .drone.yml

clean:
	rm -f .drone.yml

dind:
	git subtree add --prefix dind https://github.com/jpetazzo/dind.git master --squash

.drone.yml:
	wget -qO- http://bit.ly/drone-yml-php | php > .drone.yml

install:
	docker build -t znetstar/tor-router:0.0.1 .