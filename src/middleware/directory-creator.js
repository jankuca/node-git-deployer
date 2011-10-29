var FS = require('fs');
var Path = require('path');
var Deferred = require('deferred');

var exec = require('child_process').exec;


/**
 * Middleware that creates empty directories
 * @param {string} version The version name
 * @param {string} dirname Path to the deployment target
 * @param {*} data
 * @return {Deferred}
 */
module.exports = function (version, dirname, data) {
	var dfr = new Deferred();

	if (Array.isArray(data)) {
		(function iter(i) {
			if (i !== data.length) {
				var path = Path.resolve(dirname, data[i]);
				if (!Path.existsSync(path)) {
					var proc = exec('mkdir -m 0777 -p ' + path);
					var log = '';
					proc.stdout.on('data', function (chunk) {
						log += chunk;
					});
					proc.stderr.on('data', function (chunk) {
						log += chunk;
					});
					proc.on('exit', function (code) {
						if (code === 0) {
							console.info('DIRECTORY CREATOR: Created ' + path);
						} else if (!Path.existsSync(path)) {
							console.error('DIRECTORY CREATOR: Failed to create ' + path);
							console.error(log);
						}
						iter(++i);
					});
				} else {
					iter(++i);
				}
			} else {
				dfr.complete('success');
			}
		}(0));
	} else {
		dfr.complete('success');
	}

	return dfr;
};
