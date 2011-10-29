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
		var input = item[1]['input'];
		var paths = item[1]['paths'] || [];
		var sources = item[1]['sources'] || [];
		var options = item[1]['options'] || {};

		var next = function () {
			this.loop_().pipe(dfr);
		};

		if (input) {
			sources.forEach(function (source) {
				options.push([ 'js', source ]);
			});
			this.runCalcdeps_(input, paths, options, item[0]).then(next, dfr, this);
		} else {
			this.runCompiler_(sources, options, item[0]).then(next, dfr, this);
		}
	} else {
		dfr.complete('success');
	}
	return dfr;
};

/**
 * Runs Google Closure Compiler
 * @param {Array.<string>} sources A list of files to compile
 * @param {!Object} options Options to pass to the compiler
 * @param {string} target The path to the compilation target
 * @return {Deferred}
 */
Compiler.prototype.runCompiler_ = function (sources, options, target) {
	var command = this.buildCompilerCommand_(sources, options, target);
	var dfr = this.exec_(command);

	dfr.then(function () {
		console.info('CLOSURE COMPILER: Successfully compiled to ' + target);
	}, function (log) {
		console.error('CLOSURE COMPILER: Failed to compile to ' + target);
		console.log(log);
	});

	return dfr;
};

/**
 * Runs Google Closure Calcdeps script which runs the Compiler
 * @param {string} input The input file
 * @param {Array.<string>} paths A list of paths in which to look for dependencies
 * @param {!Object} options Options to pass to the script
 * @return {Deferred}
 */
Compiler.prototype.runCalcdeps_ = function (input, paths, options, target) {
	var goog_index = paths.indexOf('$GOOG');
	if (goog_index !== -1) {
		paths[goog_index] = Path.join(module.exports.closure_root, 'goog');
	}

	var command = this.buildCalcdepsCommand_(input, paths, options, target);
	var dfr = this.exec_(command);

	dfr.then(function () {
		console.info('CLOSURE COMPILER: Successfully compiled to ' + target);
	}, function (log) {
		console.error('CLOSURE COMPILER: Failed to compile to ' + target);
		console.log(log);
	});

	return dfr;
};

/**
 * Runs a compilation command
 * @param {string} command The actual command to run
 * @return {Deferred}
 */
Compiler.prototype.exec_ = function (command) {
	var dfr = new Deferred();
	var proc = exec(command);
	var log = [];
	proc.stderr.on('data', function (chunk) {
		log.push(chunk);
	});
	proc.on('exit', function (code) {
		if (code === 0) {
			dfr.complete('success');
		} else {
			dfr.complete('failure', log.join(''));
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
		command += ' --js ' + Path.resolve(root, source);
	});
	command += ' --js_output_file ' + Path.join(root, target);
	options.forEach(function (option) {
		command += ' --' + option[0] + ' ' + option[1];
	});
	return command;
};

/**
 * Returns a command to run in order to run the calcdeps.py script
 * @param {string} input The input file
 * @param {Array.<string>} sources A list of files to compile
 * @param {!Object} options Options to pass to the compiler
 * @param {string} target The path to the compilation target
 */
Compiler.prototype.buildCalcdepsCommand_ = function (input, paths, options, target) {
	var root = this.root_;

	var command = Path.join(module.exports.closure_root, 'bin', 'calcdeps.py');
	command += ' --output_mode compiled'
	command += ' --compiler_jar ' + Path.join(module.exports.closure_root, 'bin', 'compiler.jar');

	paths.forEach(function (path) {
		command += ' --path ' + Path.resolve(root, path);
	});
	command += ' --input ' + Path.join(root, input);

	options.forEach(function (option) {
		command += ' --compiler_flags "--' + option[0] + '=' + option[1].replace('"', '\\"') + '"';
	});

	command += ' > ' + Path.join(root, target);

	return command;
};

/**
 * Initiates the middleware
 * @param {string} version The name of the version
 * @param {string} dirname The path to the deployment target
 * @param {Object} sheet A map of tasks
 * @return {Deferred}
 */
module.exports = function (version, dirname, sheet) {
	var dfr = new Deferred();

	if (!module.exports.closure_root) {
		console.error('CLOSURE COMPILER: Closure root not defined');
		dfr.complete('failure');
	} else {
		if (sheet && Object.keys(sheet).length) {
			var compiler = new Compiler(dirname);
			compiler.compile(sheet).pipe(dfr);
		} else {
			console.info('CLOSURE COMPILER: Nothing to compile');
			dfr.complete('success');
		}
	}

	return dfr;
};
