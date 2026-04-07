#!/usr/bin/env node

// Hook script: reads REAL token usage from Claude Code session files
// and pushes it to PartyKit. Called by the Stop hook after each response.

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

// Find the most recently modified session file
function getLatestSessionFile() {
  const projectsDir = join(homedir(), ".claude", "projects");
  if (!existsSync(projectsDir)) return null;

  let latestFile = null;
  let latestMtime = 0;

  try {
    for (const dir of readdirSync(projectsDir)) {
      const dirPath = join(projectsDir, dir);
      try {
        for (const file of readdirSync(dirPath)) {
          if (!file.endsWith(".jsonl")) continue;
          const filePath = join(dirPath, file);
          const mtime = statSync(filePath).mtimeMs;
          if (mtime > latestMtime) {
            latestMtime = mtime;
            latestFile = filePath;
          }
        }
      } catch {}
    }
  } catch {}

  return latestFile;
}

// Sum token usage from session file
function getTokensFromSession(filePath) {
  if (!filePath) return 0;

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n");

    let totalTokens = 0;
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const usage = entry?.message?.usage;
        if (usage) {
          // Count input + output + cache writes (real cost)
          // Exclude cache_read — those are nearly free and inflate the number
          totalTokens +=
            (usage.input_tokens || 0) +
            (usage.cache_creation_input_tokens || 0) +
            (usage.output_tokens || 0);
        }
      } catch {}
    }

    return totalTokens;
  } catch {
    return 0;
  }
}

const sessionFile = getLatestSessionFile();
const totalTokens = getTokensFromSession(sessionFile);

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
