#!/usr/bin/env node
// Full-featured status line for Claude Code
// Reads JSON from stdin, outputs formatted status line

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

// Read JSON from stdin
let input = "";
try {
  input = readFileSync(0, "utf-8");
} catch {}

let data = {};
try {
  data = JSON.parse(input);
} catch {}

const segments = [];

// 1. Project name
const projectDir = data.workspace?.project_dir || data.cwd || "";
if (projectDir) {
  segments.push(basename(projectDir));
}

// 2. Git branch
try {
  const branch = execSync("git rev-parse --abbrev-ref HEAD", {
    cwd: projectDir || undefined,
    stdio: ["pipe", "pipe", "pipe"],
  }).toString().trim();
  if (branch) {
    segments.push(`\u2387 ${branch}`);
  }
} catch {}

// 3. Model
if (data.model) {
  const modelName = typeof data.model === "object"
    ? (data.model.display_name || data.model.id || "")
    : data.model;
  const short = modelName
    .replace(/^claude-/, "")
    .replace("opus-4-6", "Opus 4.6")
    .replace("sonnet-4-6", "Sonnet 4.6")
    .replace("haiku-4-5-20251001", "Haiku 4.5");
  segments.push(`\u{1F916} ${short}`);
}

// 4. Tokens
const totalIn = data.context_window?.total_input_tokens;
const totalOut = data.context_window?.total_output_tokens;
if (totalIn != null || totalOut != null) {
  const total = (totalIn || 0) + (totalOut || 0);
  segments.push(`${formatNum(total)} tokens`);
}

// 5. Tool calls from transcript
if (data.transcript_path) {
  try {
    const transcript = readFileSync(data.transcript_path, "utf-8");
    const toolCalls = (transcript.match(/"type"\s*:\s*"tool_use"/g) || []).length;
    if (toolCalls > 0) {
      segments.push(`\u{1F527} ${toolCalls}`);
    }
  } catch {}
}

// 6. Cost
if (data.cost?.total_cost_usd != null) {
  segments.push(`$${data.cost.total_cost_usd.toFixed(2)}`);
}

// 7. Streak
segments.push(`\u{1F525} ${getStreak()}d`);

// 8. Friends online
const friends = getFriendsOnline();
const dot = friends.count > 0 ? "\u{1F7E2}" : "\u25CB";
const names = friends.names.length > 0
  ? ` (${friends.names.slice(0, 3).join(", ")}${friends.names.length > 3 ? "\u2026" : ""})`
  : "";
segments.push(`${dot} ${friends.count} online${names}`);

process.stdout.write(segments.join(" | "));

// --- Helpers ---

function formatNum(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function getFriendsOnline() {
  try {
    const cache = JSON.parse(readFileSync(join(homedir(), ".claude-friends-online.json"), "utf-8"));
    if (Date.now() - cache.timestamp > 30000) return { count: 0, names: [] };
    return { count: cache.onlineCount || 0, names: cache.onlineNames || [] };
  } catch {
    return { count: 0, names: [] };
  }
}

function getStreak() {
  // Collect dates of all session file modifications
  const sessionsDir = join(homedir(), ".claude", "projects");
  try {
    if (!existsSync(sessionsDir)) return 0;
    const activeDates = new Set();
    scanForDates(sessionsDir, activeDates, 0);

    const today = new Date();
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      if (activeDates.has(dateStr)) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    return streak;
  } catch {
    return 0;
  }
}

function scanForDates(dir, dates, depth) {
  if (depth > 4) return;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        scanForDates(full, dates, depth + 1);
      } else if (entry.name.endsWith(".jsonl")) {
        try {
          const mtime = statSync(full).mtime;
          dates.add(mtime.toISOString().slice(0, 10));
        } catch {}
      }
    }
  } catch {}
}
