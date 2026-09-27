import * as THREE from 'three';
import { PHYSICS, carFor } from './config.js';
import { buildCarMesh, buildPoliceMesh } from './models.js';
import { groundHeightAt, rampInfoAt } from './terrain.js';

// Arcade vehicle: the body tracks position, heading and velocity by hand so the
// car can leave the ground, land and slide without a full rigid-body solver.
export class Vehicle {
  // `specOrKey` is either a key from CARDS in config, or a finished spec object
  // when the caller (the police cruiser) builds its own handling numbers.
  constructor(specOrKey, { isPlayer = false, colorOverride = null } = {}) {
    this.spec = typeof specOrKey === 'string' ? carFor(specOrKey) : specOrKey;
    this.isPlayer = isPlayer;

    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3();
    this.heading = 0;
    this.angularVelocity = 0;
    this.speedAlongForward = 0;

    this.airborne = false;
    this.bodyPitch = 0;
    this.bodyRoll = 0;
    this.wheelSpin = 0;
    this.climbRate = 0;
    this.wasOnRamp = false;
    this.lastRamp = null;
    this.currentRamp = null;

    this.damage = 0;
    this.impactShake = 0;
    this.slideAmount = 0;

    const visual =
      this.spec.key === 'police'
        ? buildPoliceMesh({ onLivery: this.spec.accent })
        : buildCarMesh(this.spec, { beatUp: isPlayer, colorOverride });
    this.group = visual.group;
    this.bodyGroup = visual.bodyGroup;
    this.wheels = visual.wheels;
    this.lights = visual.lights;
    this.dents = visual.dents;
    this.paintMeshes = visual.paintMeshes || [];
    this.lightBar = visual.lightBar || null;

    this.halfLength = this.spec.body.length / 2;
    this.halfWidth = this.spec.body.width / 2;
  }

