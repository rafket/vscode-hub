# vscode-hub

`vscode-hub` is like [jupyterhub](https://github.com/jupyterhub/jupyterhub) but for [VS Code](https://github.com/Microsoft/vscode), based on [code-server](https://github.com/codercom/code-server).

## Running vscode-hub

1. Start the docker daemon: `systemctl start docker`
2. Install node dependencies: `npm install`
3. Fill in the information in `settings.json`
  - Allowed user IDs in `whitelist`
  - Github ClientID for Oauth in `github_clientid`
  - Github Client Secret for Oauth in `github_clientsecret`
4. Run the server: `node index.js`
5. Visit `localhost:8080`

## Settings

* `whitelist`: List of github user IDs that are allowed to log in
* `max_memory`: Maximum memory (in bytes) allowed per container. Recommended minimum at 1GB. It seems that it is still functional at 300MB (and using 50MB except during startup), though the Extensions host is not running, and syntax highlighting sometimes doesn't work.
* `disk_quota`: Maximum disk usage (in bytes) allowed per container.
* `port`: Port that the service will run on.
* `callback_url`: Callback URL for Github Oauth.
* `time_out`: Time (in ms) after which an inactive container is killed.
* `github_clientid`: Github ClientID for Oauth.
* `github_clientsecret`: Github Client Secret for Oauth.
