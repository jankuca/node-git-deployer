var Starter = function (name, port) {
	this.name_ = name;
	this.port_ = port;
};

Starter.prototype.restartVersions = function (versions) {
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
		}
	}(0));
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


module.exports = Starter;
