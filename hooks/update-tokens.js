#!/usr/bin/env node

// Hook script: reads token estimate from session, pushes to PartyKit
// Called by Claude Code's Stop hook after each response

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CONFIG_PATH = join(homedir(), ".claude-friends.json");
const TOKENS_PATH = join(homedir(), ".claude-friends-tokens.json");
const PARTY_HOST = "claude-friends-app.nandinitalwar.partykit.dev";

// Read config
let config;
try {
  config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
} catch {
  process.exit(0); // silently exit if not set up
}

// Read hook input from stdin
let input = "";
try {
  input = readFileSync("/dev/stdin", "utf-8");
} catch {}

// Parse the stop event to estimate tokens
let tokensThisCall = 0;
try {
  const event = JSON.parse(input);
  // Estimate based on content length — rough but functional
  const content = JSON.stringify(event);
  tokensThisCall = Math.ceil(content.length / 4); // ~4 chars per token
} catch {
  tokensThisCall = 500; // default estimate per response
}

// Accumulate session tokens
let sessionTokens = 0;
try {
  if (existsSync(TOKENS_PATH)) {
    const data = JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
    // Reset if older than 4 hours (new session)
    if (Date.now() - data.lastUpdate < 4 * 60 * 60 * 1000) {
      sessionTokens = data.tokens || 0;
    }
  }
} catch {}

sessionTokens += tokensThisCall;

writeFileSync(TOKENS_PATH, JSON.stringify({
  tokens: sessionTokens,
  lastUpdate: Date.now(),
}));

// Push to PartyKit via HTTP (faster than WebSocket for one-shot)
// Use the WebSocket approach since PartyKit is WS-only
try {
  const { default: PartySocket } = await import("partysocket");
  const ws = new PartySocket({
    host: PARTY_HOST,
    room: "lobby",
    query: { username: config.username },
  });

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ type: "share-tokens", tokens: sessionTokens }));
    setTimeout(() => { ws.close(); process.exit(0); }, 500);
  });

  ws.addEventListener("error", () => process.exit(0));

  // Don't hang
  setTimeout(() => process.exit(0), 3000);
} catch {
  process.exit(0);
}
