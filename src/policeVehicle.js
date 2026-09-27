import * as THREE from 'three';
import { PHYSICS, POLICE, WORLD } from './config.js';
import { Vehicle } from './vehicle.js';

// Cruisers need the map to route them, because the steering law only knows about
// the player: with nothing but a bearing to follow they drove into buildings and
// ground against the same wall for hundreds of frames while the chase went
// nowhere. Sampling costs are kept to a handful of probes per cruiser per frame.
export class PoliceVehicle {
  constructor(scene, x, z, heading) {
    const spec = {
      key: 'police',
      name: 'Police',
      // From config, so the cruisers keep pace with whatever the garage tops out
      // at. Hardcoding this here is what left them at half the player's speed.
      topSpeed: POLICE.topSpeed,
      accel: POLICE.accel,
      grip: 0.95,
      handbrake: 0.8,
      durability: 1.4,
      body: { length: 5.1, width: 2.05, height: 1.15, ride: 0.52, cabin: 0.52, wheel: 0.42 },
      color: 0xf2f4f7,
      accent: 0x16181c,
    };
    this.vehicle = new Vehicle(spec, { isPlayer: false });
    this.lightBar = this.vehicle.lightBar;

    this.vehicle.reset(x, z, heading);
    this.active = false;
    this.health = 1;
    this.stuckTimer = 0;
    this.vehicle.group.visible = false;
    scene.add(this.vehicle.group);

    this.input = { throttle: 0, steer: 0, handbrake: false };
  }

  startSiren(scene) {
    // The siren is carried by the emissive material rather than a light source;
    // a real point light per cruiser is not worth four extra shadow passes.
    this.sirenOn = true;
  }

  setActive(active, scene) {
    this.active = active;
    this.vehicle.group.visible = active;
    if (active) {
      this.health = 1;
      this.stuckTimer = 0;
    }
  }

