// Central tuning values. Everything the game balances lives here so the feel can
// be adjusted without hunting through modules.

export const WORLD = {
  // The drivable field is a square centred on the origin. This is the one
  // value that sets the size of the world: the ring road, the town's building
  // band, the beach and the perimeter all derive from it, and the town's
  // populations scale with the area, so the place stays as busy as it was at
  // 208 rather than becoming a big empty field.
  halfSize: 624,
  wallHeight: 4,
  roadHalfWidth: 9,
  // Loop radius of the ring road that circles the town. Kept at the same
  // fraction of the field so the ring, the spurs and the POI offsets that were
  // placed against it keep their relationships.
  ringRadius: 360,
};

// How far outside the ring road the town's buildings may sit, and how much of
// it there is. The counts are for the reference field size below.
export const TOWN = {
  // The town fills a disc rather than a ribbon beside the ring road. Both
  // radii are fractions of the ring: the inner one leaves the very middle of
  // the map open, so there is a plaza to drive around rather than a solid
  // block of buildings, and the outer one runs past the ring up to where the
  // beach starts.
  // The disc is deliberately smaller than the field's proportions would suggest,
  // so there is open ground to drive across between the town and the boundary.
  // Filling 90% of the width with buildings read as cramped.
  innerRadius: WORLD.ringRadius * 0.32,
  outerRadius: WORLD.halfSize * 0.74,
  // Nothing is built within this distance of the ring road's centreline. It is
  // wider than the road itself so buildings sit back from the kerb and the
  // street keeps a verge, and it is what leaves the middle of town open.
  ringKeepOut: 30,
  // Buildings per reference field, scaled by area. The reference value is
  // lower than the field size alone would suggest: the map is meant to feel
  // open, so the town is thinner than an exact area match to the old 208 field.
  buildingsPerReference: 24,
  blockers: 30,
  posters: 42,
};

// The field size the town's populations were tuned against. `areaScale` lets a
// module that fills an area keep the same density when the world grows, so a
// bigger map is a bigger town rather than the same town with more grass.
export const REFERENCE_HALF_SIZE = 208;

export function areaScale() {
  return (WORLD.halfSize / REFERENCE_HALF_SIZE) ** 2;
}

export const PHYSICS = {
  gravity: 38,
  brakeForce: 34,
  reverseForce: 12,
  // Max yaw rate in rad/s at low speed vs. near top speed.
  maxSteerLow: 2.6,
  maxSteerHigh: 0.9,
  steerSpeed: 3.4,
  // Lateral grip. Lower means the car slides more in corners.
  grip: 6.2,
  driftGrip: 1.9,
  // Longitudinal shape. Speed is capped at the car's own topSpeed, so the
  // power curve only decides how quickly that cap is reached.
  // Below this speed the throttle bites fully, so cars pull away cleanly.
  launchSpeed: 4,
  // Brake doubles as reverse. The hand-over has to look for the speed the
  // clamp can actually reach, which is this, and the car has to sit still for
  // the delay first, so a stop short of a wall does not roll into a reverse
  // sprint the moment the driver holds the brake. See Vehicle.update.
  reverseHandoffSpeed: 2.5,
  reverseHandoffDelay: 0.25,
  // Fraction of the top speed over which full power tapers to zero. Keeping
  // this small holds power through the whole range so the cap is a firm,
  // reachable ceiling rather than an asymptotic crawl.
  powerTaper: 0.18,
  // Above this vertical speed the car is treated as airborne and steering
  // authority collapses, which is what makes ramp jumps feel committed.
  airSteerAuthority: 0.18,
  // Scrapes below this speed are free; only real impacts cost damage.
  crashSpeedThreshold: 8,
  // Tuned so a full-speed head-on is roughly 20% damage and a hard scrape is a
  // couple of percent. A car should survive several mistakes, not one.
  damagePerImpact: 0.011,
  // Below this speed the car is deemed parked and pushing hard into scenery is
  // ignored: without it, resting against a wall grinds the car to scrap.
  collisionRestSpeed: 4,
};

export const POLICE = {
  // Release distance: beyond this the cruiser backs off, so chases stay alive
  // instead of pinning the player to a wall. It is a fraction of the field
  // rather than a fixed number of metres: a chase that ends because you are
  // 190 m away is a long lead in a 208-unit field and barely a gap in a 624
  // one, and cruisers would retire out of sight the moment the player was
  // running quickly. Roughly 0.91 of halfSize, as it was at 208.
  giveUpDistance: WORLD.halfSize * 0.91,
  ramDistance: 96,
  spawnTimerSeconds: 1.6,
  // Heat per second is damped by this; it sets how long a chase takes to build.
  heatDecayPerSecond: 1.1,
};

export const RAMP_LAUNCH = 15.5;

export function carFor(key) {
  return CARS.find((c) => c.key === key) || CARS[0];
}

// Handling numbers are arcade rather than simulated. The three cars are meant to
// read as: all-rounder, heavy luxobarge, and twitchy track weapon.
export const CARS = [
  {
    key: 'bmw',
    name: 'BMW M4',
    blurb: 'Balanced all-rounder. Quick to change direction.',
    // The all-rounder sits between the Rolls and the Porsche. It used to be
    // the slowest thing on the road, which made the car most players pick the
    // one that felt worst to drive.
    topSpeed: 74,
    accel: 1.0,
    grip: 1.0,
    handbrake: 0.85,
    durability: 1.0,
    body: { length: 4.7, width: 2.0, height: 0.86, ride: 0.42, cabin: 0.34, wheel: 0.36 },
    color: 0x2f6fd0,
    accent: 0x121821,
  },
  {
    key: 'rolls',
    name: 'Rolls-Royce',
    blurb: 'Heavy and planted. Shrugs off police contact.',
    topSpeed: 56,
    accel: 0.78,
    grip: 0.82,
    handbrake: 0.7,
    durability: 1.9,
    body: { length: 5.9, width: 2.15, height: 1.02, ride: 0.48, cabin: 0.46, wheel: 0.4 },
    color: 0x1b1b1e,
    accent: 0xb9953f,
  },
  {
    key: 'porsche',
    name: 'Porsche 911',
    blurb: 'Loose at the rear and delicate. Rewards throttle control.',
    topSpeed: 68,
    accel: 1.14,
    grip: 0.9,
    handbrake: 1.0,
    durability: 0.75,
    body: { length: 4.5, width: 2.02, height: 0.72, ride: 0.34, cabin: 0.3, wheel: 0.37 },
    color: 0xe8b23a,
    accent: 0x17181c,
  },
];

export const POI = [
  {
    id: 'garage',
    label: 'Garage',
    hint: 'Drive in to repair',
    position: { x: -38, z: -96 },
    rotation: Math.PI,
    radius: 13,
    color: 0x3b4552,
    accent: 0xe0563f,
  },
  {
    id: 'hospital',
    label: 'Hospital',
    hint: 'Emergency bay',
    // Placed well inside the ring so the building does not sit on the roadway.
    position: { x: 66, z: -66 },
    rotation: Math.PI,
    radius: 15,
    color: 0xf3f5f8,
    accent: 0xd8323f,
  },
  {
    id: 'gas',
    label: 'Gas Station',
    hint: 'Refuel stop',
    position: { x: 84, z: 24 },
    rotation: -Math.PI / 2,
    radius: 11,
    color: 0xe9edf2,
    accent: 0x2f8f5b,
  },
];
