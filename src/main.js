import * as THREE from 'three';
import { CarDashGame } from './game.js';
import { initUI } from './ui.js';

const canvas = document.getElementById('scene');
const ui = initUI();

let game = null;

ui.callbacks.onStart = (carKey) => {
  if (game) {
    game.restart(carKey);
  } else {
    game = new CarDashGame({ canvas, ui, carKey });
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
