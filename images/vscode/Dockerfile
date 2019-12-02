FROM debian:stable-slim
WORKDIR /home/project

ADD "https://github.com/cdr/code-server/releases/download/2.1692-vsc1.39.2/code-server2.1692-vsc1.39.2-linux-x86_64.tar.gz" ./archive.tar.gz
RUN tar -xvzf archive.tar.gz --strip-components=1 --wildcards "*/code-server" && mv "code-server" /usr/local/bin && rm archive.tar.gz && apt-get update && apt-get install -y openssl net-tools

RUN groupadd user && useradd -m -g user -s /bin/bash user;
EXPOSE 8443
USER user
ENTRYPOINT ["/usr/local/bin/code-server", "--auth", "none", "--port", "8443"]
