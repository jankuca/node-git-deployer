var FS = require('fs');
var Path = require('path');
var Deferred = require('deferred');

var exec = require('child_process').exec;


/**
 * Middleware that compiles JavaScript files using Google Closure Compiler
 * @constructor
 * @param {string} root The path to the version directory
 */
var Compiler = function (root) {
	this.root_ = root;
	this.queue_ = [];
};

/**
 * Passes a map of compiler tasks to the compiler
 * @param {Object.<string, Object.{
 *   sources: Array.<string>,
 *   options: (Object|undefined)
 * }>} A map of tasks
 * @return {Deferred}
 */
Compiler.prototype.compile = function (sheet) {
	Object.keys(sheet).forEach(function (target) {
		this.queue_.push([ target, sheet[target] ]);
	}, this);
	return this.loop_();
};

/**
 * Loops through the queue and passes one task to the compiler at a time
 * @return {Deferred}
 */
Compiler.prototype.loop_ = function () {
	var dfr = new Deferred();
	var item = this.queue_.shift();
	if (item) {
		var sources = item[1]['sources'];
		var options = item[1]['options'] || {};
		this.runCompiler_(sources, options, item[0]).then(function () {
			this.loop_().pipe(dfr);
		}, function (err) {
			dfr.complete('failure', err);
		}, this);
	} else {
		dfr.complete('success');
	}
	return dfr;
};

/**
 * Actually runs Google Closure Compiler and handles the result
 * @param {Array.<string>} sources A list of files to compile
 * @param {!Object} options Options to pass to the compiler
 * @param {string} target The path to the compilation target
 * @return {Deferred}
 */
Compiler.prototype.runCompiler_ = function (sources, options, target) {
	var dfr = new Deferred();
	var command = this.buildCompilerCommand_(sources, options, target);
	var proc = exec(command);
	var log = [];
	proc.stderr.on('data', function (chunk) {
		log.push(chunk);
	});
	proc.on('exit', function (code) {
		if (code === 0) {
			console.info('CLOSURE COMPILER: Successfully compiled to ' + target);
			dfr.complete('success');
		} else {
			console.error('CLOSURE COMPILER: Failed to compile to ' + target);
			log.forEach(function (line) {
				console.error(line);
			});
			dfr.complete('failure');
		}
	});
	return dfr;
};

/**
 * Returns a command to run in order to run the compiler
 * @param {Array.<string>} sources A list of files to compile
 * @param {!Object} options Options to pass to the compiler
 * @param {string} target The path to the compilation target
 * @return {string} The command
 */
 Compiler.prototype.buildCompilerCommand_ = function (sources, options, target) {
	var root = this.root_;
	var command = 'java -jar ' + Path.join(module.exports.closure_root, 'bin', 'compiler.jar');
	sources.forEach(function (source) {
		command += ' --js ' + Path.join(root, source);
	});
	command += ' --js_output_file ' + Path.join(root, target);
	options.forEach(function (option) {
		command += ' --' + option[0] + ' ' + option[1];
	});
	return command;
};


/**
 * Initiates the middleware
 * @param {string} root The path to the deployment target
 * @param {string} version The name of the version
 * @param {Object} sheet A map of tasks
 * @return {Deferred}
 */
module.exports = function (root, version, sheet) {
	var dfr = new Deferred();

	if (!module.exports.closure_root) {
		console.error('CLOSURE COMPILER: Closure root not defined');
		dfr.complete('failure');
	} else {
		if (sheet && Object.keys(sheet).length) {
			var compiler = new Compiler(Path.join(root, version));
			compiler.compile(sheet).pipe(dfr);
		} else {
			console.info('CLOSURE COMPILER: Nothing to compile');
			dfr.complete('success');
		}
	}

	return dfr;
};
