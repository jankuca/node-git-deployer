var FS = require('fs');
var Path = require('path');
var Repository = require('node-gitrepo');
var Deferred = require('deferred');

var exec = require('child_process').exec;


/**
 * @constructor
 * @param {!Repository} repo The repository from which to deploy
 */
var Deployer = function (repo) {
	this.repo_ = repo;
	this.updated_ = {};
	this.deleted_ = [];

	this.verbose_logging = false;

	/**
	 * @type {Object.<string, Array.<function():Deferred>>}
	 */
	this.after_update_callbacks_ = {};
};

Deployer.prototype.enableVerboseLogging = function () {
	this.verbose_logging = true;
};

/**
 * Outputs deployment process results (created, updated)
 */
Deployer.prototype.logResults = function () {
	if (Object.keys(this.updated_).length) {
		console.info('The following deployment targets were updated:');
		var updated = this.updated_;
		Object.keys(updated).forEach(function (version) {
			var item = updated[version];
			console.info([
				version, ' (', (item[0] || 'EMPTY'), ' -> ', item[1], ')'
			].join(''));
		});
	}

	if (this.deleted_.length) {
		console.info('The following deployment targets were deleted:');
		console.info(this.deleted_.join(', '));
	}
};

/**
 * Initiates the deployment process
 * @param {string} target_root The target repository directory path
 */
Deployer.prototype.deployTo = function (target_root) {
	this.target_root_ = target_root;

	var dfr = new Deferred();

	if (!FS.existsSync(target_root)) {
		var err = new Error('The deployment target root (' + target_root + ') does not exist.');
		console.error('-- The deployment process could not be initialized.');
		console.error(err.message);
		dfr.complete('failure', err.message);
		return dfr;
	}

	console.info('-- The deployment process initiated.');
	console.info(this.repo_.git_dir, '->', target_root);

	function onSuccess() {
		var result = {
			updated: this.updated_
		};
		if (Object.keys(this.updated_).length) {
			this.logResults();
			this.storeBranchState_().thenEnsure(function () {
				dfr.complete('success', result);
			});
		} else {
			console.info('== No changes');
			dfr.complete('success', result);
		}
	}
	function onFailure(err) {
		console.error('-- The deployment process failed.');
		if (Object.keys(this.updated_).length) {
			console.info('However...');
			this.logResults();
		}
		console.error("\n" + err.stack + "\n");
		dfr.complete('failure', err);
	}

	this.listBranches_().then(function (result) {
		if (result.updated.length !== 0) {
			console.info('-- The following deployment targets have changes:');
			console.info(result.updated.map(function (item) {
				return item[0];
			}).join(', '));
		}
		if (result.deleted.length !== 0) {
			console.info('-- The following deployment targets are no longer needed:');
			console.info(result.deleted.join(', '));
		}

		this.deleteTargets_(result.deleted).thenEnsure(function () {
			this.updateTargets_(result.updated).then(onSuccess, onFailure, this);
		}, this);
	}, onFailure, this);

	return dfr;
};

/**
 * Lists all branches (all, created, updated)
 * @return {!Deferred}
 */
Deployer.prototype.listBranches_ = function () {
	var self = this;
	var dfr = new Deferred();

	var result = {
		all: [],
		created: [],
		updated: [],
		deleted: []
	};

	this.repo_.listBranchesAndTipCommits(function (err, map) {
		if (err) {
			dfr.complete('failure', err);
		} else {
			var prev = self.getPreviousBranchState_();
			var prev_branches = Object.keys(prev);

			result.deleted = prev_branches.slice();

			Object.keys(map).forEach(function (branch) {
				if (prev_branches.indexOf(branch) === -1) {
					result.created.push(branch);
					result.updated.push([branch, null, map[branch]]);
				} else if (prev[branch] !== map[branch]) {
					result.updated.push([branch, prev[branch], map[branch]]);
				}

				// deleted
				var index = result.deleted.indexOf(branch);
				if (index !== -1) {
					result.deleted.splice(index, 1);
				}

				result.all.push(branch);
			});
			dfr.complete('success', result);
		}
	});

	return dfr;
};

