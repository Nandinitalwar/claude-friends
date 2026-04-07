# claude-friends

See who's online in Claude Code. Add friends, share what you're working on, nudge each other.

```
● 2 online (alice, bob)
```

## Install

```bash
npm install -g claude-friends
claude-friends setup
claude mcp add claude-friends -- claude-friends serve
```

That's it. No database, no API keys.

## What you get

A status line in Claude Code showing online friends, plus these tools:

| Command | What it does |
|---|---|
| "who's online?" | See friends with 🟢/⚫ indicators |
| "add friend alice" | Add someone by username |
| "set my status to debugging auth" | Share what you're working on |
| "nudge bob" | Poke a friend with a message |
| "share my token usage: 45000" | Let friends see your token count |
| "check nudges" | See if anyone poked you |

## Status line

Add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /path/to/claude-friends/statusline.js"
  }
}
```

Or after global install:

```json
{
  "statusLine": {
    "type": "command",
    "command": "claude-friends statusline"
  }
}
```

## How it works

- **PartyKit** handles real-time presence via WebSockets
- When you open Claude Code → you go online
- When you close it → PartyKit detects the disconnect → you go offline
- Friend lists and nudges are stored in-memory on the server
- No accounts, no passwords — just a username

## Self-hosting

Want to run your own server? Fork this repo, then:

```bash
npx partykit deploy
```

Update the `PARTY_HOST` in `client.js` to point to your deployment.

## License

MIT
