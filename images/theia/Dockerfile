FROM node:8-alpine
RUN apk add --no-cache make gcc g++ python xorg-server
WORKDIR /home/user
ADD ./package.json ./package.json
RUN yarn --pure-lockfile && \
    NODE_OPTIONS="--max_old_space_size=4096" yarn theia build && \
    yarn --production && \
    yarn autoclean --init && \
    echo *.ts >> .yarnclean && \
    echo *.ts.map >> .yarnclean && \
    echo *.spec.* >> .yarnclean && \
    yarn autoclean --force && \
    rm -rf ./node_modules/electron && \
    yarn cache clean

FROM node:8-alpine
RUN deluser node;
RUN addgroup user && \
    adduser -G user -s /bin/sh -D user;
RUN chmod g+rw /home && \
    chown -R user:user /home/user;
RUN apk add --no-cache bash g++
ENV HOME /home/user
WORKDIR /home/user
COPY --from=0 --chown=user:user /home/user /home/user
EXPOSE 3000
ENV SHELL /bin/bash
ENV USE_LOCAL_GIT true
USER user
ENTRYPOINT [ "node", "/home/user/src-gen/backend/main.js", "/home/project", "--hostname=0.0.0.0" ]
