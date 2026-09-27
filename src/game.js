import * as THREE from 'three';
import { PHYSICS, POI, WORLD } from './config.js';
import { Vehicle } from './vehicle.js';
import { buildWorld } from './world.js';
import { Pursuit } from './pursuit.js';
import { resolveCarCollision, resolveWaterAndBounds, resolveWorldCollisions } from './physics.js';
import { groundHeightAt, isBeach } from './terrain.js';

const CAMERA_MODES = ['chase', 'bonnet', 'far'];

// The camera pulls in when the chase position would sit inside a building,
// which otherwise leaves the player looking at the inside of a wall.
function cameraBlocked(point, colliders) {
  const margin = 1.5;
  for (const c of colliders) {
    if (c.height < 3) continue;
    if (
      point.x > c.minX - margin &&
      point.x < c.maxX + margin &&
      point.z > c.minZ - margin &&
      point.z < c.maxZ + margin
    ) {
      return true;
    }
  }
  return false;
}

// Spawn sits on the western arm of the ring road, heading south across the open
// middle of town. It is clear of the central ramp at (0, -46), and gives the
// player the longest run-up before meeting the beach to the north.
const WORLD_SPAWN_X = -WORLD.ringRadius;
const WORLD_SPAWN_Z = 0;

export class CarDashGame {
  constructor({ canvas, ui, carKey }) {
    this.canvas = canvas;
    this.ui = ui;
    this.cameraMode = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.4, 900);

    this.world = buildWorld(this.scene);
    this.pursuit = new Pursuit(this.scene, this.world);

    this.clock = new THREE.Clock();
    this.spawnPoint = new THREE.Vector3(0, 0, -WORLD_SPAWN_Z);
    this.cameraOffset = new THREE.Vector3();
    this.lastGarageUse = 0;
    this.message = '';

    this.player = new Vehicle(carKey, { isPlayer: true });
    this.scene.add(this.player.group);
    this.respawnPlayer();

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();

    this._loop = this._loop.bind(this);
    this.renderer.setAnimationLoop(this._loop);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  restart(carKey) {
    this.scene.remove(this.player.group);
    this.player = new Vehicle(carKey, { isPlayer: true });
    this.scene.add(this.player.group);
    this.pursuit.reset(this.scene);
    this.respawnPlayer();
  }

  respawnPlayer() {
    // Heading of PI points down -Z, i.e. south, into the open middle of the map.
    this.player.reset(WORLD_SPAWN_X, WORLD_SPAWN_Z, Math.PI);
    this.player.repair();
    this.pursuit.reset(this.scene);
    this.ui.toast('Back on the road');
  }

  cycleCamera() {
    this.cameraMode = (this.cameraMode + 1) % CAMERA_MODES.length;
    this.ui.toast(`Camera: ${CAMERA_MODES[this.cameraMode]}`);
  }

  _loop() {
    const dt = Math.min(this.clock.getDelta(), 1 / 30);
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    const player = this.player;
    const input = this.ui.input;

    player.update(dt, input);

    // World, boundary and water.
    resolveWorldCollisions(player, this.world.colliders, (damage, speed) => {
      player.applyDamage(damage);
      if (speed > 12) this.ui.toast('Crash!');
    });
    resolveWaterAndBounds(player, (damage) => player.applyDamage(damage));

    // Police. Cruisers act on the player they can see, which is the player.
    this.pursuit.update(dt, player);

    // Car to car: the player against each cruiser. Cruisers keep their own
    // world collisions so they cannot be shoved through buildings.
    for (const cruiser of this.pursuit.activeCruisers) {
      resolveCarCollision(player, cruiser.vehicle, (force) => {
        const playerDamage = (force * PHYSICS.damagePerImpact) / Math.max(0.4, player.spec.durability);
        player.applyDamage(playerDamage);
        cruiser.takeHit(force);
        if (force > 14) this.ui.toast('Police rammed you!');
      });
      resolveWorldCollisions(cruiser.vehicle, this.world.colliders, null);
      resolveWaterAndBounds(cruiser.vehicle, null);
    }

    // POI triggers.
    this.handlePoi(dt);

    // Steadily cool the player's damage only in the garage, never passively.
    this.ui.setSpeed(player.speed, player.spec.topSpeed);
    this.ui.setDamage(player.damage);
    this.ui.setWanted(this.pursuit.wanted);

    this.updateCamera(dt);
  }