/**
 * Gets previous branch state from an ini file stored in the target root
 */
Deployer.prototype.getPreviousBranchState_ = function () {
	var path = Path.join(this.target_root_, '.node-git-deployer.json');
	var state = {};
	try {
		state = JSON.parse(FS.readFileSync(path, 'utf8'));
	} catch (err) {}

	return state;
};

/**
 * Stores current branch state in an ini file stored in the target root
 * @return {!Deferred}
 */
Deployer.prototype.storeBranchState_ = function () {
	var dfr = new Deferred();
	var path = Path.join(this.target_root_, '.node-git-deployer.json');
	this.repo_.listBranchesAndTipCommits(function (err, state) {
		try {
			FS.writeFileSync(path, JSON.stringify(state), 'utf8');
			dfr.complete('success');
		} catch (write_err) {
			console.warn('Failed to store the new branch state. ' +
				'The next deployment will work with the old state.');
			console.error(write_err.stack);
			dfr.complete('failure', write_err);
		}
	});

	return dfr;
};

/**
 * Creates a target repository
 * @param	{string} name Target basename
 * @return {!Deferred}
 */
Deployer.prototype.createNewTarget_ = function (name) {
	var dfr = new Deferred();

	var root = this.target_root_;
	var source = this.repo_;
	var dirname = Path.join(root, name);

	try {
		FS.mkdirSync(dirname, 0777);
	} catch (err) {
		return dfr.complete('failure', err);
	}

	var target = new Repository(dirname);
	target.init(function (err) {
		if (err) {
			return dfr.complete('failure', err);
		}
		target.addRemote('origin', source.git_dir, function (err) {
			if (err) {
				return dfr.complete('failure', err);
			}
			dfr.complete('success', target);
		});
	});

	return dfr;
};

/**
 * Updates deployment targets
 * @param {Array.<string>} targets A list of targets
 * @return {!Deferred}
 */
Deployer.prototype.deleteTargets_ = function (targets) {
	var deleted = this.deleted_;
	var dfr = new Deferred();

	var self = this;
	var root = this.target_root_;

	var i = 0;
	(function iter() {
		if (i === targets.length) {
			return dfr.complete('success');
		}

		var name = targets[i++];
		var dirname = Path.join(root, self.getSafeVersionName(name));
		self.removeDirectory_(dirname).then(function () {
			deleted.push(name);
			iter();
		}, iter)
	}());

	return dfr;
};

/**
 * Updates deployment targets
 * @param {!Array.<Array.<string>>} targets A list of targets
 * @return {!Deferred}
 */
Deployer.prototype.updateTargets_ = function (targets) {
	var updated = this.updated_;
	var dfr = new Deferred();

	var self = this;
	var i = 0;
	(function iter() {
		if (i === targets.length) {
			return dfr.complete('success');
		}

		var target = targets[i++];
		self.updateTarget_(target[0]).then(function () {
			updated[target[0]] = [target[1], target[2]];
		}).thenEnsure(iter);
	}());

	return dfr;
};

/**
 * Updates a deployment target and runs its middleware sequence
 * @param {string} name Target basename
 * @return {!Deferred}
 */
