import * as THREE from 'three';
import { POLICE } from './config.js';
import { Vehicle } from './vehicle.js';

// A police cruiser is a Vehicle driven by a pursuit steering model plus a
// siren light rig, and it can be knocked out of service by heavy contact.
export class PoliceVehicle {
  constructor(scene, x, z, heading) {
    const spec = {
      key: 'police',
      name: 'Police',
      topSpeed: 58,
      accel: 1.05,
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
    const forwardDot = toPlayer.clone().normalize().dot(forward);
    const lateralDot = toPlayer.clone().normalize().dot(right);

    // Base pursuit: point at the player.
    let steer = THREE.MathUtils.clamp(lateralDot * 2.4, -1, 1);
    let throttle = 1;

    // PIT-style ram when close and roughly lined up.
    if (distance < POLICE.ramDistance && forwardDot > 0.72) {
      steer = THREE.MathUtils.clamp(lateralDot * 3.2, -1, 1);
      throttle = 1;
    }

    // If the cruiser has ended up ahead of the player, ease off and turn in.
    if (forwardDot < -0.35 && distance < 40) {
      throttle = 0.15;
      steer = THREE.MathUtils.clamp(-lateralDot * 2, -1, 1);
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
        throttle = -1;
        steer = lateralDot > 0 ? -1 : 1;
      }
    } else if (distance <= POLICE.giveUpDistance) {
      this.stuckTimer = Math.max(0, this.stuckTimer - dt);
    }

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