  handlePoi(dt) {
    const p = this.player.position;
    let inside = null;
    for (const poi of POI) {
      if (!poi.trigger) continue;
      const dx = p.x - poi.trigger.x;
      const dz = p.z - poi.trigger.z;
      if (dx * dx + dz * dz < poi.trigger.radius * poi.trigger.radius) {
        inside = poi;
        break;
      }
    }

    this._poi = inside;
    if (!inside) {
      this.ui.setStatus(p.speed < 3 && isBeach(p.x, p.z) ? 'Beach — find a ramp' : '');
      return;
    }

    if (inside.id === 'garage') {
      this.lastGarageUse += dt;
      if (this.player.damage > 0.01 && this.lastGarageUse > 0.4) {
        const before = this.player.damage;
        this.player.damage = Math.max(0, this.player.damage - dt * 1.6);
        this.ui.setStatus('Repairing…');
        if (before > 0.05 && this.player.damage <= 0.05) this.ui.toast('Good as new');
      } else {
        this.ui.setStatus(this.player.damage <= 0.01 ? 'Garage — car is pristine' : 'Repairing…');
      }
      return;
    }

    if (inside.id === 'gas') {
      this.ui.setStatus('Gas station — press R to refill and reset');
      return;
    }

    this.ui.setStatus(`${inside.label} — ${inside.hint}`);
  }

  updateCamera(dt) {
    const player = this.player;
    const mode = CAMERA_MODES[this.cameraMode];

    let target;
    let lookAt;

    if (mode === 'bonnet') {
      target = player.position.clone().add(new THREE.Vector3(0, 1.35, 0));
      const offset = new THREE.Vector3(0, 1.05, 0.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.heading);
      target.add(offset);
      lookAt = player.position.clone().addScaledVector(player.forward, 26).add(new THREE.Vector3(0, 1.1, 0));
    } else {
      let distance = mode === 'far' ? 19 : 12.5;
      const height = mode === 'far' ? 9 : 5.4;
      // Chase camera lags behind the car and pulls back with speed.
      const stretch = 1 + Math.min(0.35, player.speed / 220);
      const back = player.forward.clone().multiplyScalar(-distance * stretch);
      target = player.position.clone().add(back).add(new THREE.Vector3(0, height + Math.min(2, player.speed / 40), 0));
      lookAt = player.position.clone().addScaledVector(player.forward, 8).add(new THREE.Vector3(0, 1.3, 0));

      // Walk the camera in until it is clear of any building it would sit in,
      // so the view never ends up inside a wall.
      for (let i = 0; i < 6 && cameraBlocked(target, this.world.colliders); i++) {
        distance *= 0.68;
        target = player.position
          .clone()
          .add(player.forward.clone().multiplyScalar(-distance * stretch))
          .add(new THREE.Vector3(0, height + Math.min(2, player.speed / 40), 0));
      }
    }

    // Keep the camera above the ground so it never clips through the field.
    const ground = groundHeightAt(target.x, target.z);
    target.y = Math.max(target.y, ground + 1.2);

    // Inside a POI bay the canopy sits directly over the car, so a chase camera
    // would be looking at the underside of a roof. Drop to a low, wide angle
    // while the car is under cover.
    if (this._poi) {
      target.y = Math.max(ground + 1.6, player.position.y + 2.4);
      lookAt = player.position.clone().add(new THREE.Vector3(0, 1.0, 0));
    }

    this.cameraOffset.lerp(target, 1 - Math.exp(-dt * (mode === 'bonnet' ? 14 : 7)));
    this.camera.position.copy(this.cameraOffset);
    this.camera.lookAt(lookAt);
    this.camera.rotation.z += player.bodyRoll * 0.18;
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
  }
}
