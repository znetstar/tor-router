FROM ubuntu:17.10

WORKDIR /app

EXPOSE 9050

EXPOSE 53

EXPOSE 9077

ENV DNS_PORT 53

ENV SOCKS_PORT 9050

ENV CONTROL_PORT 9077

ENV PATH $PATH:/app/bin

ADD tor-sources.list /etc/apt/sources.list.d/tor.list

ADD https://deb.nodesource.com/setup_8.x /tmp/nodejs_install

RUN bash /tmp/nodejs_install

RUN apt install -y --allow-unauthenticated deb.torproject.org-keyring nodejs tor git

ADD package.json /app/package.json

RUN npm install

ADD . /app

# Grab the current local timezone from an external api and save it into /etc/timezone, otherwise Tor will complain and won't start

CMD bash /app/bin/get-timezone.sh > /etc/timezone && dpkg-reconfigure -f noninteractive tzdata && npm start