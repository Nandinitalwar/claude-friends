# claude-friends

See who's coding in Claude Code. Add friends, share status, nudge each other.

## Install

```bash
npm install -g claude-friends
```

## Getting started

Open Claude Code and type `/setup-claude-friends`. This walks you through:

1. **Pick a username** — checked for availability on the server
2. **Add friends** — friendship is mutual: you can only see each other online if you've both added each other
3. **Auto-install** — sets up hooks, statusline, and the `/add-claude-friend` slash command

After setup completes, `/setup-claude-friends` removes itself — it's a one-time command.

## Slash commands

| Command | Description |
|---------|-------------|
| `/setup-claude-friends` | One-time onboarding (removes itself after) |
| `/add-claude-friend <username>` | Add a friend |

## CLI commands

```bash
claude-friends add <username>       # Add a friend
claude-friends remove <username>    # Remove a friend
claude-friends online               # See who's online
claude-friends status <message>     # Set your status
claude-friends nudge <user> [msg]   # Nudge a friend
claude-friends whoami               # Show your username
claude-friends uninstall            # Remove all config, hooks, and commands
```

## What gets auto-installed

Setup adds the following to `~/.claude/settings.json`:

- **SessionStart hook** — runs a background daemon that keeps a WebSocket connection open to the server, marking you as online while you're in Claude Code
- **Stop hook** — sends your token usage to the server when a session ends, so friends can see how much you've been coding
- **Statusline** — shows friend count and online names in Claude Code's bottom bar

## Uninstall

```bash
claude-friends uninstall
npm uninstall -g claude-friends
```

The first command removes all config files, hooks, statusline, and slash commands. The second removes the CLI itself.

## How it works

Everything is Node.js (no shell scripts).

**Server** — A [PartyKit](https://partykit.io) WebSocket server holds all state: registered usernames, friend lists, online presence, token usage, and nudges. Deployed to the cloud, no database needed — PartyKit's durable storage handles persistence.

**Daemon** — When you open Claude Code, a `SessionStart` hook spawns a background process that opens a persistent WebSocket to the server. It sends heartbeats every ~30 seconds to keep you marked as online, and writes who's currently online to a local cache file (`~/.claude-friends-online.json`).

**Statusline** — Claude Code periodically runs the statusline script, which reads the local cache file and outputs a formatted string. No network calls — the daemon already fetched the data.

**Token sharing** — When a Claude Code session ends, a `Stop` hook reads your session's token usage and sends it to the server. Friends can see each other's usage via `claude-friends online`.

**CLI** — Each command opens a one-shot WebSocket to the server, sends a JSON message, gets a response, and exits.

**Slash commands** — Markdown files in `~/.claude/commands/` that contain instructions for Claude. They tell Claude which CLI commands to run and how to present results interactively.

## Self-hosting

Fork this repo, then:

```bash
npx partykit deploy
```

Update the `PARTY_HOST` in `client.js` to point to your deployment.

## License

MIT
