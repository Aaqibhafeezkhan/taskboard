# API

Everything the web app does goes through this API. All routes live under the app root (plus
`TASKBOARD_BASE_PATH` if you set one). Types are in [`shared/types.ts`](../shared/types.ts).

## Signing in from scripts

Use the owner token as a bearer token. It acts as the owner:

```sh
export TB=http://127.0.0.1:8823
export TOKEN=$(cat ~/.config/taskboard/owner-token)   # or whatever TASKBOARD_OWNER_TOKEN is
curl -H "Authorization: Bearer $TOKEN" $TB/api/me
```

Browsers sign in with a cookie (`open` auth) or through the reverse proxy (`header` auth), see
[configuration](configuration.md#sign-in).

## Examples

Create a card and attach a screenshot:

```sh
id=$(curl -s -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"title":"Cookie jar","task":"Find the saved item with the reset link.","link":"https://example.com"}' \
  $TB/api/cards | jq -r .id)
curl -s -H "Authorization: Bearer $TOKEN" -H 'content-type: image/png' --data-binary @shot.png \
  $TB/api/cards/$id/screenshots
```

Or both at once with [`bin/card`](../bin/card):

```sh
bin/card --title "Cookie jar" --task "Find the saved item with the reset link." --link https://example.com shot.png
```

Let Claude fill in title, task and link from the screenshots:

```sh
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{}' $TB/api/cards/$id/read
```

Start agents on two cards with one model:

```sh
curl -s -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"cardIds\":[\"$id\",\"$id2\"],\"model\":\"claude-code/claude-sonnet-5-5\"}" $TB/api/agents/start
```

Set a 90 minute timer:

```sh
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"name\":\"Round 1\",\"endsAt\":$(( ($(date +%s) + 5400) * 1000 ))}" $TB/api/round
```

## REST routes

JSON in and out unless noted. "Owner" routes answer `403` for everyone else.

| Method | Route | Who | Body | Returns |
|---|---|---|---|---|
| GET | `api/me` | anyone | | `User` |
| GET | `api/state` | anyone | | the `snapshot` payload |
| GET | `api/models` | anyone | | `ModelOption[]` |
| GET | `api/search?q=` | anyone | | `SearchHit[]` |
| POST | `api/cards` | owner | `{title, task, link?, notes?, screenshotText?}` | `Card` |
| PATCH | `api/cards/:id` | anyone (title/task: owner) | `{column?, position?, notes?, link?, allAnswered?, title?, task?}` | `Card` |
| DELETE | `api/cards/:id` | owner | | `{ok}` (also stops its agent) |
| POST | `api/cards/:id/screenshots` | owner | raw image, `Content-Type: image/*` | `Card` |
| DELETE | `api/cards/:id/screenshots/:sid` | owner | | `Card` |
| POST | `api/cards/:id/read` | owner | `{overwrite?}` | `Card` (reads the screenshots) |
| POST | `api/cards/:id/join` / `leave` | anyone | | `Card` |
| POST | `api/cards/:id/entered` | anyone | `{entered}` | `Card` (all answers at once) |
| POST | `api/cards/:id/answers` | anyone | `{label?, value}` | `Card` |
| PATCH | `api/cards/:id/answers/:aid` | anyone | `{label?, value?}` | `Card` |
| DELETE | `api/cards/:id/answers/:aid` | anyone | | `Card` |
| POST | `api/cards/:id/answers/:aid/entered` | anyone | `{entered}` | `Card` |
| GET | `api/cards/:id/steps` | anyone | | `Step[]` |
| POST | `api/cards/:id/agent/start` | on the card, owner, or nobody on it yet | `{model}` | `Card` |
| POST | `api/cards/:id/agent/stop` | on the card or owner | | `Card` |
| POST | `api/cards/:id/agent/message` | on the card or owner | `{text}` | `Card` |
| POST | `api/cards/:id/agent/takeover` | on the card or owner | | `Card` |
| POST | `api/cards/:id/agent/handback` | on the card or owner | `{note?}` | `Card` |
| POST | `api/agents/start` | per card, as above | `{cardIds, model}` | `Card[]` |
| POST | `api/uploads` | anyone | raw image | `{url}` (for chat images) |
| POST | `api/chat` | anyone | `{text, cardId?, images?}` | `ChatMsg` (`@board` asks the board agent) |
| DELETE | `api/chat` | owner | | `{ok}` |
| POST | `api/chat/:id/react` | anyone | `{reaction}` | `ChatMsg` (toggles; `entered` marks the card) |
| PUT | `api/round` | owner | `{name, endsAt, practice}` | `Round` |

Errors come back as `{"error": "..."}` with a fitting status code. Images may be up to 25 MB and are stored as PNG.

## WebSocket `ws`

Open `ws://host/ws` with the same credentials. The server sends JSON messages:

| `type` | Payload | When |
|---|---|---|
| `snapshot` | `me, users, cards, chat, round, models, modelNotes` | right after connecting |
| `card` | `card` | a card changed |
| `card_deleted` | `id` | a card was deleted |
| `step` | `step` | an agent (or a person) did something on a card |
| `chat` | `msg` | a new or changed chat message |
| `presence` | `users` | someone came online or went away |
| `round` | `round` | the timer changed |
| `models` | `models, notes` | the model list changed |
| `typing` | `login` | someone is typing in the chat |

The client may send `{"type":"typing"}` and `{"type":"ping"}`.

## WebSocket `ws/live`

`ws/live?card=<id>&fps=<n>&w=<maxWidth>` streams one card's agent tab. Binary messages are JPEG frames; text
messages are `{"type":"meta", url, width, height, driver}`. Whoever has taken over can send input, with coordinates
from 0 to 1 of the frame:

```json
{"type":"click","x":0.42,"y":0.31}
{"type":"move","x":0.5,"y":0.5}
{"type":"scroll","x":0.5,"y":0.5,"dy":400}
{"type":"text","text":"hello"}
{"type":"key","key":"Enter"}
{"type":"fps","fps":15}
```

Input from anyone else is ignored. The frame rate follows the fastest viewer, up to 20 frames a second; `fps: 0`
pauses a viewer without closing the socket.
