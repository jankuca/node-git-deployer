var Path = require('path');

require.paths.unshift(Path.join(__dirname, 'lib'));

var Repository = require('node-gitrepo');
var Deployer = require('./index');

var source_dirname = process.cwd();
var source_repo = new Repository(source_dirname, true);
var deployer = new Deployer(source_repo);

var name = Path.basename(source_dirname, '.git');
var target_dirname = Path.join('/var/apps', name);
deployer.deployTo(target_dirname);
