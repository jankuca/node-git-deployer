var HTTP = require('http');
var Path = require('path');
var Deferred = require('deferred');


/**
 * Middleware that restarts applications via the HTTP Flow proxy
 * https://github.com/jankuca/http-flow
 * @constructor
 * @param {number} port The port on which the proxy is listening
 */
var Restarter = function (port) {
	this.port_ = port;
};

/**
 * Sends an update request to the proxy
 * @return {Deferred}
 */
Restarter.prototype.updateProxy = function () {
	var dfr = new Deferred();
	var options = {
		host: 'localhost',
		port: this.port_,
		path: '/update'
	};

	var onFailure = function () {
		console.error('RESTARTER: Failed to update the proxy');
		console.warn('!! Make sure the proxy is OK. This is extremely unlikely to happen.');
		dfr.complete('failure');
	};

	var req = HTTP.get(options, function (res) {
		var data = '';
		res.on('data', function (chunk) {
			data += chunk;
		});
		res.on('end', function () {
			var result = JSON.parse(data);
			if (result.updated) {
				console.info('RESTARTER: Proxy successfully updated');
				dfr.complete('success');
			} else {
				onFailure();
			}
		});
	});
	req.on('error', onFailure);

	return dfr;
};

/**
 * Sends a restart request to the proxy
 * @param {string} name The name of the application to restart
 * @param {string} version The version of the applicaion to restart
 * @return {Deferred}
 */
Restarter.prototype.restart = function (name, version) {
	var dfr = new Deferred();
	var options = {
		host: 'localhost',
		port: this.port_,
		path: '/restart' +
			'?app=' + encodeURIComponent(name) +
			'&version=' + encodeURIComponent(version)
	};
	var req = HTTP.get(options, function (res) {
		var data = '';
		res.on('data', function (chunk) {
			data += chunk;
		});
		res.on('end', function () {
			var result = JSON.parse(data);
			if (result.started) {
				console.info('RESTARTER: ' + version + ' successfully restarted');
				dfr.complete('success');
			} else {
				console.error('RESTARTER: Failed to restart ' + version +
					' (' + res.statusCode + (result.error ? ', ' + result.error : '') + ')');
				dfr.complete('failure');
			}
		});
	});
	req.on('error', function (err) {
		console.error('RESTARTER: Failed to restart ' + version + ' (' + err.code + ')');
		dfr.complete('failure');
	});
	return dfr;
};


/**
 * @param {string} version The version name
 * @param {string} dirname Path to the deployment target
 * @param {*} data
 * @return {Deferred}
 */
module.exports = function (version, dirname, data) {
	var dfr = new Deferred();
	var proxy_port = Number(global.input.params['proxy-port']);
	if (proxy_port) {
		// register an after-update callback
		// We require the target to be live.
		console.info('RESTARTER: Registering an after-update callback');
		dfr.complete('success', function () {
			var cb_dfr = new Deferred();

			var restarter = new Restarter(proxy_port);
			restarter.updateProxy().then(function () {
				var match = dirname.match(/\/([^\/]+)\/\.([^\/]+)\.part\/?$/);
				var name = match[1];
				var version = match[2];
				restarter.restart(name, version).pipe(cb_dfr);
			}, cb_dfr);

			return cb_dfr;
		});
	} else {
		console.error('RESTARTER: Proxy port not defined');
		dfr.complete('failure');
	}

	return dfr;
};
