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
    poster: el('poster'),
    posterFace: el('posterFace'),
    posterName: el('posterName'),
    posterBounty: el('posterBounty'),
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

  // ---------------------------------------------------------------------
  // Wanted poster portrait.
  //
  // Drawn from primitives rather than loaded from a file: the game ships no
  // photographs, and a stylised mugshot suit-for-suit with the paper avoids
  // putting any real person's face on a wanted notice.
  // ---------------------------------------------------------------------
  function drawPosterFace(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width: w, height: h } = canvas;

    const paper = '#d9c49a';
    const ink = '#2a2f38';
    const coat = '#4b5a67';
    const skin = '#c98f63';
    const shadow = '#a9714b';

    ctx.clearRect(0, 0, w, h);

    // Backdrop: a plain height-chart wall, as in a real mugshot.
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(42, 47, 56, 0.16)';
    ctx.lineWidth = 2;
    for (let y = 30; y < h; y += 46) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const cx = w / 2;

    // Shoulders and coat collar.
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.46, h);
    ctx.quadraticCurveTo(cx - w * 0.42, h * 0.78, cx - w * 0.2, h * 0.72);
    ctx.lineTo(cx + w * 0.2, h * 0.72);
    ctx.quadraticCurveTo(cx + w * 0.42, h * 0.78, cx + w * 0.46, h);
    ctx.closePath();
    ctx.fill();

    // Collar, lighter so the neck reads separately from the coat.
    ctx.fillStyle = '#5f707e';
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.2, h * 0.72);
    ctx.lineTo(cx, h * 0.85);
    ctx.lineTo(cx + w * 0.2, h * 0.72);
    ctx.closePath();
    ctx.fill();

    // Neck.
    ctx.fillStyle = shadow;
    ctx.fillRect(cx - w * 0.09, h * 0.6, w * 0.18, h * 0.16);

    // Head.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(cx, h * 0.44, w * 0.21, h * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ears.
    ctx.beginPath();
    ctx.ellipse(cx - w * 0.21, h * 0.45, w * 0.045, h * 0.06, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + w * 0.21, h * 0.45, w * 0.045, h * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hair, swept back and low over the brow.
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(cx, h * 0.3, w * 0.225, h * 0.14, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.225, h * 0.3);
    ctx.quadraticCurveTo(cx - w * 0.1, h * 0.24, cx + w * 0.225, h * 0.3);
    ctx.lineTo(cx + w * 0.225, h * 0.24);
    ctx.quadraticCurveTo(cx, h * 0.15, cx - w * 0.225, h * 0.24);
    ctx.closePath();
    ctx.fill();

    // Brows.
    ctx.fillStyle = ink;
    ctx.fillRect(cx - w * 0.14, h * 0.4, w * 0.1, h * 0.018);
    ctx.fillRect(cx + w * 0.04, h * 0.4, w * 0.1, h * 0.018);

    // Eyes, with a catchlight so the face does not read as flat.
    for (const dx of [-w * 0.09, w * 0.09]) {
      ctx.fillStyle = '#f6f2e8';
      ctx.beginPath();
      ctx.ellipse(cx + dx, h * 0.45, w * 0.05, h * 0.028, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(cx + dx, h * 0.45, w * 0.022, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(cx + dx - w * 0.008, h * 0.443, w * 0.007, 0, Math.PI * 2);
      ctx.fill();
    }

    // Nose and a flat, unimpressed mouth.
    ctx.strokeStyle = shadow;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, h * 0.47);
    ctx.lineTo(cx - w * 0.02, h * 0.54);
    ctx.stroke();

    ctx.strokeStyle = ink;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.06, h * 0.6);
    ctx.quadraticCurveTo(cx, h * 0.585, cx + w * 0.06, h * 0.6);
    ctx.stroke();

    // Height chart ticks down the side.
    ctx.fillStyle = 'rgba(42, 47, 56, 0.35)';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(6, 40 + i * 46, 18, 2);
    }
  }

  let selected = CARS[0].key;
  drawPosterFace(ui.posterFace);
  renderPosterFor(CARS[0]);
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
        renderPosterFor(car);
      });
      ui.carGrid.appendChild(card);
    }
  }

  // The bounty scales with the car rather than being fixed, so the poster
  // reads as this car's notice rather than a generic prop.
  function renderPosterFor(car) {
    ui.posterName.textContent = car.name;
    const bounty = 1500 + Math.round(car.topSpeed * 40);
    // Built from a char code so the currency symbol survives any tooling
    // that treats a bare dollar sign as an interpolation start.
    ui.posterBounty.textContent = String.fromCharCode(36) + bounty.toLocaleString('en-US');
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
      // The poster only goes up once the chase is serious.
      ui.poster.classList.toggle('show', level >= 3);
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
