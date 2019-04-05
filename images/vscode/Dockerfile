FROM debian:stable-slim
WORKDIR /home/project

ADD "https://github.com/codercom/code-server/releases/download/1.408-vsc1.32.0/code-server1.408-vsc1.32.0-linux-x64.tar.gz" ./archive.tar.gz
RUN tar -xvzf archive.tar.gz --strip-components=1 --wildcards "*/code-server" && mv "code-server" /usr/local/bin && rm archive.tar.gz && apt-get update && apt-get install -y openssl net-tools

RUN groupadd user && useradd -m -g user -s /bin/sh user;
EXPOSE 8443
USER user
ENTRYPOINT ["/usr/local/bin/code-server", "--no-auth", "--allow-http"]
