// Lightweight status line for Claude Code
// Connects, grabs friend count, prints one line, exits
import { getConfig, queryFriends } from "./client.js";

const config = getConfig();
if (!config) {
  process.stdout.write("○ friends: run claude-friends setup");
  process.exit(0);
}

try {
  const friends = await queryFriends(config.username, 3000);
  const online = friends.filter((f) => f.online);
  const dot = online.length > 0 ? "🟢" : "⚫";
  const names = online.slice(0, 3).map((f) => f.name).join(", ");
  const suffix = online.length > 3 ? "…" : "";
  const nameStr = names ? ` (${names}${suffix})` : "";
  process.stdout.write(`${dot} ${online.length} online${nameStr}`);
} catch {
  process.stdout.write("○ friends: offline");
}

process.exit(0);
