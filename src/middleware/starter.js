var HTTP = require('http');
var Deferred = require('deferred');


var Starter = function (name, port) {
	this.name_ = name;
	this.port_ = port;
};

Starter.prototype.restartVersions = function (versions, callback) {
	var dfr = new Deffered();

	var self = this;
	var restarted = [];
	(function iter(i) {
		if (i !== versions.length) {
			var version = versions[i];
			self.restartVersion(version, function (started) {
				restarted.push(version);
				iter(++i);
			});
		} else {
			if (restarted.length) {
				console.info('The following branches were restarted:');
				console.info(restarted.join(', '));
			}
			dfr.complete('success', restarted);
		}
	}(0));

	return dfr;
};

Starter.prototype.startVersion = function (version, callback) {
	this.startVersion_(version, false, callback);
};

Starter.prototype.restartVersion = function (version, callback) {
	this.startVersion_(version, true, callback);
};

Starter.prototype.startVersion_ = function (version, restart, callback) {
	var options = {
		host: 'localhost',
		port: this.port_,
		path: (restart ? '/restart' : '/start') +
			'?name=' + encodeURIComponent(this.name_) +
			'&version=' + encodeURIComponent(version)
	};
	var req = HTTP.get(options, function (res) {
		if (res.statusCode < 300) {
			var data = '';
			res.on('data', function (chunk) {
				data += chunk;
			});
			res.on('end', function () {
				var result = JSON.parse(data);
				callback(!!result.started);
			});
		} else {
			callback(false);
		}
	});
	req.on('end', function () {
		callback(false);
	});
};


/**
 * @param {Object}
 * @return {Deferred}
 */
module.exports = function (result) {
	var dfr = new Deferred();

	var proxy_port = Number(global.input.params['proxy-port']) || null;
	if (proxy_port) {
		var versions = result.updated.map(function (item) {
			return item[0];
		});
		var starter = new Starter(name, proxy_port);
		starter.restartVersions(versions)
			.pipe(dfr);
	} else {
		dfr.complete('success');
	}

	return dfr;
};