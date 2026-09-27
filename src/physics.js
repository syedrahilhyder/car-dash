import * as THREE from 'three';
import { PHYSICS, WORLD } from './config.js';
import { BEACH, isWater } from './terrain.js';

// Resolves car-vs-world and car-vs-car overlap. The cars are treated as oriented
// boxes swept against axis-aligned world colliders, which is enough for an
// arcade game and keeps the response stable at speed.
export function resolveWorldCollisions(vehicle, colliders, onImpact) {
  const hw = vehicle.halfWidth;
  const hl = vehicle.halfLength;

  // Approximate the car as a circle for broad phase, then refine.
  const radius = Math.hypot(hw, hl) * 0.72;
  let slowestHit = null;

  for (const c of colliders) {
    const nearestX = THREE.MathUtils.clamp(vehicle.position.x, c.minX, c.maxX);
    const nearestZ = THREE.MathUtils.clamp(vehicle.position.z, c.minZ, c.maxZ);
    const dx = vehicle.position.x - nearestX;
    const dz = vehicle.position.z - nearestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq > radius * radius) continue;

    // Push the car out along the shortest axis of the collider.
    const overlapX = Math.min(
      Math.abs(vehicle.position.x - c.minX),
      Math.abs(vehicle.position.x - c.maxX),
    );
    const overlapZ = Math.min(
      Math.abs(vehicle.position.z - c.minZ),
      Math.abs(vehicle.position.z - c.maxZ),
    );

    let nx = 0;
    let nz = 0;
    if (overlapX < overlapZ) {
      nx = vehicle.position.x < (c.minX + c.maxX) / 2 ? -1 : 1;
      vehicle.position.x = nx < 0 ? c.minX - radius : c.maxX + radius;
    } else {
      nz = vehicle.position.z < (c.minZ + c.maxZ) / 2 ? -1 : 1;
      vehicle.position.z = nz < 0 ? c.minZ - radius : c.maxZ + radius;
    }

    const normal = new THREE.Vector3(nx, 0, nz);
    // `vn` is the speed still going into the surface, taken before the response.
    // It is both what the bounce is measured from and what the shove below
    // needs, so it is read once here.
    const vn = vehicle.velocity.dot(normal);
    const impactSpeed = Math.abs(vn);
    // Kill the velocity going into the wall rather than reflecting it, so a
    // head-on stop does not fling the car back off the kerb. Only this closing
    // component is removed; whatever speed the car had along the wall, and so
    // any scrape, is left alone.
    if (vn < 0) vehicle.velocity.addScaledVector(normal, -vn);
    vehicle.velocity.multiplyScalar(0.86 - PHYSICS.bounceRestitution);
    // Scraping a wall must not lift the car off the ground.
    vehicle.airborne = false;
    vehicle.velocity.y = Math.min(vehicle.velocity.y, 0);
    // The hit rocks the body back off the wall. Recoil is for a car that
    // arrives at the surface, not one already resting on it: once the car is
    // stopped against the wall this closing speed is gone, so the body settles
    // even while the throttle is still held down. Scraping along a wall barely
    // registers at all, since almost none of the speed is going into it.
    vehicle.addBounce(normal, impactSpeed);

    if (impactSpeed > 4) {
      if (c.movable) {
        c.hp = (c.hp ?? 1) - impactSpeed * 0.14;
        if (c.hp <= 0) c.destroyed = true;
        // A solid car that is shoved has to travel along the line of the hit.
        // Setting the mesh to wherever the collider already is throws the
        // push-out away and leaves the car exactly as it was, so the bodywork
        // never moves and the car reads as welded to the road. Shifting the
        // collider and the mesh by the overlap, in the direction the player was
        // travelling, is what makes a parked car look shunted.
        if (c.mesh && c.centre) {
          const alongX = nx !== 0;
          // A head-on hit has no lateral component, so the sign above is zero
          // and the car would be shoved straight down the axis the player is
          // pushing into. Fall back to the way the player is travelling, which
          // is the direction the shunt should follow.
          const dir = alongX
            ? (nx !== 0 ? -nx : Math.sign(vehicle.velocity.x))
            : (nz !== 0 ? -nz : Math.sign(vehicle.velocity.z));
          // A shunt is displacement, not a spin: cap it so a glancing blow
          // nudges the car instead of snapping it round a right angle.
          const SHUNT_MAX = 0.8;
          const shift = Math.min((alongX ? overlapX : overlapZ) * 0.9, SHUNT_MAX);
          const dirX = alongX ? dir : 0;
          const dirZ = alongX ? 0 : dir;
          c.minX += dirX * shift; c.maxX += dirX * shift;
          c.minZ += dirZ * shift; c.maxZ += dirZ * shift;
          c.centre.x += dirX * shift;
          c.centre.z += dirZ * shift;
          c.mesh.position.set(c.centre.x, c.mesh.position.y, c.centre.z);
          // Keep the nose facing the way it was shoved rather than snapping to
          // an axis, so the car visibly swings round.
          c.mesh.rotation.y = Math.atan2(dirX, dirZ) * 0.15 + c.mesh.rotation.y * 0.85;
        }
      }
      if (!slowestHit || impactSpeed > slowestHit.speed) {
        slowestHit = { speed: impactSpeed, collider: c };
      }
    }
  }

  // Only a genuine impact costs damage. Holding the throttle into a wall keeps
  // pushing the car against it at a steady speed every frame, which would
  // otherwise re-trigger "impact" damage forever; a short cooldown lets the
  // first hit register and then holds off until the car has backed away.
  vehicle._wallHitCooldown = Math.max(0, (vehicle._wallHitCooldown ?? 0) - 1);
  if (
    slowestHit &&
    slowestHit.speed > PHYSICS.crashSpeedThreshold &&
    slowestHit.speed > PHYSICS.collisionRestSpeed &&
    vehicle._wallHitCooldown === 0
  ) {
    const damage = (slowestHit.speed * PHYSICS.damagePerImpact) / Math.max(0.4, vehicle.spec.durability);
    onImpact?.(damage, slowestHit.speed);
    vehicle._wallHitCooldown = 45;
  }
}

