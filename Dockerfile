FROM ubuntu:16.10

EXPOSE 9050

EXPOSE 53

ENV DNS_PORT 53

ENV SOCKS_PORT 9050

ENV INSTANCES 3

ADD https://deb.nodesource.com/setup_7.x /tmp/nodejs_install

RUN bash /tmp/nodejs_install

RUN apt install -y nodejs tor git

ADD . /app

WORKDIR /app

RUN npm install

# Grab the current local timezone from an external api and save it into /etc/timezone, otherwise Tor will complain and won't start
RUN curl -sL http://ip-api.com/json | node -e "process.stdin.resume(); process.stdin.on('data', (data) => { process.stdout.write(JSON.parse(data.toString('utf8')).timezone); process.exit(0); });" > /etc/timezone && dpkg-reconfigure -f noninteractive tzdata

CMD npm start