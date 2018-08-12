FROM ubuntu:18.04

WORKDIR /app

EXPOSE 9050

EXPOSE 53

EXPOSE 9077

ENV PARENT_DATA_DIRECTORTY /var/lib/tor-router

ENV TOR_PATH /usr/bin/tor

ENV PATH $PATH:/app/bin 

RUN apt-get update && apt-get install -y nodejs tor git

RUN useradd -ms /bin/bash tor_router

RUN chown -hR tor_router:tor_router /app

USER tor_router

ADD package.json /app/package.json

RUN npm install

ADD . /app

ENV HOME /home/tor_router

ENTRYPOINT [ "tor-router" ]

CMD [ "-s", "-d", "-j", "1" ]