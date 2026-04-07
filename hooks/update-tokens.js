#!/usr/bin/env node

// Hook script: reads REAL token usage from Claude Code session files
// Only counts tokens from today. Pushes to PartyKit.

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
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

// Today at midnight
const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0);
const todayISO = todayStart.toISOString();

// Find all session files modified today
function getSessionFilesModifiedToday() {
  const projectsDir = join(homedir(), ".claude", "projects");
  if (!existsSync(projectsDir)) return [];

  const files = [];
  try {
    for (const dir of readdirSync(projectsDir)) {
      const dirPath = join(projectsDir, dir);
      try {
        for (const file of readdirSync(dirPath)) {
          if (!file.endsWith(".jsonl")) continue;
          const filePath = join(dirPath, file);
          const mtime = statSync(filePath).mtimeMs;
          // Only files modified today
          if (mtime >= todayStart.getTime()) {
            files.push(filePath);
          }
        }
      } catch {}
    }
  } catch {}

  return files;
}

// Sum today's token usage from session files
function getTodayTokens(files) {
  let totalTokens = 0;

  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, "utf-8");
      for (const line of content.trim().split("\n")) {
        try {
          const entry = JSON.parse(line);
          const usage = entry?.message?.usage;
          const timestamp = entry?.timestamp;

          // Only count entries from today
          if (usage && timestamp && timestamp >= todayISO) {
            totalTokens +=
              (usage.input_tokens || 0) +
              (usage.cache_creation_input_tokens || 0) +
              (usage.output_tokens || 0);
          }
        } catch {}
      }
    } catch {}
  }

  return totalTokens;
}

const files = getSessionFilesModifiedToday();
const totalTokens = getTodayTokens(files);

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