Deployer.prototype.updateTarget_ = function (name) {
	var dfr = new Deferred();

	var self = this;
	var root = this.target_root_;
	var safe_name = this.getSafeVersionName(name);
	var dirname = Path.join(root, safe_name);
	var temp_dirname = Path.join(root, this.getTempVersionName_(safe_name));
	var rollback_dirname = Path.join(root, this.getRollbackVersionName_(safe_name));

	console.info('== Deploying ' + name + (name !== safe_name ? ' as ' + safe_name : ''));

	this.createNewTarget_(this.getTempVersionName_(safe_name)).then(function (repo) {
		console.info('-- Created an empty deployment target');
		console.info('-- Pulling current code');

		var onSuccess = function () {
			// Rename the old directory for eventual rollback
			if (FS.existsSync(dirname)) {
				FS.renameSync(dirname, rollback_dirname);
				console.info('-- The old version stored for an eventual rollback');
			}

			// Rename the new directory to complete the swapping
			FS.renameSync(temp_dirname, dirname);

			// Run registered after-update middleware callbacks
			var callbacks = self.after_update_callbacks_[name];
			console.info('-- Running registered after-update middleware callbacks (' + callbacks.length + ')');
			var i = 0;
			(function iter() {
				if (i === callbacks.length) {
					console.info('== Successfully deployed ' + name + (name !== safe_name ? ' as ' + safe_name : ''));
					dfr.complete('success');
				} else {
					var callback = callbacks[i++];
					callback().then(iter, function (err) {
						console.error('-- The callback sequence failed. ROLLBACK!');

						FS.renameSync(dirname, temp_dirname);
						if (FS.existsSync(rollback_dirname)) {
							FS.renameSync(rollback_dirname, dirname);
							console.info('-- Successfully rolled back');
							console.warn('!! Make sure your app is running. The callback sequence might have fucked up pretty bad.');
						} else {
							console.info('-- No old version to rollback to');
						}

						onFailure();
					});
				}
			}());
		};
		var onFailure = function () {
			console.error('== Failed to deploy ' + name);

			self.removeDirectory_(temp_dirname).then(function () {
				console.info('-- Removed the temporary deployment target ' + temp_dirname);
			}, function () {
				console.error('-- Failed to remove the temporary deployment target ' + temp_dirname);
				console.error('!! You have to solve this situation manually before the next deployment of ' + name + '.');
				console.log('ssh ' + process.ENV.USER + '@(server) rm -rf ' + temp_dirname);
			}).thenEnsure(function () {
				dfr.complete('failure');
			});
		};

		// Pull the root repository
		var pull_op = repo.pull('origin', name, function (err) {
			if (err) {
				console.error('-- Failed to pull the code: ' + err.message);
				onFailure();
				return;
			}

			console.info('-- Pulling the submodule structure');
			// Update submodules
			var submodule_update_op = repo.updateSubmodules(function (err) {
				if (err) {
					console.error('-- Failed to pull all submodules: ' + err.message);
					onFailure();
					return;
				}

				console.info('-- The deployment target ' + name + ' successfully updated');

				// Run the middleware sequence
				self.runVersionMiddleware_(name).then(function () {
					// Remove the old rollback directory
					if (FS.existsSync(rollback_dirname)) {
						self.removeDirectory_(rollback_dirname).then(onSuccess, function () {
							console.error('-- Failed to remove the rollback directory ' + rollback_dirname);
							onFailure();
						});
					} else {
						onSuccess();
					}
				}, onFailure);
			});

			if (self.verbose_logging) {
				submodule_update_op.stdout.on('data', function (chunk) {
					process.stdout.write(chunk);
				});
			}
		});

		if (self.verbose_logging) {
			pull_op.stdout.on('data', function (chunk) {
				process.stdout.write(chunk);
			});
		}
	}, dfr);

	return dfr;
};

/**
 * Removes a directory together with all of its contents
 * @param {string} dirname
 */
Deployer.prototype.removeDirectory_ = function (dirname) {
	var dfr = new Deferred();

	var log = '';
	var rm_op = exec('rm -rf ' + dirname);
	rm_op.stdout.on('data', function (chunk) {
		log += chunk;
	});
	rm_op.on('exit', function (code) {
		if (code === 0) {
			dfr.complete('success');
		} else {
			dfr.complete('failure', new Error(
				'Failed to remove the directory ' + dirname + ': ' + log));
		}
	});

	return dfr;
};

