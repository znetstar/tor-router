FROM ubuntu:17.10

WORKDIR /app

EXPOSE 9050

EXPOSE 53

EXPOSE 9077

ENV DNS_PORT 53

ENV SOCKS_PORT 9050

ENV CONTROL_PORT 9077

ENV PATH $PATH:/app/bin

ADD https://deb.nodesource.com/setup_8.x /tmp/nodejs_install

RUN apt update && apt -y install dirmngr

RUN gpg --keyserver keys.gnupg.net --recv A3C4F0F979CAA22CDBA8F512EE8CBC9E886DDD89 && gpg --export A3C4F0F979CAA22CDBA8F512EE8CBC9E886DDD89 | apt-key add -

ADD tor-sources.list /etc/apt/sources.list.d/tor.list

RUN bash /tmp/nodejs_install

RUN apt install -y --allow-unauthenticated deb.torproject.org-keyring nodejs tor git tzdata

ADD package.json /app/package.json

RUN npm install

ADD . /app

# Grab the current local timezone from an external api and save it into /etc/timezone, otherwise Tor will complain and won't start

CMD npm start