import { CarDashGame } from './game.js';
import { initUI } from './ui.js';
import { NetSession } from './net.js';

const canvas = document.getElementById('scene');
const ui = initUI();

let game = null;
let net = null;

const statusFor = (state) => {
  ui.setLinkStatus(state);
  if (state === 'connected') {
    ui.setStartEnabled(true);
    ui.setHostStatus('Linked. Start driving when you are both ready.');
    ui.setJoinStatus('Linked. Start driving when you are both ready.');
  }
};

// Picking a mode tears down whatever session was running: switching from solo to
// host must not leave the old host holding its code on the broker.
ui.callbacks.onModeChosen = async (mode) => {
  net?.close();
  net = null;
  ui.setRoomCode('···');
  ui.setStartEnabled(mode === 'solo', mode === 'solo' ? 'Start driving' : 'Waiting for a player…');
  if (mode === 'solo') return;

  net = new NetSession({ onStatus: statusFor });
  try {
    if (mode === 'host') {
      ui.setHostStatus('Claiming a code…');
      const code = await net.host();
      ui.setRoomCode(code);
      ui.setHostStatus('Give this code to the other player.');
    } else {
      ui.setJoinStatus('Ask the other player for their three-digit code.');
    }
  } catch (error) {
    ui.setLinkStatus('failed');
    ui.setHostStatus(error.message);
    net?.close();
    net = null;
  }
};

// The guest dials the code the host is showing; the broker links the two, so the
// start button only unlocks once the channel is actually open.
ui.callbacks.onJoinCode = async (code) => {
  if (!/^\d{3}$/.test(code)) {
    ui.setJoinStatus('Enter the three-digit code from the other device.');
    return;
  }
  ui.setJoinStatus('Looking for that game…');
  try {
    await net.join(code);
  } catch (error) {
    // The failed dial leaves a broker connection open behind it; close it so a
    // corrected code starts from a clean peer. The session stays usable, since
    // join() builds a fresh peer each time.
    net.close();
    ui.setLinkStatus('failed');
    ui.setJoinStatus(error.message);
    ui.setStartEnabled(false, 'Waiting for a player…');
  }
};

ui.callbacks.onNotice = (text) => ui.toast(text);

ui.callbacks.onStart = (carKey, mode) => {
  const linked = mode === 'solo' ? null : net;
  if (game) {
    game.net = linked;
    if (linked) {
      linked.onState = (msg) => game.receivePeerState(msg);
      linked.onPolice = (list) => game.receivePolice(list);
    }
    game.restart(carKey);
  } else {
    game = new CarDashGame({ canvas, ui, carKey, net: linked });
    window.carDash = game;
  }
  ui.showStart(false);
};

ui.callbacks.onReset = () => game?.respawnPlayer();
ui.callbacks.onCamera = () => game?.cycleCamera();

// The PWA service worker lets the game boot offline once it has been played.
if ('serviceWorker' in navigator && !location.hostname.includes('localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}

window.addEventListener('error', (event) => {
  const el = document.getElementById('status');
  if (el) {
    el.textContent = `Error: ${event.message}`;
    el.classList.add('visible');
  }
});
