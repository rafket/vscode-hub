"use strict";

var confProxy = require("configurable-http-proxy"),
    express = require("express"),
    cookieParser = require("cookie-parser"),
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
    settings = require("./settings.json");

var proxy = new confProxy.ConfigurableProxy({"includePrefix": false});

proxy.updateLastActivity = function(prefix) {
    var timer = this.statsd.createTimer("last_activity_updating");
    var routes = this._routes;

    last_access[prefix.substr(1)] = (new Date()).getTime();

    return routes
	.get(prefix)
	.then(function(result) {
	    if (result) {
		return routes.update(prefix, { last_activity: new Date() });
	    }
	})
	.then(timer.stop);
}

proxy.proxyServer.listen(settings.proxy_port, "0.0.0.0");

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
app.use(bodyParser.urlencoded({extended: true}));
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
	    proxy.removeRoute(path);
	    var container = containers[path];
	    delete containers[path];
	    removeContainer(container, function() {});
	}
	reapContainers();

	var token = crypto.randomBytes(15).toString("hex");
	var path = crypto.randomBytes(5).toString("hex");
	tokens[req.user.id] = token;
	credentials[token] = path;
	docker.run("code-server", ["--allow-http", "--password", token], undefined, { 
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
		    var addr = "http://"+ip+":8443/";
		    proxy.addRoute(path, {"target": addr});
		    res.cookie("password", token).redirect("/"+path);
		});
	    });
	});
    });

app.get("/deny", function(req, res) {
    res.render("deny");
});

app.get("/*", function(req, res) {
    if ("password" in req.cookies && req.cookies["password"] in credentials) {
	res.redirect("/"+credentials[req.cookies["password"]]+req.originalUrl);
    }
    else {
	res.render("login");
    }
});

function exitHandler() {
    for (var path in containers) {
	var container = containers[path];
	proxy.removeRoute(path);
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
	    proxy.removeRoute(path);
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

buildImage(function() {
    var server = app.listen(settings.express_port, function() {});
    proxy.addRoute("/", {"target": "http://0.0.0.0:" + settings.express_port});
});
