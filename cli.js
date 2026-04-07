#!/usr/bin/env node

import { writeFileSync, readFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createInterface } from "readline";
import { getConfig, createConnection } from "./client.js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(homedir(), ".claude-friends.json");

const command = process.argv[2];
const args = process.argv.slice(3).join(" ").trim();

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
    console.log(`\nAlready set up as "${existing.username}".`);
    console.log(`Config: ${CONFIG_PATH}`);
    console.log(`\nTo change username, delete ${CONFIG_PATH} and run again.\n`);
    process.exit(0);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, res));

  console.log(`
╔══════════════════════════════════════╗
║        claude-friends setup          ║
╚══════════════════════════════════════╝
`);

  const username = await ask("Choose a username: ");

  if (!username.trim()) {
    console.log("Username can't be empty.");
    process.exit(1);
  }

  writeFileSync(CONFIG_PATH, JSON.stringify({ username: username.trim() }, null, 2));

  // Install slash commands to ~/.claude/commands/
  const commandsDir = join(homedir(), ".claude", "commands");
  mkdirSync(commandsDir, { recursive: true });

  const srcCommands = join(__dirname, "commands");
  if (existsSync(srcCommands)) {
    const files = readdirSync(srcCommands).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      copyFileSync(join(srcCommands, file), join(commandsDir, file));
    }
    console.log(`\nInstalled slash commands: ${files.map((f) => "/" + f.replace(".md", "")).join(", ")}`);
  }

  // Install token-sharing hook to ~/.claude/settings.json
  const settingsPath = join(homedir(), ".claude", "settings.json");
  const hookCommand = `node ${join(__dirname, "hooks", "update-tokens.js")}`;
  try {
    let settings = {};
    if (existsSync(settingsPath)) {
      settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    }
    if (!settings.hooks) settings.hooks = {};
    if (!settings.hooks.Stop) settings.hooks.Stop = [];

    const alreadyInstalled = settings.hooks.Stop.some((h) =>
      h.hooks?.some((hk) => hk.command?.includes("update-tokens"))
    );

    if (!alreadyInstalled) {
      settings.hooks.Stop.push({
        hooks: [{
          type: "command",
          command: hookCommand,
          async: true,
        }],
      });
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log("Installed auto token-sharing hook.");
    }
  } catch (err) {
    console.log("Could not install token hook (non-critical):", err.message);
  }

  // Install statusline + daemon hooks (read settings once)
  try {
    const settingsPath2 = join(homedir(), ".claude", "settings.json");
    let settings = {};
    if (existsSync(settingsPath2)) {
      settings = JSON.parse(readFileSync(settingsPath2, "utf-8"));
    }

    if (!settings.statusLine) {
      settings.statusLine = {
        type: "command",
        command: `node ${join(__dirname, "statusline.js")}`,
      };
      console.log("Installed status line.");
    }

    // SessionStart hook: spawn daemon to keep user online
    if (!settings.hooks) settings.hooks = {};
    const daemonCmd = `node ${join(__dirname, "daemon.js")}`;

    if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
    const daemonInstalled = settings.hooks.SessionStart.some((h) =>
      h.hooks?.some((hk) => hk.command?.includes("daemon.js"))
    );
    if (!daemonInstalled) {
      settings.hooks.SessionStart.push({
        hooks: [{
          type: "command",
          command: daemonCmd,
          async: true,
        }],
      });
      console.log("Installed presence daemon (keeps you online).");
    }

    writeFileSync(settingsPath2, JSON.stringify(settings, null, 2));
  } catch {}

  console.log(`
Done! You're "${username.trim()}".

In Claude Code:
  /friend alice       Add a friend
  /friends            See who's online
  /nudge bob hey!     Nudge someone
  /status debugging   Set your status
  /unfriend alice     Remove a friend

Token usage is shared automatically.
`);

  rl.close();

} else if (command === "add") {
  if (!args) { console.log("Usage: claude-friends add <username>"); process.exit(1); }
  run("add-friend", { friend: args }, "friend-added", () => `Added ${args} as a friend!`);

} else if (command === "remove") {
  if (!args) { console.log("Usage: claude-friends remove <username>"); process.exit(1); }
  run("remove-friend", { friend: args }, "friend-removed", () => `Removed ${args}.`);

} else if (command === "online" || command === "list") {
  run("get-friends", {}, "friends-list", (msg) => {
    const friends = msg.friends || [];
    if (friends.length === 0) return "No friends yet. Run: claude-friends add <username>";

    const sorted = [...friends].sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
    const onlineCount = sorted.filter((f) => f.online).length;

    const lines = sorted.map((f) => {
      const dot = f.online ? "🟢" : "⚫";
      const status = f.status && f.status !== "offline" && f.status !== "unknown" ? ` — ${f.status}` : "";
      const tokens = f.tokensUsed
        ? f.tokensUsed >= 1_000_000
          ? ` [${(f.tokensUsed / 1_000_000).toFixed(1)}M tokens]`
          : ` [${(f.tokensUsed / 1000).toFixed(1)}K tokens]`
        : "";
      return `${dot} ${f.name}${status}${tokens}`;
    });

    return `Friends (${onlineCount}/${friends.length} online):\n${lines.join("\n")}`;
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
