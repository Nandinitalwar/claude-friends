// Shared client for connecting to the PartyKit server
import PartySocket from "partysocket";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

const CONFIG_PATH = join(homedir(), ".claude-friends.json");

// TODO: replace with your deployed PartyKit URL after `npx partykit deploy`
const PARTY_HOST = "claude-friends-app.nandinitalwar.partykit.dev";

export function getConfig() {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return null;
  }
}

export function createConnection(username) {
  const ws = new PartySocket({
    host: PARTY_HOST,
    room: "lobby",
    query: { username },
  });
  return ws;
}

// One-shot: connect, request data, disconnect
export async function queryFriends(username, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const ws = createConnection(username);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("timeout"));
    }, timeout);

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "get-friends" }));
    });

    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "friends-list") {
        clearTimeout(timer);
        ws.close();
        resolve(msg.friends);
      }
    });

    ws.addEventListener("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
