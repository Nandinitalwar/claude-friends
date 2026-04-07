#!/usr/bin/env node

// Background daemon that keeps you online in claude-friends.
// Runs as a persistent WebSocket connection.
// Started automatically by the SessionStart hook.

import { getConfig, createConnection } from "./client.js";

const config = getConfig();
if (!config) process.exit(0);

const ws = createConnection(config.username);

ws.addEventListener("open", () => {
  // Silently connected — we're online
});

ws.addEventListener("close", () => {
  // Reconnect after a delay (partysocket handles this automatically)
});

// Keep process alive
setInterval(() => {}, 60000);

// Clean exit
process.on("SIGINT", () => { ws.close(); process.exit(0); });
process.on("SIGTERM", () => { ws.close(); process.exit(0); });
