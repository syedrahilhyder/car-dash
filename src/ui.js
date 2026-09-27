import { CARS } from './config.js';

// Wires the DOM: car select screen, on-screen controls, HUD and messages.
export function initUI() {
  const el = (id) => document.getElementById(id);

  const ui = {
    startScreen: el('start'),
    carGrid: el('carGrid'),
    startBtn: el('startBtn'),
    hud: el('hud'),
    speedo: el('speedo'),
    speedNeedle: el('speedNeedle'),
    gear: el('gear'),
    damageBar: el('damageBar'),
    damagePct: el('damagePct'),
    wanted: el('wanted'),
    heatBar: el('heatBar'),
    status: el('status'),
    toast: el('toast'),
    resetBtn: el('resetBtn'),
    cameraBtn: el('cameraBtn'),
    helpBtn: el('helpBtn'),
    helpPanel: el('helpPanel'),
    padLeft: el('padLeft'),
    padRight: el('padRight'),
    steerLeft: el('steerLeft'),
    steerRight: el('steerRight'),
    gas: el('gas'),
    brake: el('brake'),
    handbrake: el('handbrake'),
    loading: el('loading'),
  };

  let selected = CARS[0].key;
  renderCars();
  el('loading').classList.add('hidden');
  ui.startScreen.classList.remove('hidden');

  function renderCars() {
    ui.carGrid.innerHTML = '';
    for (const car of CARS) {
      const card = document.createElement('button');
      card.className = 'car-card' + (car.key === selected ? ' selected' : '');
      card.type = 'button';
      card.dataset.key = car.key;
      card.innerHTML = `
        <span class="swatch" style="background:#${car.color.toString(16).padStart(6, '0')}"></span>
        <span class="car-name">${car.name}</span>
        <span class="car-blurb">${car.blurb}</span>
        <span class="car-stats">
          <span>Speed <b>${car.topSpeed}</b></span>
          <span>Grip <b>${Math.round(car.grip * 100)}</b></span>
          <span>Armour <b>${Math.round(car.durability * 100)}</b></span>
        </span>`;
      card.addEventListener('click', () => {
        selected = car.key;
        renderCars();
      });
      ui.carGrid.appendChild(card);
    }
  }

  const callbacks = {};
  ui.startBtn.addEventListener('click', () => callbacks.onStart?.(selected));
  ui.resetBtn.addEventListener('click', () => callbacks.onReset?.());
  ui.cameraBtn.addEventListener('click', () => callbacks.onCamera?.());
  ui.helpBtn.addEventListener('click', () => ui.helpPanel.classList.toggle('open'));

  // ---------------------------------------------------------------------
  // On-screen controls. Steering pad sits on the left, pedals on the right.
  // Pointer events cover touch, pen and mouse in one path.
  // ---------------------------------------------------------------------
  const input = { steer: 0, throttle: 0, handbrake: false, left: false, right: false };

  function bindHold(holder, onDown, onUp) {
    const down = (e) => {
      e.preventDefault();
      holder.classList.add('active');
      holder.setPointerCapture?.(e.pointerId);
      onDown();
    };
    const up = (e) => {
      e.preventDefault();
      holder.classList.remove('active');
      onUp();
    };
    holder.addEventListener('pointerdown', down);
    holder.addEventListener('pointerup', up);
    holder.addEventListener('pointercancel', up);
    holder.addEventListener('pointerleave', (e) => {
      if (e.buttons) up(e);
    });
    // Stop the browser treating long presses as text selection / context menu.
    holder.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  bindHold(
    ui.steerLeft,
    () => {
      input.left = true;
      applySteer();
    },
    () => {
      input.left = false;
      applySteer();
    },
  );
  bindHold(
    ui.steerRight,
    () => {
      input.right = true;
      applySteer();
    },
    () => {
      input.right = false;
      applySteer();
    },
  );
  function applySteer() {
    input.steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  }

  bindHold(ui.gas, () => (input.throttle = 1), () => (input.throttle = 0));
  bindHold(ui.brake, () => (input.throttle = -1), () => (input.throttle = 0));
  bindHold(ui.handbrake, () => (input.handbrake = true), () => (input.handbrake = false));

  // ---------------------------------------------------------------------
  // Keyboard, for desktop play.
  // ---------------------------------------------------------------------
  const keys = new Set();
  const keyMap = {
    ArrowUp: 'gas',
    KeyW: 'gas',
    ArrowDown: 'brake',
    KeyS: 'brake',
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    Space: 'handbrake',
  };

  function syncKeyboard() {
    input.left = keys.has('left');
    input.right = keys.has('right');
    applySteer();
    input.throttle = keys.has('gas') ? 1 : keys.has('brake') ? -1 : 0;
    input.handbrake = keys.has('handbrake');
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR') {
      callbacks.onReset?.();
      return;
    }
    if (e.code === 'KeyC') {
      callbacks.onCamera?.();
      return;
    }
    const action = keyMap[e.code];
    if (!action) return;
    e.preventDefault();
    keys.add(action);
    syncKeyboard();
  });
  window.addEventListener('keyup', (e) => {
    const action = keyMap[e.code];
    if (!action) return;
    keys.delete(action);
    syncKeyboard();
  });
  // Releasing focus must not leave the throttle stuck on.
  window.addEventListener('blur', () => {
    keys.clear();
    input.left = false;
    input.right = false;
    input.steer = 0;
    input.throttle = 0;
    input.handbrake = false;
  });

  return {
    input,
    callbacks,
    showStart(show) {
      ui.startScreen.classList.toggle('hidden', !show);
      ui.hud.classList.toggle('hidden', show);
    },
    get selectedCar() {
      return selected;
    },
    setSpeed(speed, topSpeed) {
      const kmh = Math.round(speed * 3.6);
      ui.speedo.textContent = String(kmh);
      const ratio = Math.min(1, speed / topSpeed);
      ui.speedNeedle.style.transform = `rotate(${-120 + ratio * 240}deg)`;
      ui.gear.textContent = speed < 0.5 ? 'N' : `${Math.min(6, 1 + Math.floor(ratio * 5.9))}`;
    },
    setDamage(damage) {
      ui.damageBar.style.width = `${Math.round(damage * 100)}%`;
      ui.damageBar.style.background = damage > 0.7 ? '#e0563f' : damage > 0.35 ? '#e8a13a' : '#5bc98a';
      ui.damagePct.textContent = `${Math.round(damage * 100)}%`;
    },
    setWanted(level) {
      ui.wanted.textContent = level > 0 ? '★'.repeat(level) : '—';
      ui.wanted.dataset.level = String(level);
      ui.heatBar.style.opacity = level > 0 ? '1' : '0.25';
    },
    setStatus(text) {
      if (ui.status.textContent === text) return;
      ui.status.textContent = text;
      ui.status.classList.toggle('visible', Boolean(text));
    },
    toast(text) {
      ui.toast.textContent = text;
      ui.toast.classList.add('show');
      clearTimeout(ui._toastTimer);
      ui._toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1600);
    },
  };

}