  update(dt, player, pursuit) {
    if (!this.active) return;

    const v = this.vehicle;
    const toPlayer = player.position.clone().sub(v.position);
    const distance = toPlayer.length();
    toPlayer.y = 0;

    const forward = v.forward;
    const right = v.right;
    const toPlayerFlat = toPlayer.clone().setY(0).normalize();
    const forwardDot = toPlayerFlat.dot(forward);
    const lateralDot = toPlayerFlat.dot(right);

    // Pursuit steers on the *heading error*, not on which side of the car the
    // player happens to be sitting. Aiming at the player's bearing instead
    // meant the sign flipped as soon as the cruiser drew level: the nose swung
    // past the player, the player crossed over to the other flank, and the
    // controller held full lock away from them for as long as the throttle was
    // down. On a closed loop that was stable, but on the open field the cruiser
    // simply drove off, passed 100 m, and retired without ever being seen.
    //
    // The signed angle between the nose and the player is the quantity that
    // knows the difference between "player is to my right" and "I am pointing
    // away from the player", so it is what the steering is built from. The
    // atan2 is well defined even when the two are collinear, where the cross
    // product of a bearing dot-product test is not.
    const headingError = Math.atan2(
      forward.x * toPlayerFlat.z - forward.z * toPlayerFlat.x,
      forward.x * toPlayerFlat.x + forward.z * toPlayerFlat.z,
    );
    let steer = THREE.MathUtils.clamp(-headingError * POLICE.headingGain, -1, 1);
    let throttle = 1;

    // PIT-style ram when close and roughly lined up. Straight-line gains only:
    // the lerp moves the aim point onto the player's flank so the cruiser
    // arrives at an angle rather than nosing in square, but it stays on the
    // same side of zero as the heading error, so it cannot invert the steering
    // the way the old lateral-dot term did.
    if (distance < POLICE.ramDistance && forwardDot > 0.72) {
      const side = THREE.MathUtils.clamp(lateralDot * 1.6, -0.65, 0.65);
      steer = THREE.MathUtils.clamp(-headingError * POLICE.headingGain + side * 0.25, -1, 1);
      throttle = 1;
    }

    // Sitting behind the player at a speed the player cannot match means the
    // cruiser would sail straight past them into the lead, where the steering
    // has to spend a full turn hauling it back round. Easing off to hold the
    // gap keeps the nose pointed at the player, which is also what the player
    // expects to see in the mirror: police closing, not overtaking.
    if (forwardDot > 0.9 && distance < POLICE.ramDistance * 0.75 && v.speed > player.speed + 12) {
      throttle = THREE.MathUtils.clamp((player.speed + 8) / Math.max(1, v.speed), 0, 1);
    }

    // If the cruiser has ended up ahead of the player, ease off and turn in.
    if (forwardDot < -0.35 && distance < 40) {
      throttle = 0.15;
    }

    // Give up when far away, so the player can actually break a chase.
    if (distance > POLICE.giveUpDistance) {
      throttle = 0;
      steer = 0;
      this.stuckTimer += dt;
      if (this.stuckTimer > 6) this.health = 0;
    } else {
      this.stuckTimer = 0;
    }

    // Unstick: if pinned against something, reverse out.
    if (v.speed < 2 && throttle > 0 && distance > 12) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.4) {
        // Reversing steers the other way to the same heading error, so backing
        // out swings the nose back towards the player.
        throttle = -1;
        steer = THREE.MathUtils.clamp(headingError * POLICE.headingGain, -1, 1);
      }
    } else if (distance <= POLICE.giveUpDistance) {
      this.stuckTimer = Math.max(0, this.stuckTimer - dt);
    }

    // Inside ram range the pursuit is lining up a hit and the fan must not fight
    // the wheel that is taking it; the two radii are a car length apart, so the
    // avoidance hands over before contact without leaving a blind zone.
    if (pursuit && v.speed > POLICE.avoidMinSpeed && distance > POLICE.ramDistance * 0.6) {
      const routed = this.avoidWalls(v, steer, pursuit.world.colliders);
      steer = routed.steer;
      throttle = routed.throttle;
    }

    // A cruiser that is still driving forwards while the player is behind it is
    // chasing a point the steering law already refused to turn towards: dead
    // astern the heading error is a half turn, the clamp saturates, and the car
    // holds full lock in a circle that never brings the nose round. Seen in the
    // live chase as a cruiser at 1.2 m/s with the player 34 m behind its tail.
    // Braking into the half turn the steering wants gives the wheels the slow
    // speed they need to actually make it.
    if (throttle > 0 && distance > 6 && forwardDot < -0.2) throttle = -1;

    this.input.throttle = throttle;
    this.input.steer = steer;
    this.input.handbrake = false;
    v.update(dt, this.input);

    // Blip the light bar and swap which side is lit.
    if (this.lightBar && this.sirenWorking) {
      const phase = pursuit ? pursuit.sirenPhase : performance.now() / 120;
      const swap = Math.sin(phase) > 0;
      this.lightBar.red.material.emissiveIntensity = swap ? 3.4 : 0.4;
      this.lightBar.blue.material.emissiveIntensity = swap ? 0.4 : 3.4;
    }
  }

  // Steer around the things the bearing-to-player law would drive straight into.
  // Probes are laid out as an arc in front of the nose, so a gap on either side
  // of an obstacle reads as a way through: the first probe that blocks and the
  // first one past it that is clear say which flank to take and how hard to turn
  // for it. Only the throttle and the steering are touched, so this sits on top
  // of the pursuit controller rather than replacing it.
  avoidWalls(v, steer, colliders) {
    const SEEK = POLICE.avoidSeekDistance;
    const clear = (angle) => {
      const sine = Math.sin(v.heading + angle);
      const cosine = Math.cos(v.heading + angle);
      return !this.blocked(v, v.position.x + sine * SEEK, v.position.z + cosine * SEEK, colliders);
    };
    const blockedAhead = !clear(0);
    let side = 0;
    if (blockedAhead) {
      // Going round the outside seats the cruiser on the constraining surface and
      // keeps the radius centred on the player, which is the same side the head-on
      // solve below picks. The open-flank test below overrides it where it is wrong.
      side = this.cruisingFree(v, colliders) ? 1 : -1;
      for (const s of [1, -1]) {
        const open = POLICE.avoidProbeAngles.find((a) => a * s > 0 && clear(a * s));
        if (open !== undefined) {
          side = s;
          break;
        }
      }
    }

    const biased = (angle) => (blockedAhead ? angle * side : angle);
    let best = null;
    for (const angle of POLICE.avoidProbeAngles) {
      if (!clear(biased(angle))) continue;
      if (!best || Math.abs(angle) < Math.abs(best)) best = angle;
    }
    // Everything ahead is blocked, so aim at the open flank and hope the shortest
    // way out of it is the way round.
    const chosen = best ?? (blockedAhead ? 1 : -1.5);
    // The fan sees the near face of a building; the push-out radius sets the
    // cruise speed so the car meets it at a speed it can walk off.
    const limit = !clear(0) ? PHYSICS.collisionRestSpeed : PHYSICS.collisionRestSpeed * 2.4;

    let remove = 0;
    if (Math.abs(chosen) > 0.001) {
      const { nx, nz, distance: hit, radius: faceRadius } = this.blockingFace(
        v.position.x + Math.sin(v.heading + chosen) * SEEK,
        v.position.z + Math.cos(v.heading + chosen) * SEEK,
        colliders,
      );
      if (nx !== 0 || nz !== 0) {
        const offset = (faceRadius + 2.5) ** 2 - hit * hit;
        if (offset > 0) {
          const along = Math.sqrt(offset);
          for (const sign of [Math.sign(chosen), -Math.sign(chosen)]) {
            const px = nx * hit + -nz * along * sign;
            const pz = nz * hit + nx * along * sign;
            const dot = px * Math.sin(v.heading) + pz * Math.cos(v.heading);
            if (dot > 0 && Math.hypot(px, pz) > this.clearance(px, pz, colliders) - 0.2) {
              remove = Math.sin(Math.atan2(px, pz) - v.heading) - v.heading;
              break;
            }
          }
        }
      }
    }

    // A turn is a commitment: one taken this frame keeps the car off the straight
    // line it was already failing on, and giving it back around a zero steer makes
    // the cruiser weave without ever getting past the obstacle.
    const turn = Math.abs(chosen) > Math.abs(this.avoidSide ?? 0)
      ? chosen
      : (this.avoidSide ?? 0);
    this.avoidSide = Math.abs(turn) < 0.001 ? 0 : turn;

    // Steer for the probe, not for the heading error: what was blocking the old
    // law is exactly what the heading error wanted to drive through.
    let avoidSteer = -Math.sin(turn) * POLICE.avoidSteerGain;
    if (remove !== 0) avoidSteer += remove * POLICE.avoidSteerGain;
    v.avoidSteer = avoidSteer;
    v.avoidThrottle = v.speed > limit ? -1 : 1;

    // Blend the two rather than switching: the pursuit steer carries straight-line
    // running, the avoidance applies wherever the fan is actually blocked.
    // Fully applied where a probe has been added the wrong side of the car and
    // drifting at exactly zero.
    const blend = turn === 0 ? 0 : POLICE.avoidBlend;
    return { steer: steer * (1 - blend) + avoidSteer * blend, throttle: v.avoidThrottle };
  }

  // How much room a point has before it is inside something.
  clearance(x, z, colliders) {
    let worst = 4;
    for (const c of colliders) {
      let depth = 0;
      if (c.round) {
        depth = c.round.r + 2 - Math.hypot(x - c.round.x, z - c.round.z);
      } else {
        const nearestX = THREE.MathUtils.clamp(x, c.minX, c.maxX);
        const nearestZ = THREE.MathUtils.clamp(z, c.minZ, c.maxZ);
        depth = 2.4 - Math.hypot(x - nearestX, z - nearestZ);
      }
      if (depth > worst) worst = depth;
    }
    return worst;
  }

  // The nearest face this point is inside, and how far in it is. Returns the
  // outward normal, the penetration and the push-out radius the resolver will
  // use on this collider, so the cruiser can be held clear by the same number.
  blockingFace(x, z, colliders) {
    let best = { nx: 0, nz: 0, distance: 0, radius: 0 };
    for (const c of colliders) {
      if (c.round) {
        const radius = c.round.r;
        const distance = Math.hypot(x - c.round.x, z - c.round.z);
        if (distance >= radius + 2) continue;
        const penetration = radius + 2 - distance;
        if (penetration <= best.distance) continue;
        best = {
          nx: distance > 0.001 ? (x - c.round.x) / distance : Math.sin(this.vehicle.heading),
          nz: distance > 0.001 ? (z - c.round.z) / distance : Math.cos(this.vehicle.heading),
          distance: penetration,
          radius,
        };
        continue;
      }
      const nearestX = THREE.MathUtils.clamp(x, c.minX, c.maxX);
      const nearestZ = THREE.MathUtils.clamp(z, c.minZ, c.maxZ);
      const dx = x - nearestX;
      const dz = z - nearestZ;
      const span = dx * dx + dz * dz;
      if (span >= 2.4 * 2.4) continue;
      if (span > 0.000001) {
        const distance = Math.sqrt(span);
        const penetration = 2.4 - distance;
        if (penetration <= best.distance) continue;
        best = { nx: dx / distance, nz: dz / distance, distance: penetration, radius: 0 };
        continue;
      }
      const insideX = Math.min(Math.abs(x - c.minX), Math.abs(x - c.maxX));
      const insideZ = Math.min(Math.abs(z - c.minZ), Math.abs(z - c.maxZ));
      const penetration = insideX < insideZ ? insideX + 2.4 : insideZ + 2.4;
      if (penetration <= best.distance) continue;
      best = {
        nx: insideX < insideZ ? (x < (c.minX + c.maxX) / 2 ? -1 : 1) : 0,
        nz: insideX < insideZ ? 0 : (z < (c.minZ + c.maxZ) / 2 ? -1 : 1),
        distance: penetration,
        radius: 0,
      };
    }
    return best;
  }

  // Is this spot inside anything the fan has to go round?
  blocked(v, x, z, colliders) {
    for (const c of colliders) {
      if (c.height < 1) continue;
      if (c.round) {
        if (Math.hypot(x - c.round.x, z - c.round.z) < c.round.r + 1.5) return true;
        continue;
      }
      if (
        x > c.minX - 1.5 &&
        x < c.maxX + 1.5 &&
        z > c.minZ - 1.5 &&
        z < c.maxZ + 1.5
      ) {
        return true;
      }
    }
    return false;
  }

  // True when the ring road is carrying the cruiser, which decides which side of
  // a building the uncrossing turn goes round.
  cruisingFree(v, colliders) {
    const reach = WORLD.ringRadius;
    const radial = Math.hypot(v.position.x, v.position.z);
    return radial > WORLD.ringRadius - reach * 0.2 && radial < WORLD.ringRadius + reach * 0.2;
  }

  // Called when the player makes contact. Cruisers take visible cosmetic damage
  // and eventually lose the light bar, but keep chasing until health is spent.
  takeHit(force) {
    this.health -= force * 0.03;

    const damage = 1 - THREE.MathUtils.clamp(this.health, 0, 1);
    this.vehicle.bodyGroup.traverse((child) => {
      if (!child.isMesh || !child.userData.baseColor) return;
      child.material.color.copy(child.userData.baseColor).multiplyScalar(1 - damage * 0.35);
    });
    if (this.lightBar && damage > 0.55) {
      this.lightBar.red.material.emissiveIntensity = 0.15;
      this.lightBar.blue.material.emissiveIntensity = 0.15;
      this.lightBar.disabled = true;
    }
  }

  get sirenWorking() {
    return !(this.lightBar && this.lightBar.disabled);
  }
}
