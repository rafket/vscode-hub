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
    GithubStrategy = require("passport-github").Strategy;

var credentials = {},
    containers = {},
    tokens = {},
    last_access = {},
    settings = require("./settings.json"),
    ipaddr = {};

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
    cb(null, user);
});

passport.deserializeUser(function(obj, cb) {
    cb(null, obj);
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

function buildImage(callback) {
    console.log("Building image...");
    docker.buildImage({context: __dirname, src: ['Dockerfile']}, { t: "code-server:latest" }, function(err, response) {
	if (err) {
	    console.log(err);
	}
	else {
	    docker.modem.followProgress(response, function onFinished(err, response) {
		console.log("Building image: DONE");
		callback();
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
	if (req.user.id in tokens && tokens[req.user.id]) {
	    var token = tokens[req.user.id];
	    var path = credentials[token];
	    var container = containers[path];
            delete credentials[token];
	    delete containers[path];
	    removeContainer(container, function() {});
	}
	reapContainers();

	var token = crypto.randomBytes(15).toString("hex");
	var path = crypto.randomBytes(5).toString("hex");
	tokens[req.user.id] = token;
	credentials[token] = path;
	docker.run("code-server", ["--allow-http", "--no-auth"], undefined, { 
	    "name": path,
	    "Hostconfig": {
		"Memory": settings.max_memory,
		"DiskQuota": settings.disk_quota,
		"Binds": [__dirname+"/users/"+req.user.id+":/root/project"]
	    }
	}, function(err, data, container) {
	    console.log(err);
	}).on('container', function(container) {
	    containers[path] = container;
	    getIP(container, function(ip) {
		waitForConn(ip, 8443, function() {
		    ipaddr[token] = ip+":8443";
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
	else if (req.user && req.user.id in tokens) {
	    proxy.web(req, res, { target: "http://"+ipaddr[tokens[req.user.id]]});
	}
	else {
	    res.render("login");
	}
    });


function exitHandler() {
    for (var path in containers) {
	var container = containers[path];
	delete containers[path];
	removeContainer(container, function() {
	    exitHandler();
	});

	return;
    }
    process.exit();
}

function reapContainers() {
    var timestamp = (new Date()).getTime();
    for (var path in containers) {
	if (timestamp - last_access[path] > settings.time_out) {
	    var container = containers[path];
	    //proxy.removeRoute(path);
	    delete containers[path];

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
	var userid = req.session.passport.user.id;
	proxy.ws(req, socket, head, {target: "ws://"+ipaddr[tokens[userid]]});
    });
});

buildImage(function() {
    server.listen(settings.port);
});
