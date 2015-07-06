FROM php:5.4.42-cli

VOLUME /var/lib/docker

VOLUME /tmp

COPY ./install_docker.sh /usr/local/bin/install_docker

RUN chmod +x /usr/local/bin/install_docker

RUN bash /usr/local/bin/install_docker

COPY ./dind/wrapdocker /usr/local/bin/wrapdocker

RUN chmod +x /usr/local/bin/wrapdocker

COPY ./shutdown.sh /usr/local/bin/stop-tor-router

COPY ./startup.sh /usr/local/bin/start-tor-router

COPY ./tor-router.sh /usr/local/bin/tor-router

COPY ./new_ip.sh /usr/local/bin/new-ip

COPY ./haproxy-config.php /opt/haproxy-config.php

RUN chmod -v +x /usr/local/bin/stop-tor-router

RUN chmod -v +x /usr/local/bin/start-tor-router

RUN chmod -v +x /usr/local/bin/tor-router

RUN chmod -v +x /usr/local/bin/new-ip

ENV TOR_INSTANCES 5

ENV TOR_PORT 9050

ENV INSTANCE_PREFIX tor-

CMD ["/usr/local/bin/tor-router"]