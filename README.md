# vscode-hub

`vscode-hub` is like [jupyterhub](https://github.com/jupyterhub/jupyterhub) but for [VS Code](https://github.com/Microsoft/vscode), based on [code-server](https://github.com/codercom/code-server).

## Running vscode-hub

1. Start the docker daemon: `systemctl start docker`
2. Install node dependencies: `npm install`
3. Fill in the information in `settings.json`
    - Allowed user IDs in `whitelist`
    - Image names for corresponding IDs in `user_image`
    - Github ClientID for Oauth in `github_clientid`
    - Github Client Secret for Oauth in `github_clientsecret`
4. Run the server: `node index.js`
5. Visit `localhost:8080`

## Settings

* `whitelist`: List of github user IDs that are allowed to log in
* `port`: Port that the service will run on.
* `images`: Dictionary of supported Docker images.
    - `port`: Port that the web service runs on in the container.
    - `path`: Path to the folder containing the Dockerfile.
    - `max_memory`: Maximum memory in bytes allowed to the container.
    - `disk_quota`: Maximum disk space in bytes allowed to the container.
* `user_image`: Dictionary of user IDs to chosen images.
* `callback_url`: Callback URL for Github Oauth.
* `time_out`: Time (in ms) after which an inactive container is killed.
* `github_clientid`: Github ClientID for Oauth.
* `github_clientsecret`: Github Client Secret for Oauth.
