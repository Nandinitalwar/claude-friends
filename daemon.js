#!/usr/bin/env node

// Background daemon that keeps you online in claude-friends.
// Runs as a persistent WebSocket connection.
// Also periodically writes friend status to a cache file
// so the statusline can read it synchronously.

import { writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { getConfig, createConnection } from "./client.js";

const config = getConfig();
if (!config) process.exit(0);

const CACHE_PATH = join(homedir(), ".claude-friends-online.json");
const ws = createConnection(config.username);

function updateCache(friends) {
  const onlineNames = friends.filter((f) => f.online).map((f) => f.name);
  try {
    writeFileSync(CACHE_PATH, JSON.stringify({
      onlineCount: onlineNames.length,
      onlineNames,
      lastUpdate: Date.now(),
    }));
  } catch {}
}

ws.addEventListener("open", () => {
  // Request friends list immediately and periodically
  ws.send(JSON.stringify({ type: "get-friends" }));
});

ws.addEventListener("message", (event) => {
  try {
    const msg = JSON.parse(event.data);
    if (msg.type === "friends-list") {
      updateCache(msg.friends || []);
    }
    // Also update on presence changes
    if (msg.type === "presence" || msg.type === "state") {
      ws.send(JSON.stringify({ type: "get-friends" }));
    }
  } catch {}
});

// Poll friends every 15 seconds
setInterval(() => {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "get-friends" }));
  }
}, 15000);

// Exit when parent process (Claude Code) dies
const parentPid = process.ppid;
setInterval(() => {
  try {
    process.kill(parentPid, 0); // Check if parent is alive (signal 0 = no-op)
  } catch {
    ws.close();
    process.exit(0);
  }
}, 5000);

// Clean exit
process.on("SIGINT", () => { ws.close(); process.exit(0); });
process.on("SIGTERM", () => { ws.close(); process.exit(0); });
