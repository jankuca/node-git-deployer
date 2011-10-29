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
		var restarter = new Restarter(proxy_port);
		var name = dirname.match(/\/([^\/]+)\/[^\/]+\/?$/)[1];
		restarter.restart(name, version).pipe(dfr);
	} else {
		console.error('RESTARTER: Proxy port not defined');
		dfr.complete('failure');
	}

	return dfr;
};
