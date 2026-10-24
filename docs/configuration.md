# Configuration

Everything is set with environment variables. Bun loads a `.env` file in the project folder on its own;
[`.env.example`](../.env.example) has every option with a comment.

## Server

| Variable | Default | What it does |
|---|---|---|
| `HOST` | `127.0.0.1` | Address to listen on. `0.0.0.0` opens it to your network |
| `PORT` | `8823` | Port |
| `TASKBOARD_BASE_PATH` | | Serve under a sub-path, e.g. `/taskboard`. The web app only uses relative URLs |
| `TASKBOARD_DATA` | `data` | Data folder: `taskboard.db`, `shots/`, the cookie secret |

## Team

| Variable | Default | What it does |
|---|---|---|
| `TASKBOARD_OWNER` | `owner` | Login of the owner. Creates and deletes cards, adds screenshots, sets the timer, clears the chat |
| `TASKBOARD_OWNER_NAME` | the login | Display name of the owner |
| `TASKBOARD_TEAM` | | Everyone else, as `login:Name,login2:Name2` |
| `TASKBOARD_OWNER_TOKEN` | | Bearer token that acts as the owner (for scripts) |
| `TASKBOARD_OWNER_TOKEN_FILE` | `~/.config/taskboard/owner-token` | Same, read from a file (used when the variable above is empty) |

More people can be added in `data/team.json` (`{"login": "Name"}`), which is read at start. Colours are assigned in
team order.

## Sign-in

`TASKBOARD_AUTH` picks one of two modes.

**`open`** (default): Taskboard shows its own sign-in page. People pick their name from the team list and enter
`TASKBOARD_PASSCODE`. The sign-in is a signed cookie that lasts 30 days. The server refuses to start in this mode on
a non-loopback `HOST` without a passcode, because anyone could sign in as anyone.

**`header`**: Taskboard trusts the `X-Auth-Request-User` header and takes it as the login. Put a proxy in front
that signs people in and sets that header, for example oauth2-proxy with GitHub, or Caddy with `forward_auth`.
Anyone who signs in through the proxy joins the team on first visit, so let the proxy decide who may enter. Only use
this mode when nothing but the proxy can reach the port. See [deployment.md](deployment.md).

## Models

The model menu on each card comes from one of three places, checked in this order:

1. `TASKBOARD_MODELS_CMD`: a shell command that prints a model list. It runs at start and every minute; when the
   output changes, every open board gets the new menu. Use it to mirror whatever accounts you have connected.
2. `TASKBOARD_MODELS_FILE`: a JSON file with the list, re-read every minute.
3. Neither: the built-in list in [`server/config.ts`](../server/config.ts).

The list is either an array or an object with notes that show in the menu:

```json
{
  "models": [
    { "id": "claude-code/claude-opus-5-5", "label": "Claude Opus 5.5", "provider": "Claude" },
    { "id": "claude-code/claude-haiku-5-5", "label": "Claude Haiku 5.5", "provider": "Claude" },
    { "id": "openai-codex/gpt-6-luna", "label": "GPT-6 Luna", "provider": "ChatGPT", "group": "ChatGPT · Work" }
  ],
  "notes": ["Grok is not connected in Aside yet."]
}
```

`id` is `<aside provider>/<model>`, exactly what `aside exec -m` takes. `group` is the heading the model is listed
under in the menu (defaults to `provider`). A list that can't be read is logged and the previous one is kept.

| Variable | Default | What it does |
|---|---|---|
| `TASKBOARD_DEFAULT_MODEL` | first built-in model | Model picked when none is given |

## Aside

| Variable | Default | What it does |
|---|---|---|
| `ASIDE_BIN` | `~/.local/bin/aside` | The Aside CLI |
| `ASIDE_WRAP` | | Command prefix to reach Aside in a desktop session, see [agents.md](agents.md#running-as-a-background-service) |

## Claude (board agent and screenshot reader)

| Variable | Default | What it does |
|---|---|---|
| `CLAUDE_BIN` | `claude` | The Claude Code CLI |
| `BOARD_MODEL` | `claude-haiku-5-5` | Model of the board agent in the chat |
| `READER_MODEL` | `claude-sonnet-5-5` | Model that reads screenshots into card text |

The board agent runs with no tools at all and only sees the board as JSON. The reader may only use the Read tool, and
only inside the screenshots folder.
