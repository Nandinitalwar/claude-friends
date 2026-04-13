#!/usr/bin/env node
// Full-featured status line for Claude Code
// Reads JSON from stdin, outputs formatted status line

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

// ANSI colors
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GRAY = "\x1b[90m";
const WHITE = "\x1b[97m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const BLUE = "\x1b[34m";

const SEP = ` ${GRAY}|${RESET} `;

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
  segments.push(`${WHITE}${basename(projectDir)}${RESET}`);
}

// 2. Git branch
try {
  const branch = execSync("git rev-parse --abbrev-ref HEAD", {
    cwd: projectDir || undefined,
    stdio: ["pipe", "pipe", "pipe"],
  }).toString().trim();
  if (branch) {
    segments.push(`${MAGENTA}\u2387 ${branch}${RESET}`);
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
  segments.push(`${CYAN}\u{1F916} ${short}${RESET}`);
}

// 4. Tokens
const totalIn = data.context_window?.total_input_tokens;
const totalOut = data.context_window?.total_output_tokens;
if (totalIn != null || totalOut != null) {
  const total = (totalIn || 0) + (totalOut || 0);
  segments.push(`${BLUE}${formatNum(total)} tokens${RESET}`);
}

// 5. Tool calls (grep count only — never reads conversation content)
if (data.transcript_path) {
  try {
    const count = execSync(
      `grep -c 'tool_use' "${data.transcript_path}" 2>/dev/null || echo 0`,
      { stdio: ["pipe", "pipe", "pipe"] }
    ).toString().trim();
    const n = parseInt(count, 10);
    if (n > 0) segments.push(`${YELLOW}\u{1F527} ${n}${RESET}`);
  } catch {}
}

// 6. Usage remaining (bar)
const fiveHr = data.rate_limits?.five_hour;
if (fiveHr?.used_percentage != null) {
  const remaining = Math.max(0, 100 - fiveHr.used_percentage);
  const BAR_WIDTH = 8;
  const filled = Math.round((remaining / 100) * BAR_WIDTH);
  const bar = "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
  const color = remaining < 5 ? "\x1b[31m" : remaining < 20 ? YELLOW : GREEN;
  segments.push(`${color}[${bar}] ${remaining.toFixed(0)}%${RESET}`);
}

// 7. Streak
const streak = getStreak();
segments.push(`\u{1F525} ${streak}d`);

// 8. Friends online
const friends = getFriendsOnline();
const onlineColor = friends.count > 0 ? GREEN : GRAY;
const dot = friends.count > 0 ? "\u{1F7E2}" : "\u25CB";
const names = friends.names.length > 0
  ? ` (${friends.names.slice(0, 3).join(", ")}${friends.names.length > 3 ? "\u2026" : ""})`
  : "";
segments.push(`${onlineColor}${dot} ${friends.count} online${names}${RESET}`);

process.stdout.write(segments.join(SEP));

// --- Helpers ---

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
      const dateStr = localDateStr(d);
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
          dates.add(localDateStr(mtime));
        } catch {}
      }
    }
  } catch {}
}
