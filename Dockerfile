FROM ubuntu:18.04

WORKDIR /app

EXPOSE 9050

EXPOSE 53

EXPOSE 9077

ENV PATH $PATH:/app/bin

ADD https://deb.nodesource.com/setup_8.x /tmp/nodejs_install

RUN apt-get update && apt-get -y install dirmngr

RUN gpg --keyserver keys.gnupg.net --recv A3C4F0F979CAA22CDBA8F512EE8CBC9E886DDD89 && gpg --export A3C4F0F979CAA22CDBA8F512EE8CBC9E886DDD89 | apt-key add -

ADD tor-sources.list /etc/apt/sources.list.d/tor.list

RUN bash /tmp/nodejs_install

RUN apt-get install -y nodejs tor git

ADD package.json /app/package.json

RUN npm install

ADD . /app

RUN useradd -ms /bin/bash tor

USER tor_router

ENV HOME /home/tor_router

ENTRYPOINT [ "tor-router" ]

CMD [ "-s", "-d", "-j", "1" ]