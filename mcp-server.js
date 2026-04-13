import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getConfig, createConnection } from "./client.js";

const config = getConfig();
if (!config) {
  console.error("Not set up. Run: claude-friends setup");
  process.exit(1);
}

const username = config.username;

// Persistent WebSocket connection — stays open while Claude Code is running
const ws = createConnection(username);
let connected = false;

// Local cache of state, updated via WebSocket messages
let friendsList = [];
let pendingNudges = [];
let lastError = null;

// Wait for connection to be ready
function waitForConnection(timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (connected && ws.readyState === 1) return resolve();
    const timer = setTimeout(() => reject(new Error("connection timeout")), timeout);
    ws.addEventListener("open", () => { connected = true; clearTimeout(timer); resolve(); }, { once: true });
  });
}

// Promise-based request/response helper
async function request(msg, responseType, timeout = 5000) {
  await waitForConnection();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeout);
    const handler = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === responseType) {
        clearTimeout(timer);
        ws.removeEventListener("message", handler);
        resolve(data);
      } else if (data.type === "error") {
        clearTimeout(timer);
        ws.removeEventListener("message", handler);
        resolve(data);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify(msg));
  });
}

// Listen for incoming messages
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case "state":
      friendsList = msg.friends || [];
      pendingNudges = msg.nudges || [];
      break;
    case "nudge":
      pendingNudges.push({ from: msg.from, message: msg.message });
      break;
    case "friend-added":
    case "friend-removed":
      // Refresh friends list
      ws.send(JSON.stringify({ type: "get-friends" }));
      break;
    case "friends-list":
      friendsList = msg.friends || [];
      break;
    case "error":
      lastError = msg.message;
      break;
  }
});

// Wait for connection before starting MCP
await new Promise((resolve) => {
  if (ws.readyState === 1) return resolve();
  ws.addEventListener("open", resolve, { once: true });
});

// Send heartbeats to avoid being reaped by server
setInterval(() => {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "heartbeat" }));
  }
}, 10000);

// --- MCP Server ---

const server = new McpServer({
  name: "claude-friends",
  version: "0.1.0",
});

server.tool(
  "friends-online",
  "See which of your friends are currently online in Claude Code.",
  {},
  async () => {
    const resp = await request({ type: "get-friends" }, "friends-list");
    const friends = resp.friends || [];

    if (friends.length === 0) {
      return { content: [{ type: "text", text: "No friends yet. Use add-friend to add someone!" }] };
    }

    const sorted = [...friends].sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
    const onlineCount = sorted.filter((f) => f.online).length;

    const lines = sorted.map((f) => {
      const dot = f.online ? "🟢" : "⚫";
      const status = f.status && f.status !== "offline" && f.status !== "unknown" ? ` — ${f.status}` : "";
      const tokens = f.tokensUsed ? ` [${(f.tokensUsed / 1000).toFixed(1)}K tokens]` : "";
      return `${dot} ${f.name}${status}${tokens}`;
    });

    return {
      content: [{
        type: "text",
        text: `Friends (${onlineCount}/${friends.length} online):\n${lines.join("\n")}`,
      }],
    };
  }
);

server.tool(
  "add-friend",
  "Add a friend by their username.",
  { username: z.string().describe("The friend's username") },
  async ({ username: friend }) => {
    const resp = await request({ type: "add-friend", friend }, "friend-added");
    if (resp.type === "error") {
      return { content: [{ type: "text", text: resp.message }] };
    }
    return { content: [{ type: "text", text: `Added ${friend} as a friend!` }] };
  }
);

server.tool(
  "remove-friend",
  "Remove a friend.",
  { username: z.string().describe("The friend's username") },
  async ({ username: friend }) => {
    const resp = await request({ type: "remove-friend", friend }, "friend-removed");
    return { content: [{ type: "text", text: `Removed ${friend}.` }] };
  }
);

server.tool(
  "set-status",
  "Set your status so friends can see what you're working on.",
  { status: z.string().describe("Your status, e.g. 'debugging auth flow'") },
  async ({ status }) => {
    await waitForConnection();
    ws.send(JSON.stringify({ type: "set-status", status }));
    return { content: [{ type: "text", text: `Status set: "${status}"` }] };
  }
);

server.tool(
  "share-tokens",
  "Share your token usage with friends.",
  { tokens: z.number().describe("Tokens used this session") },
  async ({ tokens }) => {
    await waitForConnection();
    ws.send(JSON.stringify({ type: "share-tokens", tokens }));
    return { content: [{ type: "text", text: `Sharing: ${tokens.toLocaleString()} tokens` }] };
  }
);

server.tool(
  "hide-tokens",
  "Stop sharing token usage.",
  {},
  async () => {
    await waitForConnection();
    ws.send(JSON.stringify({ type: "hide-tokens" }));
    return { content: [{ type: "text", text: "Token usage hidden." }] };
  }
);

server.tool(
  "nudge",
  "Send a nudge/message to a friend.",
  {
    username: z.string().describe("Friend to nudge"),
    message: z.string().optional().describe("Optional message"),
  },
  async ({ username: friend, message }) => {
    const resp = await request(
      { type: "nudge", friend, message },
      "nudge-sent"
    );
    if (resp.type === "error") {
      return { content: [{ type: "text", text: resp.message }] };
    }
    return { content: [{ type: "text", text: `Nudge sent to ${friend}!` }] };
  }
);

server.tool(
  "check-nudges",
  "Check if anyone has nudged you.",
  {},
  async () => {
    const resp = await request({ type: "get-nudges" }, "nudges-list");
    const nudges = resp.nudges || [];
    if (nudges.length === 0) {
      return { content: [{ type: "text", text: "No new nudges." }] };
    }
    const lines = nudges.map((n) => `💬 ${n.from}: ${n.message}`);
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.tool(
  "my-profile",
  "Show your username and status.",
  {},
  async () => {
    return {
      content: [{ type: "text", text: `🟢 ${username} (that's you)` }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

// Cleanup
process.on("SIGINT", () => { ws.close(); process.exit(0); });
process.on("SIGTERM", () => { ws.close(); process.exit(0); });
