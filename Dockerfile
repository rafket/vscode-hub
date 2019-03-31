FROM debian:stable-slim
WORKDIR /root/project

ADD "https://github.com/codercom/code-server/releases/download/1.408-vsc1.32.0/code-server1.408-vsc1.32.0-linux-x64.tar.gz" ./archive.tar.gz
RUN tar -xvzf archive.tar.gz --strip-components=1 --wildcards "*/code-server" && mv "code-server" /usr/local/bin && rm archive.tar.gz && apt-get update && apt-get install -y openssl net-tools

EXPOSE 8443
ENTRYPOINT ["/usr/local/bin/code-server"]
