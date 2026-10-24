# Contributing to Taskboard

Thanks for wanting to help. Bug reports, ideas, docs fixes and code are all welcome.

## Before you start

- **Bugs:** open an [issue](https://github.com/isaaclins/taskboard/issues/new/choose) with steps to reproduce.
  A screenshot of the board or the server log helps a lot.
- **Features:** open an issue or a [discussion](https://github.com/isaaclins/taskboard/discussions) first, so we
  can agree on the shape before you write code. Small fixes can go straight to a pull request.
- **Security problems:** please report them privately, see [SECURITY.md](SECURITY.md).

Looking for something to do? Try an issue labelled
[good first issue](https://github.com/isaaclins/taskboard/labels/good%20first%20issue).

## Setting up

You need [Bun](https://bun.sh) 1.2+ and Node.js 20+. You don't need Aside or the Claude CLI to work on most of the
board; the web app has a simulated backend.

```sh
git clone https://github.com/isaaclins/taskboard && cd taskboard
bun install
(cd web && npm install)

npm run demo            # web app with the simulated backend, http://localhost:5180
# or the real thing, in two terminals:
bun run dev             # server on :8823, reloads on change
cd web && npm run dev   # web app on :5180, proxied to the server
```

With the real server and `TASKBOARD_AUTH=open`, sign in through `http://localhost:8823/login`, then use the web app
on :5180 in the same browser.

## Making a change

1. Fork, then branch off `main`.
2. Keep the change focused: one fix or feature per pull request.
3. If you change what the server and the web app say to each other, change [`shared/types.ts`](shared/types.ts)
   first. Both sides import it, so the compiler shows you everything that needs to follow. Keep
   `web/src/api/mock.ts` in step, so the demo keeps working.
4. Run the checks:
   ```sh
   bun test
   npm run check
   npm run build
   ```
5. If the UI changed, add a before/after screenshot to the pull request. `npm run demo` plus
   `web/tools/cdp.mjs` makes reproducible ones.

## Style

- TypeScript everywhere, strict mode. Match the code around you.
- Comments say *why*, in plain sentences. Short is good.
- UI copy is plain, friendly English. No jargon in what people see on the board.
- No new runtime dependency without a reason in the pull request.

## Tests

`tests/` runs with `bun test`. `tests/api.test.ts` starts a real server on a free port with an empty data folder,
so it is the place for anything that touches routes or permissions. Pure logic (like `server/protocol.ts`) gets its
own small test file.

## Releases

Maintainers tag `vX.Y.Z` on `main` and write the notes in [CHANGELOG.md](CHANGELOG.md).

By contributing you agree that your work is released under the [MIT license](LICENSE), and to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
