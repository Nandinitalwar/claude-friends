#!/usr/bin/env node

import { writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createInterface } from "readline";
import { getConfig } from "./client.js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(homedir(), ".claude-friends.json");

const command = process.argv[2];

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

  console.log(`
Done! You're "${username.trim()}".

Now add the MCP server to Claude Code:

  claude mcp add claude-friends -- claude-friends serve

Then in Claude Code:
  /friend alice       Add a friend
  /friends            See who's online
  /nudge bob          Nudge someone
  /status debugging   Set your status
  /unfriend alice     Remove a friend
`);

  rl.close();
} else if (command === "serve") {
  // Start the MCP server directly
  await import("./mcp-server.js");
} else if (command === "whoami") {
  const config = getConfig();
  if (!config) {
    console.log("Not set up yet. Run: claude-friends setup");
  } else {
    console.log(config.username);
  }
} else {
  console.log(`
claude-friends — social presence for Claude Code

Commands:
  setup     Pick a username (one-time)
  serve     Start the MCP server (used by Claude Code)
  whoami    Show your username

Quick start:
  claude-friends setup
  claude mcp add claude-friends -- claude-friends serve
`);
}
