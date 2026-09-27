import * as THREE from 'three';
import { WORLD, RAMP_LAUNCH } from './config.js';

// Ramps are the only thing that raise the ground, so terrain height is a pure
// function of position: the physics can ask for it at any point without a
// collision start-up cost.  Each ramp is an axis-aligned wedge.
export const ramps = [];
const scratch = { height: 0, onRamp: false, ramp: null };

export function registerRamp(ramp) {
  ramps.push(ramp);
  return ramp;
}

// `rotation` is the yaw of the ramp, pointing up the slope.
export function addRamp({ x, z, length = 16, width = 11, rotation = 0, height = RAMP_LAUNCH * 0.42 }) {
  return registerRamp({ x, z, length, width, rotation, height });
}

export function groundHeightAt(x, z) {
  let best = 0;
  let onRamp = false;
  let ramp = null;

  for (const r of ramps) {
    const dx = x - r.x;
    const dz = z - r.z;
    const cos = Math.cos(-r.rotation);
    const sin = Math.sin(-r.rotation);
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;

    const halfW = r.width / 2;
    const halfL = r.length / 2;
    if (localX < -halfW || localX > halfW || localZ < -halfL || localZ > halfL) continue;

    // Wedge: flat at the entry lip, full height at the launch lip.
    const t = (localZ + halfL) / r.length;
    const h = t * r.height;
    if (h > best) {
      best = h;
      onRamp = true;
      ramp = r;
    }
  }

  scratch.height = best;
  scratch.onRamp = onRamp;
  scratch.ramp = ramp;
  return best;
}

export function rampInfoAt(x, z) {
  groundHeightAt(x, z);
  return { height: scratch.height, onRamp: scratch.onRamp, ramp: scratch.ramp };
}

// The beach is a sandy strip along the +Z edge. `zStart` is where the sand
// begins, `surfZ` is the white foam line the car can drive straight over, and
// `waterStart` is where the open sea begins and the car is turned back.
export const BEACH = {
  zStart: WORLD.halfSize * 0.42,
  zEnd: WORLD.halfSize,
  surfZ: WORLD.halfSize * 0.78,
  waterStart: WORLD.halfSize * 0.88,
};

export function isBeach(x, z) {
  return z > BEACH.zStart && Math.abs(x) < WORLD.halfSize;
}

export function isWater(x, z) {
  return z > BEACH.waterStart && isBeach(x, z);
}
