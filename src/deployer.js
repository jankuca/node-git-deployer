var FS = require('fs');
var Path = require('path');
var Repository = require('node-gitrepo');
var Deferred = require('deferred');


/**
 * @constructor
 * @param {!Repository} repo The repository from which to deploy
 */
var Deployer = function (repo) {
	this.repo_ = repo;

	this.created_ = [];
	this.updated_ = {};
};

/**
 * Outputs deployment process results (created, updated)
 */
Deployer.prototype.logResults = function () {
	if (this.created_.length) {
		console.info('The following new deployment targets were created:');
		console.info(this.created_.join(', '));
	}
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
};

/**
 * Initiates the deployment process
 * @param {string} target_root The target repository directory path
 */
Deployer.prototype.deployTo = function (target_root) {
	this.target_root_ = target_root;

	var dfr = new Deferred();

	if (!Path.existsSync(target_root)) {
		var err = new Error('The deployment target root (' + target_root + ') does not exist.');
		console.error('-- The deployment process could not be initialized.');
		console.error(err.message);
		dfr.complete('failure', err.message);
		return dfr;
	}

	console.info('-- The deployment process initiated.');
	console.info(this.repo_.git_dir, '->', target_root);

	function onSuccess() {
		console.info('== Successfully deployed!');
		var result = {
			created: this.created_,
			updated: this.updated_
		};
		if (this.created_.length || Object.keys(this.updated_).length) {
			this.logResults();
			this.storeBranchState_().thenEnsure(function () {
				dfr.complete('success', result);
			});
		} else {
			console.info('However, no changes were made.');
			dfr.complete('success', result);
		}
	}
	function onFailure(err) {
		console.error('-- The deployment process failed.');
		if (this.created_.length || Object.keys(this.updated_).length) {
			console.info('However...');
			this.logResults();
		}
		console.error("\n" + err.stack + "\n");
		dfr.complete('failure', err);
	}

	this.listBranches_().then(function (result) {
		this.createNewTargets_(result.created).then(function () {
			this.updateTargets_(result.updated).then(onSuccess, onFailure, this);
		}, onFailure, this);
	}, onFailure, this);

	// Middleware
	dfr.thenEnsure(this.runMiddleware_, this);

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
		updated: []
	};

	this.repo_.listBranchesAndTipCommits(function (err, map) {
		if (err) {
			dfr.complete('failure', err);
		} else {
			var prev = self.getPreviousBranchState_();
			var prev_branches = Object.keys(prev);

			Object.keys(map).forEach(function (branch) {
				if (prev_branches.indexOf(branch) === -1) {
					result.created.push(branch);
					result.updated.push([branch, null, map[branch]]);
				} else if (prev[branch] !== map[branch]) {
					result.updated.push([branch, prev[branch], map[branch]]);
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
 * Creates target directories
 * @param {!Array} names A list of target basenames
 * @return {!Deferred}
 */
Deployer.prototype.createNewTargets_ = function (names) {
	var created = this.created_;
	var source = this.repo_;
	var root = this.target_root_;
	var dfr = new Deferred();

	var i = 0;
	(function iter() {
		if (i === names.length) {
			return dfr.complete('success');
		}

		var name = names[i++];
		var dirname = Path.join(root, name);
		try {
			FS.mkdirSync(dirname, 0777);
		} catch (err) {
			if (err.code !== 'EEXIST') {
				return dfr.complete('failure', err);
			} else {
				return iter();
			}
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
				iter();
			});
			created.push(name);
		});
	}());

	return dfr;
};

/**
 * Update targets
 * @param {!Array.<Array>} targets A list of targets
 * @return {!Deferred}
 */
Deployer.prototype.updateTargets_ = function (targets) {
	var updated = this.updated_;
	var root = this.target_root_;
	var dfr = new Deferred();

	var i = 0;
	(function iter() {
		if (i === targets.length) {
			return dfr.complete('success');
		}

		var target = targets[i++];
		var dirname = Path.join(root, target[0]);
		var repo = new Repository(dirname);
		repo.pull('origin', target[0], function (err) {
			if (err) {
				return dfr.complete('failure', err);
			}
			repo.updateSubmodules(function (err) {
				if (err) {
					return dfr.complete('failure', err);
				}
				updated[target[0]] = [target[1], target[2]];
				iter();
			});
		});
	}());

	return dfr;
};

/**
 * Loops through all registered middleware for each updated version
 *   If a middleware sequence for one version ends with a failure,
 *   the version loop continues.
 * @return {Deferred}
 */
Deployer.prototype.runMiddleware_ = function () {
	var dfr = new Deferred();

	var self = this;
	var versions = Object.keys(this.updated_);
	(function iter(i) {
		if (i !== versions.length) {
			self.runVersionMiddleware_(versions[i]).thenEnsure(function () {
				iter(++i);
			});
		} else {
			dfr.complete('success');
		}
	}(0));

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

	var self = this;
	var seq = this.getVersionMiddlewareSequence_(version);
	if (seq.length) {
		console.info('-- Running middleware sequence for ' + version);
		(function iter(i) {
			if (i !== seq.length) {
				var task = seq[i];
				var middleware = Deployer.middleware[task.name];
				middleware(self.target_root_, version, task.data).then(function () {
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
	}

	return dfr;
};

/**
 * Returns a middleware sequence for the given version
 * @param {string} version The name of the version
 * @return {Array.<Object.{name: string, data}>} A middleware sequence
 */
Deployer.prototype.getVersionMiddlewareSequence_ = function (version) {
	var seq = [];
	var config = this.getVersionConfig_(version, 'middleware');
	if (config === null) {
		console.info('-- No middleware configuration found');
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
 * @param {string} version The name of the version
 * @param {string} key The configuration key to return
 * @return {*}
 */
Deployer.prototype.getVersionConfig_ = function (version, key) {
	if (this.config_ === undefined) {
		this.loadVersionConfig_(version);
	}
	if (this.config_ !== null) {
		return this.config_[key] || null;
	}
	return null;
};

/**
 * Loads configuration for the given version from a .deployerinfo.json file
 * @param {string} version The name of the version
 */
Deployer.prototype.loadVersionConfig_ = function (version) {
	var path = Path.join(this.target_root_, version, '.deployerinfo.json');
	try {
		var data = FS.readFileSync(path, 'utf8');
		this.config_ = JSON.parse(data);
	} catch (err) {
		this.config_ = null;
	}
};


/**
 * @type {Object.<string, function(string, Object.{
 *   created: Array.<string>,
 *   updated: Object.{string, Array}
 * }) : Deferred>} result
 */
Deployer.middleware = {};


module.exports = Deployer;
