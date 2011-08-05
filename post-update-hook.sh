
#!/bin/bash

# We need to fix the environment.
# The GIT_DIR variable overrides the directory we call "git" from in the hook.
unset GIT_DIR

# Put the correct path to the deployer here:
node ~/deployer/deploy.js
