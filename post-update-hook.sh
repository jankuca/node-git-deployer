
#!/bin/bash

# We need to fix the environment.
# The GIT_DIR variable overrides the directory we call "git" from in the hook.
unset GIT_DIR

# Put the correct path to the deployment script here.
# Also specify the deployment target path.
#   The repository name will be appended
#   If a repository called /whatever/abc.git gets updated,
#   its branches are deployed into /var/apps/abc if you keep the setting below.
node ~/deployer/deploy.js \
	-to /var/apps
