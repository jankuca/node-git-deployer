# node-git-deployer

This is a lightweight deployment solution for git repository-based servers.

It is executed from a post-update hook of any server-side bare repository and deploys all of its branches into a specific deployment location.

## Installation

You need to put attach a `post-update` hook to the repository. A sample hook is provided to get the idea.

The following is the simplest way to set up the deployer for every repository if you use gitolite on your server. (Any other repository management solution should not be much different.)

    Get into the location where you want to have the deployer on the server
    # cd ~

    Clone the repository and get its submodules
    # git clone git://...(get the URL from above)... deployer
    # git submodule update --init --recursive

    Copy the provided sample hook to the hooks directory
    # cp post-update-hook.sh ~/.gitolite/hooks/common/post-update

    Modify the settings to fit your needs
    # nano ~/.gitolite/hooks/common/post-update

    Notify gitolite about the new hook
    # gl-setup yourkey.pub



