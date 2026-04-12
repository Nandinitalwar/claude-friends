#!/usr/bin/env -S node --no-warnings

import { writeFileSync, readFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { getConfig, createConnection } from "./client.js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(homedir(), ".claude-friends.json");

const command = process.argv[2];
const args = process.argv.slice(3).join(" ").trim();

main().catch((err) => { console.error(err.message); process.exit(1); });

async function main() {

// Helper: connect, send a message, wait for response, print, exit
function run(messageType, payload, responseType, formatter) {
  const config = getConfig();
  if (!config) {
    console.log("Not set up. Run: claude-friends setup");
    process.exit(1);
  }

  const ws = createConnection(config.username);

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ type: messageType, ...payload }));
  });

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === responseType || msg.type === "error") {
      if (msg.type === "error") {
        console.log("Error:", msg.message);
      } else {
        console.log(formatter(msg));
      }
      ws.close();
      process.exit(0);
    }
  });

  setTimeout(() => { console.log("Timeout connecting to server."); process.exit(1); }, 5000);
}

if (command === "setup") {
  const existing = getConfig();
  if (existing) {
    console.log(`Already set up as "${existing.username}".`);
  } else {
    console.log(`
To set up claude-friends, open Claude Code and type:

  /friends

This will walk you through picking a username and adding friends.
`);
  }

} else if (command === "check-username") {
  // Check if a username is available (for Claude Code slash commands)
  if (!args) { console.log("Usage: claude-friends check-username <username>"); process.exit(1); }
  const name = args.trim();
  const ws = createConnection(name);
  const timer = setTimeout(() => { ws.close(); console.log("available"); process.exit(0); }, 5000);
  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ type: "check-username", username: name }));
  });
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "username-available") {
      clearTimeout(timer);
      ws.close();
      console.log(msg.available ? "available" : "taken");
      process.exit(msg.available ? 0 : 1);
    }
  });

} else if (command === "setup-noninteractive") {
  // Non-interactive setup for use by Claude Code slash commands
  if (!args) { console.log("Usage: claude-friends setup-noninteractive <username>"); process.exit(1); }

  const username = args.trim();

  // Check if already set up
  const existing = getConfig();
  if (existing) {
    console.log(`Already set up as "${existing.username}".`);
    process.exit(0);
  }

  // Check username availability
  const available = await new Promise((resolve) => {
    const ws = createConnection(username);
    const timer = setTimeout(() => { ws.close(); resolve(true); }, 5000);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "check-username", username }));
    });
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "username-available") {
        clearTimeout(timer);
        ws.close();
        resolve(msg.available);
      }
    });
    ws.addEventListener("error", () => { clearTimeout(timer); resolve(true); });
  });

  if (!available) {
    console.log(`Username "${username}" is already taken.`);
    process.exit(1);
  }

  // Register on server
  await new Promise((resolve) => {
    const ws = createConnection(username);
    const timer = setTimeout(() => { ws.close(); resolve(); }, 5000);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "register" }));
    });
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "register-result") {
        clearTimeout(timer);
        ws.close();
        resolve();
      }
    });
  });

  // Save config
  writeFileSync(CONFIG_PATH, JSON.stringify({ username }, null, 2));

  // Install slash commands
  const commandsDir = join(homedir(), ".claude", "commands");
  mkdirSync(commandsDir, { recursive: true });
  const srcCommands = join(__dirname, "commands");
  if (existsSync(srcCommands)) {
    for (const file of readdirSync(srcCommands).filter((f) => f.endsWith(".md"))) {
      copyFileSync(join(srcCommands, file), join(commandsDir, file));
    }
  }

  // Install hooks
  const settingsPath = join(homedir(), ".claude", "settings.json");
  try {
    let settings = {};
    if (existsSync(settingsPath)) {
      settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    }
    if (!settings.hooks) settings.hooks = {};

    if (!settings.hooks.Stop) settings.hooks.Stop = [];
    const hookCommand = `node ${join(__dirname, "hooks", "update-tokens.js")}`;
    if (!settings.hooks.Stop.some((h) => h.hooks?.some((hk) => hk.command?.includes("update-tokens")))) {
      settings.hooks.Stop.push({ hooks: [{ type: "command", command: hookCommand, async: true }] });
    }

    if (!settings.statusLine) {
      settings.statusLine = { type: "command", command: `node ${join(__dirname, "statusline.js")}` };
    }

    if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
    const daemonCmd = `node ${join(__dirname, "daemon.js")}`;
    if (!settings.hooks.SessionStart.some((h) => h.hooks?.some((hk) => hk.command?.includes("daemon.js")))) {
      settings.hooks.SessionStart.push({ hooks: [{ type: "command", command: daemonCmd, async: true }] });
    }

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch {}

  console.log(`Set up as "${username}".`);

} else if (command === "add") {
  if (!args) { console.log("Usage: claude-friends add <username>"); process.exit(1); }
  run("add-friend", { friend: args }, "friend-added", (msg) =>
    msg.mutual
      ? `You and ${args} are now friends!`
      : `Added ${args}! They need to add you back to see each other online.`
  );

} else if (command === "remove") {
  if (!args) { console.log("Usage: claude-friends remove <username>"); process.exit(1); }
  run("remove-friend", { friend: args }, "friend-removed", () => `Removed ${args}.`);

} else if (command === "online" || command === "list") {
  run("get-friends", {}, "friends-list", (msg) => {
    const friends = msg.friends || [];
    if (friends.length === 0) return "No friends yet. Run: claude-friends add <username>";

    const mutual = friends.filter((f) => f.mutual);
    const pending = friends.filter((f) => !f.mutual);
    const sorted = [...mutual].sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
    const onlineCount = sorted.filter((f) => f.online).length;

    const lines = sorted.map((f) => {
      const dot = f.online ? "🟢" : "⚫";
      const status = f.status && f.status !== "offline" && f.status !== "unknown" ? ` — ${f.status}` : "";
      return `${dot} ${f.name}${status}`;
    });

    let output = `Friends (${onlineCount}/${mutual.length} online):\n${lines.join("\n")}`;

    if (pending.length > 0) {
      output += `\n\nPending (waiting for them to add you back):\n${pending.map((f) => `⏳ ${f.name}`).join("\n")}`;
    }

    // Token usage graph
    const withTokens = sorted.filter((f) => f.tokensUsed > 0);
    if (withTokens.length > 0) {
      const maxTokens = Math.max(...withTokens.map((f) => f.tokensUsed));
      const maxNameLen = Math.max(...withTokens.map((f) => f.name.length));
      const barWidth = 20;

      output += "\n\nToken usage today:";
      for (const f of withTokens) {
        const name = f.name.padEnd(maxNameLen);
        const filled = Math.max(1, Math.round((f.tokensUsed / maxTokens) * barWidth));
        const bar = "█".repeat(filled);
        let tokenStr;
        if (f.tokensUsed >= 1_000_000) tokenStr = `${(f.tokensUsed / 1_000_000).toFixed(1)}M`;
        else if (f.tokensUsed >= 1_000) tokenStr = `${(f.tokensUsed / 1_000).toFixed(1)}K`;
        else tokenStr = `${f.tokensUsed}`;
        output += `\n  ${name} ${bar} ${tokenStr}`;
      }
    }

    return output;
  });

} else if (command === "status") {
  if (!args) { console.log("Usage: claude-friends status <message>"); process.exit(1); }
  const config = getConfig();
  if (!config) { console.log("Not set up. Run: claude-friends setup"); process.exit(1); }
  const ws = createConnection(config.username);
  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ type: "set-status", status: args }));
    console.log(`Status set: "${args}"`);
    setTimeout(() => { ws.close(); process.exit(0); }, 500);
  });
  setTimeout(() => process.exit(1), 5000);

} else if (command === "nudge") {
  const parts = args.split(" ");
  const friend = parts[0];
  const message = parts.slice(1).join(" ") || undefined;
  if (!friend) { console.log("Usage: claude-friends nudge <username> [message]"); process.exit(1); }
  run("nudge", { friend, message }, "nudge-sent", () => `Nudge sent to ${friend}!`);

} else if (command === "whoami") {
  const config = getConfig();
  if (!config) { console.log("Not set up. Run: claude-friends setup"); process.exit(1); }
  console.log(config.username);

} else if (command === "serve") {
  // Keep for backwards compat with anyone who set up MCP
  await import("./mcp-server.js");

} else {
  console.log(`
claude-friends — social presence for Claude Code

Commands:
  setup               Pick a username (one-time)
  add <username>      Add a friend
  remove <username>   Remove a friend
  online              See who's online
  status <message>    Set your status
  nudge <user> [msg]  Nudge a friend
  whoami              Show your username

Quick start:
  claude-friends setup
  claude-friends add alice

In Claude Code:
  /friend alice
  /friends
  /nudge bob hey!
`);
}

} // end main
