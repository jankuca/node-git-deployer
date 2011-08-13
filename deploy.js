var Path = require('path');

require.paths.unshift(Path.join(__dirname, 'lib'));

require('node-color-console');

var Repository = require('node-gitrepo');
var Deployer = require('./index');
var Starter = require('./src/starter');

var input = require('process-input');

var source_dirname = process.cwd();
var source_repo = new Repository(source_dirname, true);
var deployer = new Deployer(source_repo);

var name = Path.basename(source_dirname, '.git');
var target_dirname = Path.join(input.params.to, name);
var proxy_port = Number(input.params['proxy-port']) || null;

var dfr = deployer.deployTo(target_dirname);
if (proxy_port) {
	dfr.then(function (result) {
		var versions = result.updated.map(function (item) {
			return item[0];
		});
		var starter = new Starter(name, proxy_port);
		starter.restartVersions(versions);
	});
}
