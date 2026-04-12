#!/usr/bin/env node

// E2E test: simulates a friend going online, sharing tokens, then going offline.
// Run this in one terminal, then check `claude-friends online` or `/friends` in Claude Code.

import WebSocket from "ws";

const HOST = "wss://claude-friends-app.nandinitalwar.partykit.dev/party/lobby";
const fakeFriend = process.argv[2] || "test-friend";
const tokens = parseInt(process.argv[3]) || 245300;

console.log(`\n🧪 Simulating "${fakeFriend}" coming online with ${(tokens/1000).toFixed(1)}K tokens...`);
console.log(`   Press Ctrl+C to take them offline.\n`);

const ws = new WebSocket(`${HOST}?username=${fakeFriend}`);

ws.on("open", () => {
  // Add you as a friend (bidirectional)
  ws.send(JSON.stringify({ type: "add-friend", friend: "nandini" }));
  ws.send(JSON.stringify({ type: "share-tokens", tokens }));
  console.log(`✅ ${fakeFriend} is now ONLINE`);
  console.log(`   Check with: claude-friends online`);
  console.log(`   Or in Claude Code: /friends\n`);
});

ws.on("close", () => {
  console.log(`\n❌ ${fakeFriend} disconnected. They'll show offline in ~10 seconds.`);
  process.exit(0);
});

ws.on("error", (err) => {
  console.error("Connection error:", err.message);
  process.exit(1);
});

process.on("SIGINT", () => { ws.close(); });
process.on("SIGTERM", () => { ws.close(); });
