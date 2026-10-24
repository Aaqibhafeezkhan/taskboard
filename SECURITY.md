# Security policy

## Supported versions

Security fixes go into the latest release on `main`.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through GitHub:
[Report a vulnerability](https://github.com/isaaclins/taskboard/security/advisories/new).

Include what you found, how to reproduce it, and what an attacker could do with it. You will get an answer within a
few days. Once a fix is out, you are credited in the release notes unless you prefer not to be.

Things that are in scope: sign-in and permission bypasses, ways to make another person's agent act, escaping the
screenshot reader's folder, cross-site scripting in the board or chat, path traversal in file serving.

How Taskboard is meant to be run safely is described in [docs/security.md](docs/security.md).
