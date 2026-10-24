# Deployment

Taskboard is one process and one folder. Run it on the machine that runs Aside, then decide how the team reaches it.

## On your network, with a passcode

The quickest way for a team in one room:

```sh
HOST=0.0.0.0 TASKBOARD_PASSCODE=pick-something TASKBOARD_OWNER=maya TASKBOARD_TEAM=theo:Theo,jun:Jun bun start
```

Teammates open `http://<your-ip>:8823/`, pick their name and enter the passcode. Anyone with the passcode can sign in
as any name on the list, so this is meant for people who trust each other.

## Behind a sign-in proxy (recommended for the internet)

Keep Taskboard on `127.0.0.1`, set `TASKBOARD_AUTH=header`, and put a proxy in front that signs people in and passes
their login in `X-Auth-Request-User`.

### Caddy + oauth2-proxy with GitHub sign-in

oauth2-proxy signs people in with GitHub and answers Caddy's auth check with their login:

```sh
oauth2-proxy \
  --provider=github --client-id=... --client-secret=... --cookie-secret=... \
  --github-user=maya,theo,jun,priya \
  --email-domain='*' \
  --http-address=127.0.0.1:4180 \
  --reverse-proxy=true \
  --set-xauthrequest=true \
  --upstream=static://202
```

Caddy sends every request through that check, passes the login on, and sends people who are not signed in to GitHub:

```caddy
board.example.com {
  request_header -X-Auth-Request-User   # never trust this header from the outside

  handle /oauth2/* {
    reverse_proxy 127.0.0.1:4180
  }
  handle {
    forward_auth 127.0.0.1:4180 {
      uri /oauth2/auth
      copy_headers X-Auth-Request-User
      @signin status 401
      handle_response @signin {
        redir * /oauth2/sign_in?rd={scheme}://{host}{uri}
      }
    }
    reverse_proxy 127.0.0.1:8823
  }
}
```

Then start Taskboard with the owner's GitHub login:

```sh
TASKBOARD_AUTH=header TASKBOARD_OWNER=maya bun start
```

WebSockets (`/ws`, `/ws/live`) pass through `reverse_proxy` as they are. Make sure the proxy does not buffer them.

### Under a sub-path

To serve the board at `https://example.com/taskboard/`, set `TASKBOARD_BASE_PATH=/taskboard` and route that path to
the server without stripping it. The web app uses relative URLs only, so nothing else changes.

## Keep it running

### macOS (launchd)

`~/Library/LaunchAgents/com.example.taskboard.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.example.taskboard</string>
  <key>WorkingDirectory</key><string>/Users/maya/taskboard</string>
  <key>ProgramArguments</key><array><string>/Users/maya/.bun/bin/bun</string><string>server/main.ts</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/taskboard.log</string>
  <key>StandardErrorPath</key><string>/tmp/taskboard.log</string>
</dict></plist>
```

`launchctl load ~/Library/LaunchAgents/com.example.taskboard.plist`. A LaunchAgent runs in your desktop session, so
it can reach Aside directly. As a system LaunchDaemon it needs `ASIDE_WRAP` (see [agents.md](agents.md)).

### Linux (systemd), board only

```ini
[Unit]
Description=Taskboard
After=network.target

[Service]
WorkingDirectory=/opt/taskboard
EnvironmentFile=/opt/taskboard/.env
ExecStart=/usr/local/bin/bun server/main.ts
Restart=always

[Install]
WantedBy=multi-user.target
```

Aside does not run on Linux, so a Linux server gives you the board, chat, answers and search without card agents.

## Updating

```sh
git pull && bun install && npm run build
# restart the service
```

Agents that are running keep going in Aside during the restart; the server picks them up again when it is back.

## Backups and moving

Stop the server and copy the `data/` folder. That is the whole board: cards, steps, chat, images and the cookie
secret.
