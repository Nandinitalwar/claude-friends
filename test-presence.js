#!/usr/bin/env node

// Test: presence lifecycle with multiple friends
// Verifies that the cache file and statusline correctly reflect
// friends going online, staying online, and going offline.

import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";
import { createConnection } from "./client.js";

const CACHE_PATH = join(homedir(), ".claude-friends-online.json");
const TIMEOUT_MS = 60000;
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

// Read cache file the same way statusline does
function readCache() {
  try {
    const cache = JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
    if (!cache.lastUpdate || Date.now() - cache.lastUpdate > 30000) return { count: 0, names: [], stale: true };
    return { count: cache.onlineCount || 0, names: cache.onlineNames || [], stale: false };
  } catch {
    return { count: 0, names: [], stale: false };
  }
}

// Simulate the daemon's cache write
function writeCacheLikeDaemon(friends) {
  const onlineNames = friends.filter(f => f.online).map(f => f.name);
  writeFileSync(CACHE_PATH, JSON.stringify({
    onlineCount: onlineNames.length,
    onlineNames,
    lastUpdate: Date.now(),
  }));
}

// Connect a fake user, wait for state message, return { ws, state }
function connectUser(username) {
  return new Promise((resolve, reject) => {
    const ws = createConnection(username);
    const timer = setTimeout(() => reject(new Error(`${username} connect timeout`)), 10000);
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "state") {
        clearTimeout(timer);
        resolve({ ws, state: msg });
      }
    });
    ws.addEventListener("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

// Send a message and wait for a specific response type
function sendAndWait(ws, message, responseType) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${responseType}`)), 10000);
    const handler = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === responseType || msg.type === "error") {
        clearTimeout(timer);
        ws.removeEventListener("message", handler);
        resolve(msg);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify(message));
  });
}

// Wait for the server to broadcast a presence change for a specific user
function waitForPresence(ws, targetUsername, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${targetUsername} presence`)), timeout);
    const handler = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "presence" && msg.username === targetUsername) {
        clearTimeout(timer);
        ws.removeEventListener("message", handler);
        resolve(msg);
      }
    };
    ws.addEventListener("message", handler);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log("\n🧪 Presence lifecycle test\n");

  // --- Setup: register test users ---
  console.log("Setup: registering test users...");
  const users = ["test-alice", "test-bob", "test-charlie", "test-viewer"];
  const connections = {};

  for (const u of users) {
    const { ws } = await connectUser(u);
    await sendAndWait(ws, { type: "register" }, "register-result");
    connections[u] = ws;
  }

  // Make viewer friends with all three
  for (const friend of ["test-alice", "test-bob", "test-charlie"]) {
    await sendAndWait(connections["test-viewer"], { type: "add-friend", friend }, "friend-added");
    // Make it mutual so presence shows
    await sendAndWait(connections[friend], { type: "add-friend", friend: "test-viewer" }, "friend-added");
  }

  // Close all connections to start clean
  for (const u of users) {
    connections[u].close();
  }
  console.log("  All users registered and friended. Waiting for offline...\n");
  await sleep(12000); // wait for grace period

  // ============================================
  // TEST 1: Single friend comes online
  // ============================================
  console.log("Test 1: Single friend comes online");
  const { ws: aliceWs } = await connectUser("test-alice");

  // Simulate what the viewer's daemon would do: query friends and write cache
  const { ws: viewerWs } = await connectUser("test-viewer");
  const friendsList1 = await sendAndWait(viewerWs, { type: "get-friends" }, "friends-list");
  writeCacheLikeDaemon(friendsList1.friends);

  const cache1 = readCache();
  assert(cache1.count === 1, `1 friend online (got ${cache1.count})`);
  assert(cache1.names.includes("test-alice"), `alice is in online names (got ${cache1.names})`);

  // ============================================
  // TEST 2: Multiple friends come online
  // ============================================
  console.log("\nTest 2: Multiple friends come online");
  const { ws: bobWs } = await connectUser("test-bob");
  const { ws: charlieWs } = await connectUser("test-charlie");
  await sleep(1000); // let server process

  const friendsList2 = await sendAndWait(viewerWs, { type: "get-friends" }, "friends-list");
  writeCacheLikeDaemon(friendsList2.friends);

  const cache2 = readCache();
  assert(cache2.count === 3, `3 friends online (got ${cache2.count})`);
  assert(cache2.names.includes("test-alice"), "alice still online");
  assert(cache2.names.includes("test-bob"), "bob is online");
  assert(cache2.names.includes("test-charlie"), "charlie is online");

  // ============================================
  // TEST 3: One friend goes offline
  // ============================================
  console.log("\nTest 3: One friend disconnects");
  bobWs.close();
  console.log("  Waiting 12s for grace period...");
  await sleep(12000);

  const friendsList3 = await sendAndWait(viewerWs, { type: "get-friends" }, "friends-list");
  writeCacheLikeDaemon(friendsList3.friends);

  const cache3 = readCache();
  assert(cache3.count === 2, `2 friends online after bob leaves (got ${cache3.count})`);
  assert(!cache3.names.includes("test-bob"), "bob is gone");
  assert(cache3.names.includes("test-alice"), "alice still online");
  assert(cache3.names.includes("test-charlie"), "charlie still online");

  // ============================================
  // TEST 4: All friends go offline
  // ============================================
  console.log("\nTest 4: All friends disconnect");
  aliceWs.close();
  charlieWs.close();
  console.log("  Waiting 12s for grace period...");
  await sleep(12000);

  const friendsList4 = await sendAndWait(viewerWs, { type: "get-friends" }, "friends-list");
  writeCacheLikeDaemon(friendsList4.friends);

  const cache4 = readCache();
  assert(cache4.count === 0, `0 friends online (got ${cache4.count})`);
  assert(cache4.names.length === 0, `no names in list (got ${cache4.names})`);

  // ============================================
  // TEST 5: Stale cache is rejected
  // ============================================
  console.log("\nTest 5: Stale cache rejected after 30s");
  // Write cache with old timestamp
  writeFileSync(CACHE_PATH, JSON.stringify({
    onlineCount: 5,
    onlineNames: ["ghost1", "ghost2", "ghost3", "ghost4", "ghost5"],
    lastUpdate: Date.now() - 31000,
  }));

  const cache5 = readCache();
  assert(cache5.count === 0, `stale cache returns 0 (got ${cache5.count})`);
  assert(cache5.stale === true, "cache is marked stale");

  // ============================================
  // TEST 6: Cache with wrong field name (the old bug)
  // ============================================
  console.log("\nTest 6: Cache with 'timestamp' field (old bug) is treated as stale");
  writeFileSync(CACHE_PATH, JSON.stringify({
    onlineCount: 3,
    onlineNames: ["ghost1", "ghost2", "ghost3"],
    timestamp: Date.now(), // old field name
  }));

  const cache6 = readCache();
  assert(cache6.count === 0, `cache with wrong field name returns 0 (got ${cache6.count})`);

  // ============================================
  // Cleanup
  // ============================================
  viewerWs.close();

  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${"=".repeat(40)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
