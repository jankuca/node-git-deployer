var FS = require('fs');
var Path = require('path');
var Deferred = require('deferred');


/**
 * Middleware that creates empty directories
 * @param {string} target_root Path to the deployment target
 * @param {Object.{created: Array.<string>, updated: Object.{string, Array}} result
 * @return {Deferred}
 */
module.exports = function (root, version, data) {
	var dfr = new Deferred();

	if (Array.isArray(data)) {
		(function iter(i) {
			if (i !== data.length) {
				var path = Path.join(root, version, data[i]);
				FS.mkdir(path, 0775, function (err) {
					if (!err) {
						console.info('DIRECTORY CREATOR: Created ' + path);
					} else if (!Path.existsSync(path)) {
						console.error('DIRECTORY CREATOR: Failed to create ' + path);
						console.error(err.message);
					}
					iter(++i);
				});
			} else {
				dfr.complete('success');
			}
		}(0));
	} else {
		dfr.complete('success');
	}

	return dfr;
};
