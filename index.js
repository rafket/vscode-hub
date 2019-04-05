"use strict";

var httpProxy = require("http-proxy"),
    express = require("express"),
    cookieParser = require("cookie-parser"),
    expressSession = require("express-session"),
    bodyParser = require("body-parser"),
    Docker = require("dockerode"),
    crypto = require("crypto"),
    http = require("http"),
    passport = require("passport"),
    GithubStrategy = require("passport-github").Strategy,
    fs = require('fs');

var containers = {},
    tokens = {},
    last_access = {},
    settings = require("./settings.json"),
    ipaddr = {},
    users = {};

var proxy = httpProxy.createProxyServer({});

proxy.on("error", function (error, req, res) {
    console.log(error);
    res.end();
});

var docker = new Docker({socketPath: '/var/run/docker.sock'});

passport.use(new GithubStrategy({
    clientID: settings.github_clientid,
    clientSecret: settings.github_clientsecret,
    callbackURL: settings.callback_url
},
    function(accessToken, refreshToken, profile, cb) {
        return cb(null, profile);
    }
));

passport.serializeUser(function(user, cb) {
    users[user.id] = user;
    cb(null, user.id);
});

passport.deserializeUser(function(obj, cb) {
    if (obj in users) {
        cb(null, users[obj]);
    }
    else {
        cb("ERROR: user not found", undefined);
    }
});

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.use(cookieParser());
app.use(bodyParser.json());
const sessionParser = expressSession({ secret: crypto.randomBytes(10).toString("hex"), resave: true, saveUninitialized: true});
app.use(sessionParser);
app.use(passport.initialize());
app.use(passport.session());

function getIP(container, callback) {
    container.inspect(function (err, data) {
        var ip = data.NetworkSettings.Networks.bridge.IPAddress;
        if (!ip) {
            getIP(container, callback);
        }
        else {
            callback(ip);
        }
    });
}

function waitForConn(addr, port, callback) {
    http.get({host: addr, port: port, path: "/"}, function(res) {
        callback();
    }).on('error', function(e) {
        waitForConn(addr, port, callback);
    });
}

function buildImage(image_name, callback) {
    console.log("Building image", image_name);
    docker.buildImage({context: settings.images[image_name].path}, { t: image_name }, function(err, response) {
        if (err) {
            console.log(err);
        }
        else {
            docker.modem.followProgress(response, function onFinished(err, response) {
                if (err) {
                    console.log(err);
                }
                else {
                    console.log("Building image: DONE");
                    callback();
                }
            });
        }
    });
}

function removeContainer(container, callback) {
    container.kill(function(err, result) {
        if (err) {
            console.log(err);
            callback();
        }
        else {
            container.remove(function(err, result) {
                if (err) {
                    console.log(err);
                }
                callback();
            });
        }
    });
}

app.get('/login', passport.authenticate('github'));

app.get("/auth/github/callback", 
    passport.authenticate('github', { failureRedirect: "/login" }),
    function(req, res) {
        if (settings.whitelist.indexOf(req.user.id) > -1) {
            res.redirect("/deny");
            return;
        }
        if (req.user.id in tokens && tokens[req.user.id] in containers) {
            var token = tokens[req.user.id];
            var container = containers[token];
            delete containers[token];
            removeContainer(container, function() {});
        }
        reapContainers();

        var token = crypto.randomBytes(15).toString("hex");
        tokens[req.user.id] = token;
        var image_name = settings.user_image[req.user.id];

        try {
            fs.mkdirSync(__dirname+"/users/"+req.user.id, { recursive: true })
        } catch (err) {
            if (err.code !== 'EEXIST') throw err
        }

        docker.run(image_name, [], undefined, { 
            "Hostconfig": {
                "Memory": settings.images[image_name].max_memory,
                "DiskQuota": settings.images[image_name].disk_quota,
                "Binds": [__dirname+"/users/"+req.user.id+":/home/project"]
            }
        }, function(err, data, container) {
            console.log(err);
        }).on('container', function(container) {
            containers[token] = container;
            getIP(container, function(ip) {
                waitForConn(ip, settings.images[image_name].port, function() {
                    ipaddr[token] = ip+":"+settings.images[image_name].port;
                    res.redirect("/");
                });
            });
        });
    });

app.get("/deny", function(req, res) {
    res.render("deny");
});

app.get("/*",
    function(req, res) {
        if (req.user && settings.whitelist.indexOf(req.user.id) > -1) {
            res.redirect("/deny");
        }
        else if (req.user && req.user.id in tokens && tokens[req.user.id] in containers) {
            last_access[tokens[req.user.id]] = (new Date()).getTime();
            proxy.web(req, res, { target: "http://"+ipaddr[tokens[req.user.id]]});
        }
        else {
            res.render("login");
        }
    });


function exitHandler() {
    for (var token in containers) {
        var container = containers[token];
        delete containers[token];
        removeContainer(container, function() {
            exitHandler();
        });

        return;
    }
    process.exit();
}

function reapContainers() {
    var timestamp = (new Date()).getTime();
    for (var token in containers) {
        if (timestamp - last_access[token] > settings.time_out) {
            console.log(token, "has timed out");
            var container = containers[token];
            delete containers[token];

            removeContainer(container, function() {
                reapContainers();
            });

            return;
        }
    }
}

process.on('exit', exitHandler.bind());
process.on('SIGINT', exitHandler.bind());

var server = http.createServer(app);

server.on("upgrade", function(req, socket, head) {
    sessionParser(req, {}, () => {
        if (req.session.passport) {
            var userid = req.session.passport.user;
            last_access[tokens[userid]] = (new Date()).getTime();
            proxy.ws(req, socket, head, {target: "ws://"+ipaddr[tokens[userid]]});
        }
    });
});

server.on("error", err=>console.log(err));

buildImage("vscode-hub", function() {
    buildImage("theia-hub", function() {
        buildImage("terminado-hub", function() {
            server.listen(settings.port);
        });
    });
});
