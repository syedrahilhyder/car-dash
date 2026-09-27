import * as THREE from 'three';
import { PoliceVehicle } from './policeVehicle.js';
import { POLICE } from './config.js';

// Owns cruiser spawning, the pursuit state machine and the heat level.
export class Pursuit {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.cruisers = [];
    this.heat = 0;
    this.wanted = 0;
    this.escapeTimer = 0;
    this.spawnTimer = 0;
    this.sirenPhase = 0;
  }

  get activeCruisers() {
    return this.cruisers.filter((c) => c.active);
  }

  update(dt, player) {
    const playerSpeed = player.speed;
    const maxSpeed = player.spec.topSpeed;

    // Heat rises from speed, damage and proximity, and decays when the player
    // calms down. The gains comfortably outpace the decay while driving hard,
    // so a wanted level is reachable in a few seconds of committed driving.
    const near = this.nearestActiveDistance(player);
    const speedRatio = Math.min(1, playerSpeed / maxSpeed);
    let heatRate = -POLICE.heatDecayPerSecond;
    // Any real speed attracts attention; the rate scales with how fast.
    if (playerSpeed > 6) heatRate += 2.5 + 16 * speedRatio;
    if (player.damage > 0.25) heatRate += 4 * player.damage;
    if (near < 90) heatRate += 1.5;
    this.heat = THREE.MathUtils.clamp(this.heat + heatRate * dt, 0, 100);

    const targetWanted = Math.min(
      5,
      Math.floor(this.heat / 20) + (player.damage > 0.7 ? 1 : 0),
    );
    this.wanted = targetWanted;

    // A wanted level summons cruisers, up to the cap.
    this.spawnTimer -= dt;
    if (targetWanted > this.activeCruisers.length && this.spawnTimer <= 0 && this.cruisers.length < 10) {
      this.spawn(player);
      this.spawnTimer = POLICE.spawnTimerSeconds;
    }

    // The chase lapses once nothing is chasing and the player has driven calmly
    // for a few seconds. The timer only runs while the player is actually
    // laying low, so this can never clip a heat level that is still climbing.
    const layingLow = this.activeCruisers.length === 0 && playerSpeed < 8;
    if (layingLow) {
      this.escapeTimer += dt;
      if (this.escapeTimer > 3) {
        // Bleed the level off quickly rather than snapping it to zero.
        this.heat = Math.max(0, this.heat - dt * 30);
        if (this.heat === 0) this.wanted = 0;
      }
    } else {
      this.escapeTimer = 0;
    }

    this.sirenPhase += dt * 9;

    for (const cruiser of this.cruisers) {
      cruiser.update(dt, player, this);
    }

    // Retire cruisers that have been smashed up beyond use.
    for (const cruiser of this.cruisers) {
      if (cruiser.active && cruiser.health <= 0) {
        cruiser.setActive(false, this.scene);
        this.heat = Math.max(0, this.heat - 12);
      }
    }
  }

  nearestActiveDistance(player) {
    let best = Infinity;
    for (const c of this.cruisers) {
      if (!c.active) continue;
      best = Math.min(best, c.vehicle.position.distanceTo(player.position));
    }
    return best;
  }

  spawn(player) {
    const free = this.cruisers.find((c) => !c.active);
    const heading = player.heading;
    // Drop in behind the player, or ahead if nothing is behind.
    const behind = player.position
      .clone()
      .addScaledVector(player.forward, -58)
      .addScaledVector(player.right, (Math.random() - 0.5) * 26);
    const ahead = player.position.clone().addScaledVector(player.forward, 62);

    const candidate = Math.abs(behind.x) < 180 && Math.abs(behind.z) < 180 ? behind : ahead;
    candidate.x = THREE.MathUtils.clamp(candidate.x, -180, 180);
    candidate.z = THREE.MathUtils.clamp(candidate.z, -180, 180);

    if (free) {
      free.vehicle.reset(candidate.x, candidate.z, heading);
      free.health = 1;
      free.setActive(true, this.scene);
      return free;
    }

    const cruiser = new PoliceVehicle(this.scene, candidate.x, candidate.z, heading);
    cruiser.startSiren(this.scene);
    this.cruisers.push(cruiser);
    return cruiser;
  }

  reset(scene) {
    for (const c of this.cruisers) c.setActive(false, scene);
    this.heat = 0;
    this.wanted = 0;
  }
}

export { PoliceVehicle };
