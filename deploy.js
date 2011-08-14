var Path = require('path');

require('node-color-console');

var Repository = require('node-gitrepo');
var Deployer = require('./index');

var input = require('process-input');
global.input = input;

var source_dirname = process.cwd();
var source_repo = new Repository(source_dirname, true);
var deployer = new Deployer(source_repo);

var name = Path.basename(source_dirname, '.git');
var target_dirname = Path.join(input.params.to, name);

deployer.deployTo(target_dirname);
