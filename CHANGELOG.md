# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-24

The first public release.

### Board
- Real-time Kanban (To do, Working, Done) with drag and drop, filters and per-person colours.
- Cards with screenshots, task text, link, notes, people and any number of answers (Q1, Q2, ...).
- "I've entered it" tracking per answer and per person.
- Cards from pasted screenshots, read into title, task and link by Claude.
- Timer with airport-board digits and progress across the board.
- Search over everything, including every agent step and the page text agents saw (⌘K).
- Layout for phones.

### Agents
- One Aside browser agent per card, model picked per card, batch start.
- Live view streamed as real video, live wall of every running agent.
- Take over and hand back, message an agent, stop.
- Screen mode for canvas and remote-desktop pages.
- Keep-going runner with a session watchdog; agents are picked up again after a server restart.
- Plain-text reply protocol (`ANSWER`, `DONE`, `NEED HELP`).

### Team
- Team chat with mentions, images and reactions.
- Board agent that announces answers, nudges people and answers `@board` questions.

### Running it
- Built-in passcode sign-in, or sign-in through a reverse proxy.
- Configurable model list (built in, a file, or a command).
- Simulated backend for demos, deployed as a live demo on GitHub Pages.
- End-to-end API tests and CI.

[1.0.0]: https://github.com/isaaclins/taskboard/releases/tag/v1.0.0