  get speed() {
    return this.velocity.length();
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  get right() {
    return new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
  }

  reset(x, z, heading = 0) {
    this.position.set(x, groundHeightAt(x, z), z);
    this.heading = heading;
    this.velocity.set(0, 0, 0);
    this.angularVelocity = 0;
    this.airborne = false;
    this.bodyPitch = 0;
    this.bodyRoll = 0;
    this.climbRate = 0;
    this.wasOnRamp = false;
    this.lastRamp = null;
    this._wallHitCooldown = 0;
    this._edgeHitCooldown = 0;
  }

  applyDamage(amount) {
    if (!this.isPlayer) return;
    this.damage = THREE.MathUtils.clamp(this.damage + amount, 0, 1);
    this.impactShake = Math.min(1, this.impactShake + amount * 6);
  }

  repair() {
    this.damage = 0;
    this.impactShake = 0;
    // Damage is only re-rendered when its level crosses a threshold, so a full
    // repair has to force a refresh or the dents stay on a pristine car.
    this._lastDentLevel = undefined;
    this.applyDents();
  }

  // `input` is { throttle: -1..1, steer: -1..1, handbrake: bool }.
  update(dt, input) {
    const spec = this.spec;
    const forward = this.forward;
    const right = this.right;

    const forwardSpeed = this.velocity.dot(forward);
    const lateralSpeed = this.velocity.dot(right);
    this.speedAlongForward = forwardSpeed;

    let steerInput = THREE.MathUtils.clamp(input.steer, -1, 1);
    if (this.airborne) steerInput *= PHYSICS.airSteerAuthority;

    // Steering authority falls off with speed, otherwise the car becomes
    // uncontrollable at the top end.
    const speedRatio = THREE.MathUtils.clamp(Math.abs(forwardSpeed) / spec.topSpeed, 0, 1);
    const maxSteer = THREE.MathUtils.lerp(PHYSICS.maxSteerLow, PHYSICS.maxSteerHigh, speedRatio);
    // Negated: `right` is (cos h, 0, -sin h), so a positive heading delta
    // swings `forward` toward the car's left. Steering right (+1) therefore
    // needs a negative yaw to actually turn the car right.
    const targetYaw = -steerInput * maxSteer * Math.sign(forwardSpeed || 1);
    this.angularVelocity += (targetYaw - this.angularVelocity) * Math.min(1, PHYSICS.steerSpeed * dt);
    // `angularVelocity` is a yaw rate in rad/s, so turning the car into heading
    // must scale by dt like any other integration step; without it the turn
    // rate at full lock came out well over one full rotation per second,
    // which read as the car spinning on the spot instead of turning.
    // A car barely moving still needs some steering bite to pull away from a
    // stop, so the speed factor only softens the rate rather than zeroing it.
    const turnAuthority = THREE.MathUtils.clamp(0.55 + Math.abs(forwardSpeed) / 10, 0.55, 1);
    if (!this.airborne) {
      this.heading += this.angularVelocity * dt * turnAuthority;
    } else {
      this.heading += this.angularVelocity * dt * 0.6;
    }

    // Damage saps top speed and throttle response, so a wrecked car really is
    // slower and clumsier rather than just uglier.
    const topSpeed = spec.topSpeed * (1 - this.damage * 0.3);
    const power = spec.accel * (1 - this.damage * 0.35);

    // Longitudinal forces, expressed as a target speed so the car's own
    // topSpeed is what actually limits it.
    let accel = 0;
    if (input.throttle > 0) {
      if (forwardSpeed < -0.5) {
        accel = -PHYSICS.brakeForce * power;
      } else {
        // Pull hard through most of the range, then taper over the last
        // stretch. A pure `1 - speed/topSpeed` curve approaches the cap
        // exponentially, so the last slice of speed took many seconds of held
        // throttle and the car never visibly settled at a top speed. Keeping
        // full power until close to the limit and then braking to zero over a
        // narrow band reaches the cap in a bounded time and pins there.
        const ratio = forwardSpeed / topSpeed;
        const taper = THREE.MathUtils.clamp((1 - ratio) / PHYSICS.powerTaper, 0, 1);
        accel = PHYSICS.brakeForce * power * taper;
        // A little extra push off the line keeps launches brisk.
        if (forwardSpeed < PHYSICS.launchSpeed) accel *= 1.5;
      }
    } else if (input.throttle < 0) {
      if (forwardSpeed > 0.5) {
        accel = -PHYSICS.brakeForce * power;
      } else {
        accel = -PHYSICS.reverseForce * power;
      }
    }

    // Coasting and the handbrake both bleed speed off.
    if (input.throttle === 0 && !this.airborne) {
      accel -= Math.sign(forwardSpeed) * 7;
    }
    if (input.handbrake) {
      accel -= Math.sign(forwardSpeed) * 16;
    }

    const gripBase = PHYSICS.grip * spec.grip;
    const grip = input.handbrake ? PHYSICS.driftGrip * spec.handbrake : gripBase;
    const lateralGripFactor = this.airborne ? 0 : Math.min(1, grip * dt);
    const driveFactor = this.airborne ? 0 : 1;

    // Clamp to a top speed that degrades as the car takes damage.
    const newForwardSpeed = THREE.MathUtils.clamp(
      forwardSpeed + accel * dt * driveFactor,
      -topSpeed * 0.5,
      topSpeed,
    );
    const newLateralSpeed = lateralSpeed * (1 - lateralGripFactor);
    this.slideAmount = Math.min(1, Math.abs(lateralSpeed) / 16);

    this.velocity.copy(forward).multiplyScalar(newForwardSpeed).addScaledVector(right, newLateralSpeed);

    this.position.addScaledVector(this.velocity, dt);
    this.applyTerrain(dt);
    this.updateVisuals(dt, steerInput, newLateralSpeed);

    this.impactShake = Math.max(0, this.impactShake - dt * 2.4);
  }

  // Keeps the car glued to the ground except while it is flying off a ramp lip.
  applyTerrain(dt) {
    const info = rampInfoAt(this.position.x, this.position.z);
    const level = info.height;
    this.currentRamp = info.ramp;

    if (this.airborne) {
      this.velocity.y -= PHYSICS.gravity * dt;
      this.position.y += this.velocity.y * dt;
      if (this.position.y <= level) {
        const impact = Math.abs(this.velocity.y);
        this.position.y = level;
        this.velocity.y = 0;
        this.airborne = false;
        // Slamming back down off a big jump hurts.
        if (impact > 8 && this.isPlayer) {
          this.applyDamage(impact * PHYSICS.damagePerImpact * 0.35);
        }
      }
      return;
    }

    const stepUp = level - this.position.y;
    if (stepUp > 0.02) {
      // Climbing a ramp face. Remember that we were on one so the lip below can
      // tell the difference between a launch and driving off a kerb.
      this.position.y = level;
      this.wasOnRamp = true;
      this.climbRate = stepUp / Math.max(dt, 0.0001);
    } else if (stepUp < -0.02 && this.wasOnRamp) {
      // Just cleared the lip. Launch with the vertical rate the slope implied:
      // rise/run x forward speed, capped so jumps stay readable.
      const ramp = this.lastRamp || this.currentRamp;
      const slope = ramp ? ramp.height / ramp.length : 0.4;
      const forwardSpeed = Math.abs(this.speedAlongForward);
      this.airborne = true;
      this.velocity.y = Math.min(slope * forwardSpeed * 1.1, 17);
      this.wasOnRamp = false;
      this.climbRate = 0;
    } else {
      this.position.y = level;
      this.velocity.y = 0;
      this.climbRate = 0;
      // Keep the last ramp around for the frame the car leaves it.
      if (info.ramp) this.lastRamp = info.ramp;
      else this.wasOnRamp = false;
    }
  }

  updateVisuals(dt, steerInput, lateralSpeed) {
    // Body roll leans out of the corner; pitch drives the nose up under power
    // and dives under braking.
    // Roll follows the yaw sign (negated steer), so the body leans the same
    // way the car is actually turning.
    const targetRoll = THREE.MathUtils.clamp(steerInput * this.speedAlongForward * 0.0022, -0.16, 0.16);
    const targetPitch = THREE.MathUtils.clamp(
      (this.airborne ? this.velocity.y * 0.02 : -this.speedAlongForward * 0.0012) + this.impactShake * 0.02,
      -0.2,
      0.2,
    );
    this.bodyRoll += (targetRoll - this.bodyRoll) * Math.min(1, dt * 6);
    this.bodyPitch += (targetPitch - this.bodyPitch) * Math.min(1, dt * 7);

    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;

    this.bodyGroup.rotation.x = this.bodyPitch;
    this.bodyGroup.rotation.z = this.bodyRoll;

    // Wheels: spin with forward travel, steer with the front axle.
    this.wheelSpin += (this.speedAlongForward / this.spec.body.wheel) * dt;
    for (const wheel of this.wheels) {
      wheel.rotation.x = this.wheelSpin;
      // Negated to match the yaw sign, so the front wheels point the way the
      // car actually turns.
      if (wheel.userData.steerable) wheel.rotation.y = -steerInput * 0.42;
    }

    // Skid smoke and brake lights.
    const braking = this.speedAlongForward > 1 && steerInput !== 0 && Math.abs(lateralSpeed) > 6;
    for (const light of this.lights) {
      light.material.emissiveIntensity = braking ? 3.2 : 1.1;
    }
    if (this.isPlayer) this.applyDents();
  }

  // Damage is rendered as progressive denting: panels progressively displace and
  // wrinkle, and the paint dulls toward primer grey.
  applyDents() {
    const d = this.damage;
    if (this._lastDentLevel === undefined) this._lastDentLevel = -1;
    const level = Math.round(d * 20);
    if (level === this._lastDentLevel) return;
    this._lastDentLevel = level;

    // Paint fades toward bare grey as the body takes punishment. The base
    // colours are captured once at build time; recolouring from the live
    // material each frame would compound the fade into black.
    const dull = new THREE.Color(0x6f6f72);
    for (const child of this.paintMeshes) {
      child.material.color.copy(child.userData.baseColor).lerp(dull, d * 0.8);
    }

    for (const dent of this.dents) {
      const seed = dent.userData.seed;
      const amount = d * (0.5 + seed * 0.9);
      dent.position.copy(dent.userData.origin);
      dent.position.x += Math.sin(seed * 37) * amount * 0.16;
      dent.position.y += Math.cos(seed * 53) * amount * 0.09;
      dent.position.z += Math.sin(seed * 71) * amount * 0.16;
      dent.rotation.z = dent.userData.baseRotZ + Math.sin(seed * 91) * amount * 0.5;
      dent.rotation.x = dent.userData.baseRotX + Math.cos(seed * 17) * amount * 0.35;
      const shrink = 1 - amount * 0.35;
      dent.scale.set(shrink, shrink * (1 - amount * 0.2), shrink);
      dent.visible = d > 0.02;
    }
  }
}
