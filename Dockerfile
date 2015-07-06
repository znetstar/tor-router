FROM ubuntu:15.04

VOLUME /var/lib/docker

COPY ./install_docker.sh /usr/local/bin/install_docker

RUN chmod +x /usr/local/bin/install_docker

RUN bash /usr/local/bin/install_docker

COPY docker /usr/bin/docker

ADD ./dind/wrapdocker /usr/local/bin/wrapdocker

RUN chmod +x /usr/local/bin/wrapdocker

COPY ./env.sh /usr/local/bin/set_env

COPY ./shutdown.sh /usr/local/bin/stop-tor-router

COPY ./startup.sh /usr/local/bin/stop-tor-router

COPY ./tor-router.sh /usr/local/bin/tor-router

COPY ./new_ip.sh /usr/local/bin/new-ip

RUN chmod -v +x /usr/local/bin/set_env 

RUN chmod -v +x /usr/local/bin/stop-tor-router

RUN chmod -v +x /usr/local/bin/start-tor-router

RUN chmod -v +x /usr/local/bin/tor-router

RUN chmod -v +x /usr/local/bin/new-ip

EXPOSE 9050

ENV TOR_INSTANCES 5

CMD ["/usr/local/bin/tor-router"]