// Car to car. The heavier vehicle wins the exchange; both take damage, the
// lighter one more so.
export function resolveCarCollision(a, b, onImpact) {
  const delta = b.position.clone().sub(a.position);
  delta.y = 0;
  const distance = delta.length();
  const minDistance = a.halfLength + b.halfLength + 1.2;
  if (distance > minDistance || distance < 0.0001) return false;

  const normal = delta.normalize();
  const overlap = minDistance - distance;
  const massA = a.spec.durability;
  const massB = b.spec.durability;
  const total = massA + massB;

  a.position.addScaledVector(normal, -overlap * (massB / total));
  b.position.addScaledVector(normal, overlap * (massA / total));

  const relative = a.velocity.clone().sub(b.velocity);
  const alongNormal = relative.dot(normal);
  if (alongNormal <= 0) return false;

  const restitution = PHYSICS.bounceRestitution + 0.05;
  const impulse = alongNormal * (1 + restitution) / (1 / massA + 1 / massB);
  a.velocity.addScaledVector(normal, -impulse / massA);
  b.velocity.addScaledVector(normal, impulse / massB);

  // Both cars rock back off the contact, the same as they do off a wall.
  if (alongNormal > PHYSICS.bounceMinSpeed) {
    a.addBounce(normal, alongNormal);
    b.addBounce(normal, alongNormal);
  }

  const force = Math.abs(alongNormal);
  if (force > PHYSICS.crashSpeedThreshold) {
    onImpact?.(force, a, b);
  }
  return true;
}

// The sea is a hard wall dressed as water; the car bogs down rather than
// driving out to sea.
export function resolveWaterAndBounds(vehicle, onImpact) {
  const limit = WORLD.halfSize - 3;
  let clamped = false;
  for (const axis of ['x', 'z']) {
    if (vehicle.position[axis] > limit) {
      vehicle.position[axis] = limit;
      clamped = true;
    } else if (vehicle.position[axis] < -limit) {
      vehicle.position[axis] = -limit;
      clamped = true;
    }
  }
  // A cooldown, not a per-frame latch: right at the edge the car can toggle
  // in and out of contact from one frame to the next as the clamp nudges it
  // back and the throttle pushes it forward again, which would otherwise let
  // an "only on the first frame" check keep re-arming and firing every frame.
  vehicle._edgeHitCooldown = Math.max(0, (vehicle._edgeHitCooldown ?? 0) - 1);

  if (clamped) {
    const intoEdge = vehicle.speed;
    vehicle.velocity.multiplyScalar(0.25);
    if (intoEdge > PHYSICS.bounceMinSpeed) {
      // The field edge is a wall like any other, so it bounces like one. Push
      // the body away from whichever boundary was hit.
      const axis = Math.abs(vehicle.position.x) >= limit - 0.01 ? 'x' : 'z';
      const sign = vehicle.position[axis] > 0 ? -1 : 1;
      vehicle.addBounce(new THREE.Vector3(axis === 'x' ? sign : 0, 0, axis === 'z' ? sign : 0), intoEdge);
    }
    if (vehicle._edgeHitCooldown === 0) {
      onImpact?.(0.02, intoEdge);
      vehicle._edgeHitCooldown = 45;
    }
    return true;
  }

  if (isWater(vehicle.position.x, vehicle.position.z)) {
    // The sea is the barrier, not the foam line. Resolving it as a wall here
    // rather than teleporting the car back a fixed distance every frame keeps
    // the car from juddering across the threshold, while still letting it
    // drive freely over the decorative surf line further down the beach.
    vehicle.position.z = BEACH.waterStart;
    if (vehicle.velocity.z > 0) vehicle.velocity.z = 0;
    vehicle.velocity.multiplyScalar(0.9);
    if (vehicle._edgeHitCooldown === 0) {
      onImpact?.(0.004, 2);
      vehicle._edgeHitCooldown = 45;
    }
    return true;
  }
  return false;
}
