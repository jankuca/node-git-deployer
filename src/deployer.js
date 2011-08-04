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
	this.updated_ = [];
};

/**
 * Outputs deployment process results (created, updated)
 */
Deployer.prototype.logResults = function () {
	if (this.created_.length) {
		console.info('The following new deployment targets were created:');
		console.info(this.created_.join(', '));
	}
	if (this.updated.length) {
		console.info('The following deployment targets were updated:');
		this.updated_.forEach(function (item) {
			console.info([
				item[0], ' (', (item[1] || 'EMPTY'), ' -> ', item[2], ')'
			].join(''));
		});
	}
};

/**
 * Initiates the deployment process
 * @param {string} target_root The target repository directory path
 */
Deployer.prototype.deployTo = function (target_root) {
	this.target_root = target_root;

	var dfr = new Deferred();

	console.info('-- The deployment process initiated.');

	function onSuccess() {
		console.info('== Successfully deployed!');
		if (this.created_.length || this.updated_.length) {
			this.logResults();
		} else {
			console.info('However, no changes were made.');
		}
	}
	function onFailure(err) {
		console.error('-- The deployment process failed.');
		if (this.created_.length || this.updated_.length) {
			console.info('However...');
			this.logResults();
		}
		dfr.complete('failure', err);
	}

	this.listBranches_().then(function (result) {
		this.createNewTargets_(result.created).then(function () {
			this.updateTargets_(result.updated).then(onSuccess, onFailure, this);
		}, onFailure, this);
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
	var ini_path = Path.join(this.target_root, '.node-git-deployer.ini');

	var result = {
		all: [],
		created: [],
		updated: []
	};

	this.repo_.listBranchesAndTipCommits(function (err, map) {
		if (err) {
			dfr.complete('failure', err);
		} else {
			var prev = self.getPreviousBranchInfo_();
			var prev_branches = Object.keys(prev);

			Object.keys(map).forEach(function (branch) {
				if (prev_branches.indexOf(branch) === -1) {
					result.created.push(branch);
					result.updated.push([branch, null, map[branch]]);
				}
				if (prev[branch] !== map[branch]) {
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
Deployer.prototype.getPreviousBranchInfo_ = function () {
	var data = [];
	try {
		data = FS.readFileSync(ini_path, 'utf8').split("\n");
	} catch (err) {}

	var prev = {};
	data.forEach(function (line) {
		if (line) {
			var match = line.match(/(\S+)\s*=\s*"([^"]*)"/);
			prev[line[0]] = line[1];
		}
	});

	return prev;
};

/**
 * Creates target directories
 * @param {!Array} names A list of target basenames
 * @return {!Deferred}
 */
Deployer.prototype.createNewTargets_ = function (names) {
	var created = this.created_;
	var source = this.repo_;
	var root = this.target_root;
	var dfr = new Deferred();

	var i = 0;
	(function iter() {
		if (i === ii) {
			return dfr.complete('success');
		}

		var name = names[i++];
		var dirname = Path.join(root, name);
		try {
			FS.mkdirSync(dirname);
		} catch (err) {
			return dfr.complete('failure', err);
		}

		var target = new Repository(dirname);
		target.init(function () {
			target.addRemote('origin', source.git_dir, iter);
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
	var root = this.target_root;
	var dfr = new Deferred();

	var i = 0;
	(function iter() {
		if (i === ii) {
			return dfr.complete('success');
		}

		var target = targets[i++];
		var dirname = Path.join(root, target[0]);
		var target = new Repository(dirname);
		target.pull('origin', name, function (err) {
			if (err) {
				dfr.complete('failure', err);
			} else {
				updated.push(target);
				iter();
			}
		});
	}());

	return dfr;
};


module.exports = Deployer;
