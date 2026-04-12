#!/usr/bin/env node

// Hook script: shares token usage to PartyKit on session stop
// Reads session data from stdin (provided by Claude Code Stop hook)
// Does NOT read session JSONL files

import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CONFIG_PATH = join(homedir(), ".claude-friends.json");
const PARTY_HOST = "claude-friends-app.nandinitalwar.partykit.dev";

let config;
try {
  config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
} catch {
  process.exit(0);
}

// Read session data from stdin
let input = "";
try {
  input = readFileSync(0, "utf-8");
} catch {}

let data = {};
try {
  data = JSON.parse(input);
} catch {}

// Get total tokens from the session data
const totalIn = data.context_window?.total_input_tokens || 0;
const totalOut = data.context_window?.total_output_tokens || 0;
const totalTokens = totalIn + totalOut;

if (totalTokens === 0) process.exit(0);

// Push to PartyKit
try {
  const { default: PartySocket } = await import("partysocket");
  const ws = new PartySocket({
    host: PARTY_HOST,
    room: "lobby",
    query: { username: config.username },
  });

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ type: "share-tokens", tokens: totalTokens }));
    setTimeout(() => { ws.close(); process.exit(0); }, 500);
  });

  ws.addEventListener("error", () => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
} catch {
  process.exit(0);
}
