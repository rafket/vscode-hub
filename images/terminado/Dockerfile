FROM node:11-alpine
WORKDIR /home/user
RUN npm install xterm

FROM alpine
RUN apk add --no-cache bash g++ python py-pip sudo;
RUN addgroup user && adduser -G user -s /bin/sh -D user && adduser user wheel;
RUN sed -e 's;^# \(%wheel.*NOPASSWD.*\);\1;g' -i /etc/sudoers;
RUN chmod g+rw /home && chown -R user:user /home/user;
WORKDIR /home/user
COPY ./app.py ./app.py
COPY ./index.html ./index.html
COPY ./style.css ./style.css
COPY --from=0 /home/user/node_modules/xterm/dist /home/user/dist
USER user

RUN pip install --user tornado terminado

EXPOSE 8010
ENTRYPOINT [ "python", "/home/user/app.py" ]
