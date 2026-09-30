import * as THREE from 'three';
import { PHYSICS, POI, POLICE, WORLD } from './config.js';
import { Vehicle } from './vehicle.js';
import { buildWorld } from './world.js';
import { Pursuit } from './pursuit.js';
import { resolveCarCollision, resolveWaterAndBounds, resolveWorldCollisions } from './physics.js';
import { groundHeightAt, isBeach } from './terrain.js';

const CAMERA_MODES = ['chase', 'bonnet', 'far'];

// How quickly the peer's car is drawn towards the newest state received from the
// other device. The stream arrives at 20 Hz, so this smooths across a couple of
// frames; any slower and the other car reads as lagging behind its own position.
const REMOTE_SMOOTH = 14;

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
// The second car starts a little way behind and to the side, so the two are not
// overlapping on the first frame of a networked game.
const WORLD_SPAWN_OFFSET_X = -7;
const WORLD_SPAWN_OFFSET_Z = 7;

// Interpolate between two headings the short way round, so a car crossing the
// -PI/PI seam does not spin the long way to get there.
function lerpAngle(from, to, t) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * t;
}

export class CarDashGame {
  // `net` is a NetSession when the game was started against another device. Each
  // device owns its own car; the host also owns the police, and streams them to
  // the guest so both players see the same cruisers in the same places.
  constructor({ canvas, ui, carKey, net = null }) {
    this.canvas = canvas;
    this.ui = ui;
    this.cameraMode = 0;
    this.net = net;

    // The peer's car, drawn from the state stream rather than simulated here.
    this.remote = null;
    this.remoteKey = null;
    this.remoteTarget = null;
    this.remoteSpeed = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    // The far plane has to clear the whole field, or the far side of the map
    // is clipped away as the camera swings round.
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.4, WORLD.halfSize * 3.5);

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

