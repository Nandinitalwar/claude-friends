// PartyKit server — handles presence, friends, nudges
// One room "lobby" holds all state

export default class FriendsServer {
  constructor(room) {
    this.room = room;
    // { username: { online, status, tokensUsed, lastSeen, connectionId } }
    this.users = {};
    // { username: [friendUsername, ...] }
    this.friends = {};
    // { username: [{ from, message, timestamp }, ...] }
    this.nudges = {};
  }

  onConnect(conn, ctx) {
    const url = new URL(ctx.request.url);
    const username = url.searchParams.get("username");
    const isQuery = url.searchParams.get("query") === "true";
    if (!username) {
      conn.close(4000, "username required");
      return;
    }

    conn._username = username;
    conn._isQuery = isQuery;

    // Track all connections per user
    if (!this.connections) this.connections = {};
    if (!this.connections[username]) this.connections[username] = new Set();
    this.connections[username].add(conn.id);

    // Preserve existing status/tokens if already online
    const existing = this.users[username];
    this.users[username] = {
      online: true,
      status: existing?.status || "coding",
      tokensUsed: existing?.tokensUsed || null,
      lastSeen: Date.now(),
    };

    // Send current state to the new connection
    conn.send(JSON.stringify({
      type: "state",
      users: this.users,
      friends: this.friends[username] || [],
      nudges: this.nudges[username] || [],
    }));

    // Clear nudges after sending
    if (this.nudges[username]) {
      this.nudges[username] = [];
    }

    // Broadcast presence update
    this.broadcast({
      type: "presence",
      username,
      data: this.users[username],
    });
  }

  onClose(conn) {
    const username = conn._username;
    if (!username || !this.users[username]) return;

    // Remove this connection from tracking
    if (this.connections?.[username]) {
      this.connections[username].delete(conn.id);

      // Only mark offline if NO connections remain
      if (this.connections[username].size === 0) {
        this.users[username].online = false;
        this.users[username].lastSeen = Date.now();

        this.broadcast({
          type: "presence",
          username,
          data: this.users[username],
        });
      }
    }
  }

  onMessage(message, conn) {
    const username = conn._username;
    if (!username) return;

    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    switch (msg.type) {
      case "set-status": {
        if (this.users[username]) {
          this.users[username].status = msg.status;
          this.users[username].lastSeen = Date.now();
          this.broadcast({
            type: "presence",
            username,
            data: this.users[username],
          });
        }
        break;
      }

      case "share-tokens": {
        if (this.users[username]) {
          this.users[username].tokensUsed = msg.tokens;
          this.broadcast({
            type: "presence",
            username,
            data: this.users[username],
          });
        }
        break;
      }

      case "hide-tokens": {
        if (this.users[username]) {
          this.users[username].tokensUsed = null;
          this.broadcast({
            type: "presence",
            username,
            data: this.users[username],
          });
        }
        break;
      }

      case "add-friend": {
        const friend = msg.friend;
        if (friend === username) {
          conn.send(JSON.stringify({ type: "error", message: "Can't add yourself!" }));
          break;
        }
        if (!this.users[friend]) {
          conn.send(JSON.stringify({ type: "error", message: `User "${friend}" hasn't joined yet.` }));
          break;
        }

        // Add bidirectional
        if (!this.friends[username]) this.friends[username] = [];
        if (!this.friends[friend]) this.friends[friend] = [];

        if (!this.friends[username].includes(friend)) {
          this.friends[username].push(friend);
        }
        if (!this.friends[friend].includes(username)) {
          this.friends[friend].push(username);
        }

        // Notify both
        conn.send(JSON.stringify({ type: "friend-added", friend }));
        this.sendToUser(friend, { type: "friend-added", friend: username });
        break;
      }

      case "remove-friend": {
        const target = msg.friend;
        if (this.friends[username]) {
          this.friends[username] = this.friends[username].filter((f) => f !== target);
        }
        if (this.friends[target]) {
          this.friends[target] = this.friends[target].filter((f) => f !== username);
        }
        conn.send(JSON.stringify({ type: "friend-removed", friend: target }));
        this.sendToUser(target, { type: "friend-removed", friend: username });
        break;
      }

      case "nudge": {
        const nudgeTarget = msg.friend;
        const myFriends = this.friends[username] || [];
        if (!myFriends.includes(nudgeTarget)) {
          conn.send(JSON.stringify({ type: "error", message: `${nudgeTarget} is not your friend.` }));
          break;
        }

        const nudge = {
          from: username,
          message: msg.message || "👋 Hey! What are you working on?",
          timestamp: Date.now(),
        };

        // If they're online, send directly
        const sent = this.sendToUser(nudgeTarget, { type: "nudge", ...nudge });
        if (!sent) {
          // Store for later
          if (!this.nudges[nudgeTarget]) this.nudges[nudgeTarget] = [];
          this.nudges[nudgeTarget].push(nudge);
        }

        conn.send(JSON.stringify({ type: "nudge-sent", friend: nudgeTarget }));
        break;
      }

      case "get-friends": {
        const myFriendList = this.friends[username] || [];
        const friendsData = myFriendList.map((f) => ({
          name: f,
          ...(this.users[f] || { online: false, status: "unknown", lastSeen: null }),
        }));
        conn.send(JSON.stringify({ type: "friends-list", friends: friendsData }));
        break;
      }

      case "get-nudges": {
        const pending = this.nudges[username] || [];
        conn.send(JSON.stringify({ type: "nudges-list", nudges: pending }));
        this.nudges[username] = [];
        break;
      }
    }
  }

  sendToUser(username, data) {
    for (const conn of this.room.getConnections()) {
      if (conn._username === username) {
        conn.send(JSON.stringify(data));
        return true;
      }
    }
    return false;
  }

  broadcast(data) {
    const msg = JSON.stringify(data);
    for (const conn of this.room.getConnections()) {
      conn.send(msg);
    }
  }
}
