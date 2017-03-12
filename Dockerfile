FROM ubuntu:16.10

EXPOSE 9050

EXPOSE 53

ENV DNS_PORT 53

ENV SOCKS_PORT 9050

ENV INSTANCES 3

ADD tor-sources.list /etc/apt/sources.list.d/tor.list

ADD https://deb.nodesource.com/setup_7.x /tmp/nodejs_install

RUN bash /tmp/nodejs_install

RUN apt install -y --allow-unauthenticated deb.torproject.org-keyring nodejs tor git

ADD . /app

WORKDIR /app

RUN npm install

# Grab the current local timezone from an external api and save it into /etc/timezone, otherwise Tor will complain and won't start
RUN bash /app/bin/get-timezone.sh > /etc/timezone && dpkg-reconfigure -f noninteractive tzdata

CMD npm start