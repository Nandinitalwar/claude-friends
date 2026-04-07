# claude-friends

See who's online in Claude Code. Add friends, share what you're working on, nudge each other.

```
● 2 online (alice, bob)
```

## Install

```bash
npm install -g claude-friends
claude-friends setup
```

That's it. No database, no API keys, no MCP server to configure.

## Usage

### Slash commands (inside Claude Code)

```
/friend alice       Add a friend
/friends            See who's online
/nudge bob hey!     Nudge someone
/status debugging   Set your status
/unfriend alice     Remove a friend
```

### CLI (from any terminal)

```bash
claude-friends add alice
claude-friends online
claude-friends nudge bob "ship it!"
claude-friends status "pair programming"
claude-friends remove alice
```

## Features

- **Online presence** — see who's in Claude Code right now
- **Status messages** — share what you're working on
- **Nudges** — poke a friend with a message
- **Token usage** — automatically shared with friends (opt-in via hook)
- **Status line** — friend count shown in Claude Code's bottom bar

## How it works

- **PartyKit** handles real-time presence via WebSockets
- When you use Claude Code → you appear online
- Friend lists and nudges are stored on the server
- No accounts, no passwords — just a username
- Setup auto-installs slash commands, status line, and token-sharing hook

## Self-hosting

Want to run your own server? Fork this repo, then:

```bash
npx partykit deploy
```

Update the `PARTY_HOST` in `client.js` to point to your deployment.

## License

MIT
