FROM node:10-jessie

WORKDIR /app

ENV PARENT_DATA_DIRECTORTY /var/lib/tor-router

ENV TOR_PATH /usr/bin/tor

ENV NODE_ENV production

ENV PATH $PATH:/app/bin 

RUN apt-get update && apt-get install -y tor && rm -rf /var/lib/apt/lists/*

RUN useradd -ms /bin/bash tor_router

RUN chown -hR tor_router:tor_router /app

USER tor_router

ADD package.json /app/package.json

RUN npm install 

ADD . /app

ENV HOME /home/tor_router

EXPOSE 9050 9053 9077

ENTRYPOINT [ "tor-router" ]

CMD [ "-s", "-d", "-j", "1" ]