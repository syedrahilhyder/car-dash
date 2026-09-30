// Peer link between two devices playing the same world.
//
// The game is deployed to GitHub Pages, which is static hosting: there is no
// server process of our own to run a relay or to introduce two browsers to each
// other. WebRTC is the only transport that reaches between devices from a static
// host, and it still needs a signalling step to trade connection details. PeerJS
// supplies that one piece over its public broker, which is what lets the whole
// handshake collapse into a three-digit room code: both devices join the same
// broker, the host claims the code, and the guest dials it.
//
// Once the channel is open it is peer to peer and the broker is out of the path.
// It carries each peer's own car and, from the host, the police the host is
// simulating. Nothing is authoritative over the other car: each device runs its
// own physics on its own car so the driver feels no input lag, and the peer's car
// is drawn from the state stream.

import Peer from 'peerjs';

// Room codes are namespaced before they reach the public broker, so a three-digit
// code cannot collide with anybody else's PeerJS application.
const CODE_PREFIX = 'cardash-room-';
// Three digits, and no leading zero, so the code always reads as exactly three
// digits rather than a two-digit code with padding.
const CODE_MIN = 100;
const CODE_MAX = 999;
const CODE_ATTEMPTS = 12;

// State is sent at the simulation rate, not the render rate: 20 Hz reads as
// smooth once the receiving side interpolates, and keeps a session well inside
// the throughput of a data channel.
const SEND_HZ = 20;
const SEND_INTERVAL = 1000 / SEND_HZ;

function randomCode() {
  return String(CODE_MIN + Math.floor(Math.random() * (CODE_MAX - CODE_MIN + 1)));
}

export class NetSession {
  constructor({ onState, onPolice, onStatus } = {}) {
    this.onState = onState;
    this.onPolice = onPolice;
    this.onStatus = onStatus || (() => {});
    this.peer = null;
    this.conn = null;
    this.role = null;
    this.code = null;
    this.connected = false;
    this._sendTimer = null;
    this._lastState = null;
    this._policeSnapshot = null;
  }

  // Publishes the local car's newest transform. The send loop reads whatever is
  // current, so a stalled frame never piles up a backlog of stale positions.
  publishState(state) {
    this._lastState = state;
  }

  publishPolice(list) {
    this._policeSnapshot = list;
  }

  // Host side. Claims a room code on the broker and waits for the other device.
  // Resolves with the code to show the player.
  host(preferredCode) {
    this.role = 'host';
    if (preferredCode) {
      this.code = String(preferredCode);
      return this._openPeer(this.code);
    }
    return this._claimCode(randomCode(), CODE_ATTEMPTS);
  }

  // A three-digit code is short enough that another session can already hold it,
  // so a taken code is retried rather than reported: the player is shown the code
  // that was actually claimed, never one that failed.
  async _claimCode(code, attemptsLeft) {
    try {
      await this._openPeer(code);
      return code;
    } catch (error) {
      if (error?.type === 'unavailable-id' && attemptsLeft > 1) {
        return this._claimCode(randomCode(), attemptsLeft - 1);
      }
      throw error;
    }
  }

  _openPeer(code) {
    return new Promise((resolve, reject) => {
      this.code = code;
      const peer = new Peer(CODE_PREFIX + code, { debug: 0 });
      this.peer = peer;

      peer.on('open', () => {
        this.onStatus('waiting');
        resolve(code);
      });
      peer.on('connection', (conn) => {
        if (this.conn) {
          // A second device dialling the same room is turned away rather than
          // fighting the first for the stream.
          conn.close();
          return;
        }
        this._attach(conn);
      });
      let claimed = false;
      peer.on('error', (error) => {
        // A failure before the code is claimed is the caller's to handle (a
        // taken code is retried); after that it is a drop, which the status line
        // reports without tearing down a live game.
        if (!claimed) reject(error);
        else this.onStatus(error.type || 'error');
      });
      peer.on('open', () => {
        claimed = true;
      });
      peer.on('disconnected', () => this.onStatus('disconnected'));
    });
  }

  // Guest side. Dials the room code the host is showing.
  async join(code) {
    this.role = 'guest';
    this.code = String(code).trim();
    if (!/^\d{3}$/.test(this.code)) {
      throw new Error('Enter the three-digit code from the other device.');
    }
    return new Promise((resolve, reject) => {
      const peer = new Peer({ debug: 0 });
      this.peer = peer;
      let settled = false;

      peer.on('open', () => {
        this.onStatus('connecting');
        const conn = peer.connect(CODE_PREFIX + this.code, { reliable: false });
        this._attach(conn, resolve);
      });
      peer.on('error', (error) => {
        if (settled) {
          this.onStatus(error.type || 'error');
          return;
        }
        settled = true;
        reject(
          error?.type === 'peer-unavailable'
            ? new Error('No game found on that code. Check the other device is hosting.')
            : error,
        );
      });
    });
  }

  _attach(conn, onOpen) {
    this.conn = conn;
    const open = () => {
      this.connected = true;
      this.onStatus('connected');
      this._startSending();
      onOpen?.(this.code);
    };
    conn.on('open', open);
    conn.on('close', () => {
      this.connected = false;
      this.onStatus('closed');
    });
    conn.on('error', (error) => this.onStatus(error?.type || 'error'));
    conn.on('data', (message) => {
      if (!message || typeof message !== 'object') return;
      if (message.t === 'state') this.onState?.(message);
      else if (message.t === 'police') this.onPolice?.(message.list);
    });
  }

  _startSending() {
    if (this._sendTimer) return;
    this._sendTimer = setInterval(() => {
      if (!this.connected || !this.conn || !this.conn.open) return;
      try {
        if (this._lastState) this.conn.send({ t: 'state', ...this._lastState });
        // Only the host simulates the police, so only the host streams them.
        if (this.role === 'host' && this._policeSnapshot) {
          this.conn.send({ t: 'police', list: this._policeSnapshot });
        }
      } catch {
        // A send racing a drop is not worth tearing the session down for; the
        // close handler will report the drop if that is what happened.
      }
    }, SEND_INTERVAL);
  }

  close() {
    clearInterval(this._sendTimer);
    this._sendTimer = null;
    try {
      this.conn?.close();
      this.peer?.destroy();
    } catch {
      // A session already torn down needs no further teardown.
    }
    this.conn = null;
    this.peer = null;
    this.connected = false;
  }
}
