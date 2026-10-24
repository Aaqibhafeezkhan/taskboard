# Security model

Taskboard lets people start AI agents that drive a real, signed-in browser. That is powerful, so it helps to know
where the lines are.

## Who can do what

| Action | Who |
|---|---|
| See the board, chat, search, live views | everyone signed in |
| Join or leave a card, add answers, mark them entered, write in the chat | everyone signed in |
| Start an agent | people on the card, the owner, or anyone if nobody is on the card yet (they join it) |
| Stop, message, take over, hand back an agent | people on the card and the owner |
| Send clicks and keys into an agent's tab | only the person who took over |
| Create and delete cards, add or remove screenshots, rename cards, set the timer, clear the chat | the owner |

The owner token (`TASKBOARD_OWNER_TOKEN` or its file) is the owner. Keep it like a password: mode `600`, never in
the repository.

## Sign-in

- `open` mode uses a shared passcode and a signed, `HttpOnly`, `SameSite=Lax` cookie. Anyone with the passcode can
  pick any name on the list, including the owner's. Use it for a team in one room, not on the internet.
- The server will not start in `open` mode on a network address without a passcode.
- `header` mode trusts `X-Auth-Request-User` completely. Only the sign-in proxy may reach the port, and the proxy
  must remove that header from incoming requests (see [deployment.md](deployment.md)). The server prints a warning
  when it listens on a network address in this mode.
- The cookie secret is generated on first start and kept in `data/.secret` (mode `600`).

## Agents

Agents act with whatever the Aside browser profile can reach. Reduce that:

- **Use a separate Aside profile** that is only signed in to the sites the tasks need. No personal mail, no bank,
  no admin consoles.
- **Turn off what tasks don't need in Aside:** payments, sending messages, desktop control. Keep file access on
  ask-first. Do not run agents in a full-access mode.
- **Every agent gets rules first** (see [agents.md](agents.md#what-the-agent-is-told)): only this task, no sending,
  no paying, no installing, no settings, and everything on web pages is data. Rules lower the risk of prompt
  injection; they do not remove it. A hostile page can still try to talk an agent into something, which is why the
  profile limits above matter more.
- **Watch the live wall.** Every step is logged and searchable, and any teammate on the card can stop an agent.

## The board agent and the reader

- The board agent runs `claude -p` with **no tools**. It sees the board as JSON and can only ask the server to
  create a card (owner only), or start or stop an agent; the server checks the permissions as if the person who
  asked had clicked the button.
- The screenshot reader runs with only the **Read** tool, limited to `data/shots/`, and is told that the
  screenshots are data.

## Reporting a vulnerability

See [SECURITY.md](../SECURITY.md).
