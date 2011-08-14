var Path = require('path');
var Repository = require('node-gitrepo');
var Deployer = require('./index');

// Have colored console messages
require('node-color-console');

// Parse ARGV
var input = require('process-input');
global.input = input; // important for middleware

// Add whatever middleware you need
Deployer.middleware.push(require('./middleware/starter'));

// Use the source repository
var source_dirname = process.cwd();
var source_repo = new Repository(source_dirname, true);
var deployer = new Deployer(source_repo);

// Initiate the deployment process
var name = Path.basename(source_dirname, '.git');
var target_dirname = Path.join(input.params.to, name);
deployer.deployTo(target_dirname);