/**
 * Runs registered middleware for the given version
 *   If one of the middleware fails, the whole sequence ends with a failure.
 * @param {string} version The name of the version
 * @return {Deferred}
 */
Deployer.prototype.runVersionMiddleware_ = function (version) {
	var dfr = new Deferred();

	var safe_version = this.getSafeVersionName(version);

	var callbacks = [];
	this.after_update_callbacks_[version] = callbacks;

	var self = this;
	var seq = this.getVersionMiddlewareSequence_(version);
	if (seq.length) {
		console.info('-- Running middleware sequence for ' + version);
		console.info(seq.map(function (task) {
			return task.name;
		}).join(', '));
		(function iter(i) {
			if (i !== seq.length) {
				var task = seq[i];
				var dirname = Path.join(self.target_root_, self.getTempVersionName_(safe_version));
				var middleware = Deployer.middleware[task.name];
				middleware(version, dirname, task.data).then(function (callback) {
					if (typeof callback === 'function') {
						// The middleware is registering an after-update callback
						callbacks.push(callback);
					}
					iter(++i);
				}, function (err) {
					console.error('-- Middleware sequence for ' + version + ' failed at ' + task.name + '.');
					dfr.complete('failure', err);
				});
			} else {
				console.info('-- Middleware sequence for ' + version + ' finished successfully.');
				dfr.complete('success');
			}
		}(0));
	} else {
		dfr.complete('success');
	}

	return dfr;
};

/**
 * Returns a middleware sequence for the given version
 * @param {string} version The name of the version
 * @return {Array.<Object.{name: string, data}>} A middleware sequence
 */
Deployer.prototype.getVersionMiddlewareSequence_ = function (version) {
	var safe_version = this.getSafeVersionName(version);

	var seq = [];
	var config = this.getVersionConfig_(this.getTempVersionName_(safe_version), 'middleware');
	if (config === null) {
		console.warn('-- No middleware configuration found');
		return seq;
	}
	config.forEach(function (item) {
		item = (typeof item === 'object') ? item : { 'name': item };
		if (Array.isArray(item['versions']) && item['versions'].indexOf(version) === -1) {
			return;
		}
		if (!item['version'] || item['version'] === version) {
			seq.push({
				name: item['name'],
				data: item['data'] || null
			});
		}
	});
	return seq;
};

/**
 * Retruns configuration for the given version
 * @param {string} safe_version The name of the version
 * @param {string} key The configuration key to return
 * @return {*}
 */
Deployer.prototype.getVersionConfig_ = function (safe_version, key) {
	if (this.config_ === undefined) {
		this.loadVersionConfig_(safe_version);
	}
	if (this.config_ !== null) {
		return this.config_[key] || null;
	}
	return null;
};

/**
 * Loads configuration for the given version from a .deployerinfo.json file
 * @param {string} safe_version The name of the version
 */
Deployer.prototype.loadVersionConfig_ = function (safe_version) {
	var path = Path.join(this.target_root_, safe_version, '.deployerinfo.json');
	try {
		var data = FS.readFileSync(path, 'utf8');
		this.config_ = JSON.parse(data);
	} catch (err) {
		this.config_ = null;
	}
};

/**
 * Returns a safe version name that can be used as a directory name
 * @param {string} name
 * @param {string}
 */
Deployer.prototype.getSafeVersionName = function (name) {
	return name
		.replace(/\./g, '_')
		.replace(/\//g, '--');
};

/**
 * Returns a temporary version name
 * @param {string} name
 * @return {string}
 */
Deployer.prototype.getTempVersionName_ = function (name) {
	return '.' + name + '.part';
};

/**
 * Returns a rollback version name
 * @param {string} name
 * @return {string}
 */
Deployer.prototype.getRollbackVersionName_ = function (name) {
	return '.' + name + '.rollback';
};

/**
 * @type {Object.<string, function(string, string, *): Deferred>} result
 */
Deployer.middleware = {};


module.exports = Deployer;
