import * as THREE from 'three';
import { PoliceVehicle } from './policeVehicle.js';
import { POLICE, WORLD } from './config.js';

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
    // Set by update() before spawn() can run, so the first drop uses the floor.
    this.playerSpeed = 0;
  }

  get activeCruisers() {
    return this.cruisers.filter((c) => c.active);
  }

  // `others` is the rest of the field: with a second car, the cruisers split
  // between the players rather than all trailing whichever one is passed first.
  update(dt, player, others = []) {
    this.targets = [player, ...others];
    const playerSpeed = player.speed;
    // Remembered for spawn(), which runs after this and needs to know how fast
    // the player is going to pick a drop distance.
    this.playerSpeed = playerSpeed;
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

    // A wanted level summons cruisers. The number out is the level scaled up, so
    // a serious chase puts a fleet on the road rather than one car trailing the
    // player at a distance. The wanted level alone is too coarse a dial.
    const wantedCruisers = Math.min(
      POLICE.maxCruisers,
      Math.max(POLICE.minCruisersPerChase, targetWanted * POLICE.cruisersPerWantedLevel),
    );
    this.spawnTimer -= dt;
    if (targetWanted > 0 && this.activeCruisers.length < wantedCruisers && this.spawnTimer <= 0) {
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

    this._assignTargets();
    for (const cruiser of this.cruisers) {
      cruiser.update(dt, this.targetFor(cruiser), this);
    }

    // Retire cruisers that have been smashed up beyond use.
    for (const cruiser of this.cruisers) {
      if (cruiser.active && cruiser.health <= 0) {
        cruiser.setActive(false, this.scene);
        this.heat = Math.max(0, this.heat - 12);
      }
    }
  }

  // Splits the fleet between the players. With one car every cruiser hunts it.
  // With two, a cruiser stays on the player it was assigned to until the other
  // is meaningfully nearer, so the packs do not swap sides every time the two
  // cars draw level. See POLICE.retargetMargin.
  _assignTargets() {
    const targets = this.targets || [];
    if (targets.length < 2) {
      for (const c of this.cruisers) c._pursue = 0;
      return;
    }
    for (const c of this.cruisers) {
      if (c._pursue == null) c._pursue = this.cruisers.indexOf(c) % 2;
      const mine = targets[c._pursue] || targets[0];
      const other = targets[1 - c._pursue] || targets[0];
      const toMine = c.vehicle.position.distanceTo(mine.position);
      const toOther = c.vehicle.position.distanceTo(other.position);
      if (toOther < toMine * POLICE.retargetMargin) c._pursue = 1 - c._pursue;
    }
  }

  targetFor(cruiser) {
    const targets = this.targets || [];
    return targets[cruiser._pursue] || targets[0];
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
    // Drop in behind the player, or ahead if nothing is behind. The gap closes
    // as the player speeds up, because a cruiser dropped a fixed distance back
    // while the player is doing 120 m/s is already out of sight and takes half a
    // minute to reel in. It is a share of the distance the player covers in one
    // spawn interval, floored so a parked player still gets police arriving from
    // off-screen rather than materialising on top of them, and capped so they do
    // not land beyond the give-up distance and retire on arrival.
    const lead = Math.min(
      POLICE.giveUpDistance * 0.35,
      Math.max(34, this.playerSpeed * POLICE.spawnTimerSeconds * 0.8),
    );
    const behind = player.position
      .clone()
      .addScaledVector(player.forward, -lead)
      .addScaledVector(player.right, (Math.random() - 0.5) * 26);
    const ahead = player.position.clone().addScaledVector(player.forward, lead + 18);

    // The drop point may not be off the field, and it may not be nearer to the
    // player than a spawn is meant to be. The bounds here were a fixed 180 from
    // the days when the field was 208 across, so on this map they clamped every
    // spawn to a box in the middle of town: a player out on the ring road would
    // have its cruiser dragged up to 190 m away, past the give-up distance, and
    // retired before it was ever seen. Both limits come from the field now.
    const limit = WORLD.halfSize - 12;
    // The drop point is inside the field when its distance from the player is
    // no more than the gap between the player and the nearest edge, so measure
    // that rather than clamping each axis and hoping the result is still near.
    const roomToEdge = Math.min(
      limit - Math.abs(player.position.x),
      limit - Math.abs(player.position.z),
    );
    const behindIsNear = Math.abs(behind.x) < limit && Math.abs(behind.z) < limit
      && player.position.distanceTo(behind) <= Math.max(40, roomToEdge);

    const candidate = behindIsNear ? behind : ahead;
    candidate.x = THREE.MathUtils.clamp(candidate.x, -limit, limit);
    candidate.z = THREE.MathUtils.clamp(candidate.z, -limit, limit);

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

  // Guest side: a cruiser whose position comes from the host's snapshot rather
  // than from the pursuit controller. It is built here so both devices construct
  // cruisers the same way, then the game marks it `remote` and moves it.
  spawnRemoteCruiser(x, z, heading) {
    const cruiser = new PoliceVehicle(this.scene, x, z, heading);
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
