FROM node:8

WORKDIR /app

EXPOSE 9050

EXPOSE 53

EXPOSE 9077

ENV PARENT_DATA_DIRECTORTY /var/lib/tor-router

ENV PATH $PATH:/app/bin

ADD package.json /app/package.json

RUN npm install

ADD . /app

RUN useradd -ms /bin/bash tor_router

USER tor_router

ENV HOME /home/tor_router

ENTRYPOINT [ "tor-router" ]

CMD [ "-s", "-d", "-j", "1" ]