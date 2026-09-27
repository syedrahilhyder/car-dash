// Central tuning values. Everything the game balances lives here so the feel can
// be adjusted without hunting through modules.

export const WORLD = {
  // The drivable field is a square centred on the origin.
  halfSize: 208,
  wallHeight: 4,
  roadHalfWidth: 9,
  // Loop radius of the ring road that circles the town.
  ringRadius: 120,
};

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
  // instead of pinning the player to a wall.
  giveUpDistance: 190,
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
    topSpeed: 62,
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
    blurb: 'Low, fast and loose at the rear. Rewards throttle control.',
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