    if (this.net) {
      this.net.onState = (msg) => this.receivePeerState(msg);
      this.net.onPolice = (list) => this.receivePolice(list);
    }

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
    if (this.isHost) this.pursuit.reset(this.scene);
    this.respawnPlayer();
  }

  // Only the host runs the police, so only the host may reset them. A guest that
  // cleared them would leave every cruiser hidden until the next snapshot.
  get isHost() {
    return !this.net || this.net.role !== 'guest';
  }

  respawnPlayer() {
    // Heading of PI points down -Z, i.e. south, into the open middle of the map.
    this.player.reset(WORLD_SPAWN_X, WORLD_SPAWN_Z, Math.PI);
    this.player.repair();
    if (this.isHost) this.pursuit.reset(this.scene);
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

    this.updateRemote(dt);

    // Police. The host simulates the pursuit, the guest is told where the
    // cruisers are. Either way the cruisers are in this.pursuit.cruisers, so the
    // contact and rendering below are the same on both devices.
    if (this.isHost) {
      // Cruisers pick whichever car is nearer, so a two-car session is chased by
      // a split pack rather than all of it trailing one player.
      this.pursuit.update(dt, player, this.remote ? [this.remote] : []);
      this.publishPolice();
    }

    // Car to car: the local player against each cruiser. Cruisers keep their own
    // world collisions so they cannot be shoved through buildings.
    for (const cruiser of this.pursuit.activeCruisers) {
      if (cruiser.remote) continue;
      resolveCarCollision(player, cruiser.vehicle, (force) => {
        // Each device damages its own car: the host simulates the cruisers but
        // does not simulate the guest's car, so it cannot know when a cruiser
        // hits the guest. Applying the local half on both sides is what keeps a
        // cruiser a real threat to whichever player it has actually reached.
        const playerDamage = (force * PHYSICS.damagePerImpact) / Math.max(0.4, player.spec.durability);
        player.applyDamage(playerDamage);
        // Cruiser health decides when the host retires one, so only the host
        // spends it; a guest's cosmetic damage would be overwritten next
        // snapshot anyway.
        if (this.isHost) cruiser.takeHit(force);
        if (force > 14) this.ui.toast('Police rammed you!');
      });
      // Only the host moves cruisers; on the guest they follow the snapshot.
      if (this.isHost) {
        resolveWorldCollisions(cruiser.vehicle, this.world.colliders, null);
        resolveWaterAndBounds(cruiser.vehicle, null);
      }
    }

    // The two players can shove each other. Each device resolves the contact
    // against its own car only, so neither can claim a hit the other did not
    // see; the peer's car is corrected to the same result by its own physics.
    if (this.remote) {
      resolveCarCollision(player, this.remote, (force) => {
        const damage = (force * PHYSICS.damagePerImpact) / Math.max(0.4, player.spec.durability);
        player.applyDamage(damage);
        if (force > 14) this.ui.toast('Player clash!');
      });
    }

    // POI triggers.
    this.handlePoi(dt);

    // Steadily cool the player's damage only in the garage, never passively.
    this.ui.setSpeed(player.speed, player.spec.topSpeed);
    this.ui.setDamage(player.damage);
    this.ui.setWanted(this.wantedLevel);
    // Only a linked game has another car to report; in solo the panel stays off
    // the screen rather than sitting there reading zero.
    if (this.net) this.ui.setPeer(this.remote ? this.remoteSpeed : 0, this.remoteDamage);

    this.publishLocalState();
    this.updateCamera(dt);
  }

  get remoteDamage() {
    return this.remote ? this.remote.damage : 0;
  }

  // The host runs the pursuit, so it knows the wanted level directly. The guest
  // only sees the cruisers, and derives the same read from how many are out:
  // the host's level is what decides the fleet size, so this tracks it closely
  // without needing another field on the wire.
  get wantedLevel() {
    if (this.isHost) return this.pursuit.wanted;
    return Math.min(5, Math.ceil(this.pursuit.activeCruisers.length / POLICE.cruisersPerWantedLevel));
  }

  // ---------------------------------------------------------------- networking

  // Called at the send rate by the net session with whatever the newest local
  // state is, so a slow frame never builds a backlog of stale positions.
  publishLocalState() {
    if (!this.net) return;
    this.net.publishState({
      car: this.player.spec.key,
      x: this.player.position.x,
      y: this.player.position.y,
      z: this.player.position.z,
      h: this.player.heading,
      v: this.player.speed,
      d: this.player.damage,
    });
  }

  publishPolice() {
    if (!this.net || !this.isHost) return;
    // Sent by index rather than by active list, so a cruiser that retires does
    // not shift every following cruiser onto the wrong body on the guest.
    const list = this.pursuit.cruisers.map((c) => ({
      x: c.vehicle.position.x,
      z: c.vehicle.position.z,
      h: c.vehicle.heading,
      a: c.active ? 1 : 0,
    }));
    this.net.publishPolice(list);
  }

  receivePeerState(msg) {
    this.remoteTarget = msg;

    // The peer's car model is built the first time we are told which car they
    // picked, and rebuilt if they change it on a restart.
    if (msg.car !== this.remoteKey) {
      if (this.remote) this.scene.remove(this.remote.group);
      this.remote = new Vehicle(msg.car, { isPlayer: true });
      this.remote.heading = msg.h;
      this.remote.position.set(msg.x, msg.y, msg.z);
      this.scene.add(this.remote.group);
      this.remoteKey = msg.car;
    }
  }

  // Draws the peer's car towards the newest state. Position is interpolated
  // rather than snapped so a dropped or late packet reads as a car sliding, not
  // one teleporting.
  updateRemote(dt) {
    if (!this.remote || !this.remoteTarget) return;
    const target = this.remoteTarget;
    const blend = 1 - Math.exp(-dt * REMOTE_SMOOTH);
    const before = this.remote.position.clone();
    this.remote.position.x += (target.x - this.remote.position.x) * blend;
    this.remote.position.y += (target.y - this.remote.position.y) * blend;
    this.remote.position.z += (target.z - this.remote.position.z) * blend;
    this.remote.heading = lerpAngle(this.remote.heading, target.h, blend);
    this.remote.damage = target.d;
    this.remoteSpeed = target.v;

    // Velocity is inferred from the movement so the wheels spin and the body
    // rolls at a speed matching what is on screen.
    const travelled = this.remote.position.clone().sub(before);
    if (dt > 0) this.remote.velocity.copy(travelled).multiplyScalar(1 / dt);
    this.remote.speedAlongForward = this.remote.velocity.dot(this.remote.forward);
    this.remote.slideAmount = Math.min(1, this.remote.velocity.dot(this.remote.right) / 16);
    this.remote.updateVisuals(dt, 0, this.remote.velocity.dot(this.remote.right));
  }

  // Guest side: place the cruisers the host is simulating. Cruisers are created
  // on first sight and then only moved, so their bodies are not rebuilt at the
  // snapshot rate.
  receivePolice(list) {
    if (!list || this.isHost) return;
    for (let i = 0; i < list.length; i++) {
      const state = list[i];
      let cruiser = this.pursuit.cruisers[i];
      if (!cruiser) {
        cruiser = this.pursuit.spawnRemoteCruiser(state.x, state.z, state.h);
      }
      cruiser.remote = true;
      cruiser.vehicle.position.set(state.x, groundHeightAt(state.x, state.z), state.z);
      cruiser.vehicle.heading = state.h;
      cruiser.vehicle.group.rotation.y = state.h;
      cruiser.setActive(Boolean(state.a), this.scene);
    }
    // Cruisers the host has retired past the end of this list are hidden.
    for (let i = list.length; i < this.pursuit.cruisers.length; i++) {
      this.pursuit.cruisers[i].setActive(false, this.scene);
    }
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
      // Repair takes a moment rather than being instant, so driving through the
      // bay at speed is not the same as stopping in it.
      if (this.player.damage <= 0.01) {
        this.player.repair();
        this.lastGarageUse = 0;
        this.ui.setStatus('Garage — car is pristine');
        return;
      }
      this.lastGarageUse += dt;
      this.player.damage = Math.max(0, this.player.damage - dt * 1.6);
      this.ui.setStatus(`Repairing… ${Math.round(this.player.damage * 100)}%`);
      if (this.player.damage === 0) {
        this.player.repair();
        this.ui.toast('Good as new');
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
    this.net?.close();
  }
}
