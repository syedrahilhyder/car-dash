import * as THREE from 'three';
import { WORLD, TOWN, POI, RAMP_LAUNCH, areaScale } from './config.js';
import { addRamp, BEACH, ramps } from './terrain.js';
import { buildCarMesh } from './models.js';
import { makePosterTexture } from './poster.js';

// A wanted poster pasted flat on a building face, offset a hair off the wall
// so it does not z-fight with the surface it sits on.
function addWallPoster(props, texture, { x, y, z, rotation = 0, scale = 1 }) {
  // A little over a person's height: big enough to read from a passing car,
  // small enough to look pasted on rather than painted across the wall.
  const w = 1.7 * scale;
  const h = 2.1 * scale;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 }),
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotation;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  props.add(mesh);
  return mesh;
}

const S = WORLD.halfSize;

// True when a box at (x, z) with the given footprint would overlap any road.
// Roads are the ring plus the two straight spurs; nothing may be placed on one,
// because a building on the roadway walls the player in without warning.
function overlapsRoad(x, z, halfW, halfD) {
  const clearance = WORLD.roadHalfWidth + 3;
  const ring = WORLD.ringRadius;

  // Ring road. A box does not sit at one distance from the origin, it spans a
  // range of them, so the road overlaps the footprint exactly when that range
  // meets the road's own band. Testing a single "nearest distance" against the
  // annulus is what let buildings stand on the tarmac: a road clipping a corner
  // of a footprint can pass well clear of the footprint's nearest point to the
  // origin, and the centre-based test the code used before that was wrong in
  // the same way for the opposite reason.
  const nearestX = Math.max(Math.abs(x) - halfW, 0);
  const nearestZ = Math.max(Math.abs(z) - halfD, 0);
  const nearest = Math.hypot(nearestX, nearestZ);
  const farthest = Math.hypot(Math.abs(x) + halfW, Math.abs(z) + halfD);
  const inner = ring - clearance;
  const outer = ring + clearance;
  if (farthest >= inner && nearest <= outer) return true;

  // Southern spur: |x| < roadHalfWidth down to the south edge.
  if (Math.abs(x) - halfW < clearance && z - halfD < -ring) return true;
  // Eastern spur: |z| < roadHalfWidth out to the east edge. It runs from the
  // origin, past the ring, to the boundary, so the x bounds are those two ends
  // and not the ring radius the old test compared against.
  if (Math.abs(z) - halfD < clearance && x - halfW < S && x + halfW > 0) return true;

  // The verge. Buildings sit back from the ring road rather than at the kerb,
  // which is the same interval test widened into a corridor either side of the
  // centreline. The check that used to live here compared the distance to the
  // building against the radius of the ring, which rejected everything near the
  // origin: the middle of the map is the furthest point from the ring, and it
  // read as the closest.
  const middleKeepOut = TOWN.ringKeepOut;
  if (farthest >= ring - middleKeepOut && nearest <= ring + middleKeepOut) return true;

  return false;
}

// Builds the whole static scene and returns the colliders the physics needs.
export function buildWorld(scene) {
  scene.background = new THREE.Color(0x8fc4e8);
  // Fog distances are a fraction of the field, not a fixed number of metres.
  // At a fixed 190/520 a field three times the size would fade out most of the
  // town and the ring road would sit inside the fog bank.
  scene.fog = new THREE.Fog(0x9fcbe9, S * 0.91, S * 2.5);

  const colliders = [];
  const props = new THREE.Group();
  scene.add(props);

  addLights(scene);
  addGround(scene, props);
  addRingRoad(props);
  addBeach(scene, props);
  addPerimeter(colliders, props);
  addRamps(colliders, props);
  addTown(props, colliders);
  addPoiBuildings(props, colliders);
  addParkedCars(props, colliders);

  return { colliders, props };
}

function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x6a6055, 1.35));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.1);
  sun.position.set(S * 0.58, S * 0.87, S * 0.43);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // The shadow frustum has to reach the far side of the field, so it follows
  // the field size. The 4096 map comes with it: the same shadow map stretched
  // over a much larger area is what the bare `bias` below is compensating for,
  // and the speckle would come straight back without the extra resolution.
  const reach = S * 1.06;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.left = -reach;
  sun.shadow.camera.right = reach;
  sun.shadow.camera.top = reach;
  sun.shadow.camera.bottom = -reach;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = S * 3.5;
  // A shadow map this coarse over a 440-unit frustum leaves each texel
  // covering real ground area, which reads as flickering speckle on flat
  // surfaces as the camera moves; bias pushes the shadow test off the
  // surface so it stops fighting with itself frame to frame.
  sun.shadow.bias = -0.0015;
  sun.shadow.normalBias = 0.4;
  scene.add(sun);
}

function addGround(scene, props) {
  // One vertex per 8 units of field. A two-triangle plane this large puts a
  // single interpolation across the whole town, which reads badly once it is
  // this size; the grid gives the light something to vary over without adding
  // meaningful cost at these counts.
  const grid = Math.max(1, Math.round((S * 2) / 8));
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(S * 2, S * 2, grid, grid),
    new THREE.MeshStandardMaterial({ color: 0x5f8f4e, roughness: 1 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  props.add(grass);

  // A sea plane beyond the beach, purely visual — the waterline blocks driving.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(S * 3, S * 0.7, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x2f8ec4, roughness: 0.22, metalness: 0.35 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.02, S * 0.85 + S * 0.34);
  props.add(sea);
}

function addRingRoad(props) {
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.95 });
  const paintMat = new THREE.MeshStandardMaterial({ color: 0xf0e9c8, emissive: 0x2a2718, roughness: 1 });

  // Ring road drawn as a ring so the middle of town stays open.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(WORLD.ringRadius - WORLD.roadHalfWidth, WORLD.ringRadius + WORLD.roadHalfWidth, 96),
    roadMat,
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.receiveShadow = true;
  props.add(ring);

  // Dashed centre line around the ring.
  const dashGeo = new THREE.BoxGeometry(1.1, 0.02, 4.4);
  const count = 120;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const dash = new THREE.Mesh(dashGeo, paintMat);
    dash.position.set(Math.cos(a) * WORLD.ringRadius, 0.05, Math.sin(a) * WORLD.ringRadius);
    dash.rotation.y = -a;
    props.add(dash);
  }

  // Two straight spurs cutting through town to the POIs.
  addStraightRoad(props, roadMat, paintMat, 0, -WORLD.ringRadius, 0, -S * 0.5, 1);
  addStraightRoad(props, roadMat, paintMat, WORLD.ringRadius, 0, S * 0.55, 0, 0);
}

function addStraightRoad(props, roadMat, paintMat, x1, z1, x2, z2, axis) {
  const length = axis === 1 ? Math.abs(z2 - z1) : Math.abs(x2 - x1);
  const cx = (x1 + x2) / 2;
  const cz = (z1 + z2) / 2;
  const road = new THREE.Mesh(new THREE.BoxGeometry(WORLD.roadHalfWidth * 2, 0.06, length), roadMat);
  if (axis === 0) road.rotation.y = Math.PI / 2;
  road.position.set(cx, 0.03, cz);
  road.receiveShadow = true;
  props.add(road);

  const dashes = Math.floor(length / 7);
  for (let i = 0; i < dashes; i++) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 4.4), paintMat);
    if (axis === 1) {
      dash.position.set(cx, 0.06, Math.min(z1, z2) + 3 + i * 7);
    } else {
      dash.rotation.y = Math.PI / 2;
      dash.position.set(Math.min(x1, x2) + 3 + i * 7, 0.06, cz);
    }
    props.add(dash);
  }
}

function addBeach(scene, props) {
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(S * 2, BEACH.zEnd - BEACH.zStart, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xdcc38a, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.04, (BEACH.zStart + BEACH.zEnd) / 2);
  sand.receiveShadow = true;
  props.add(sand);

  // Foam line the car can drive straight over; purely decorative, so it sits
  // below the wheels rather than blocking them.
  const surf = new THREE.Mesh(
    new THREE.PlaneGeometry(S * 2, 5, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xf2f7fa, roughness: 0.6, transparent: true, opacity: 0.75 }),
  );
  surf.rotation.x = -Math.PI / 2;
  surf.position.set(0, 0.06, BEACH.surfZ);
  props.add(surf);

  // Open sea beyond the foam, so the shoreline reads as water rather than an
  // invisible wall.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(S * 2, BEACH.zEnd - BEACH.waterStart + 40, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x2f7fb5, roughness: 0.35, transparent: true, opacity: 0.9 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.03, (BEACH.waterStart + BEACH.zEnd + 40) / 2);
  props.add(sea);

  // Palm trees along the sand, kept south of the foam line.
  const palmSeed = mulberry(20240927);
  for (let i = 0; i < 22; i++) {
    const x = -S * 0.9 + palmSeed() * S * 1.8;
    const z = BEACH.zStart + 6 + palmSeed() * (BEACH.surfZ - BEACH.zStart - 14);
    props.add(makePalm(x, z, 0.85 + palmSeed() * 0.5));
  }

  // A couple of beach ramps so the sand is not a dead end.
  addRamp({ x: -58, z: BEACH.zStart + 22, rotation: Math.PI, length: 18, width: 12, height: RAMP_LAUNCH * 0.36 });
  addRamp({ x: 66, z: BEACH.zStart + 30, rotation: Math.PI * 0.5, length: 18, width: 12, height: RAMP_LAUNCH * 0.36 });
}

function makePalm(x, z, scale) {
  const palm = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f8b46, roughness: 0.9 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 7, 8), trunkMat);
  trunk.position.y = 3.5;
  trunk.castShadow = true;
  palm.add(trunk);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 1.0), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.5, 6.9, Math.sin(a) * 1.5);
    leaf.rotation.y = -a;
    leaf.rotation.z = 0.28;
    leaf.castShadow = true;
    palm.add(leaf);
  }
  palm.position.set(x, 0, z);
  palm.scale.setScalar(scale);
  return palm;
}

function addPerimeter(colliders, props) {
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x8e949c, roughness: 0.9 });
  const barrierMat = new THREE.MeshStandardMaterial({ color: 0xd8523f, roughness: 0.8 });
  const t = 3;
  const h = WORLD.wallHeight;

  const sides = [
    { x: 0, z: -S, w: S * 2 + t, d: t },
    { x: 0, z: S, w: S * 2 + t, d: t },
    { x: -S, z: 0, w: t, d: S * 2 + t },
    { x: S, z: 0, w: t, d: S * 2 + t },
  ];
  for (const s of sides) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(s.w, h, s.d), wallMat);
    wall.position.set(s.x, h / 2, s.z);
    wall.receiveShadow = true;
    props.add(wall);
    colliders.push({ minX: s.x - s.w / 2, maxX: s.x + s.w / 2, minZ: s.z - s.d / 2, maxZ: s.z + s.d / 2, height: h });
  }

  // Painted stripes so the boundary reads as a racetrack barrier, not a box.
  for (let i = -S + 6; i < S; i += 12) {
    for (const z of [-S, S]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(6, 1.4, 0.2), barrierMat);
      stripe.position.set(i, 1.6, z + (z < 0 ? 1.55 : -1.55));
      props.add(stripe);
    }
    for (const x of [-S, S]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 6), barrierMat);
      stripe.position.set(x + (x < 0 ? 1.55 : -1.55), 1.6, i);
      props.add(stripe);
    }
  }
}

function addRamps(colliders, props) {
  const rampMat = new THREE.MeshStandardMaterial({ color: 0x6f7780, roughness: 0.85 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0x3a2e0d, roughness: 0.8 });

  // Positions track the ring road, so the ramps keep the same relationship to
  // the track as the field grows. Their sizes stay absolute: a ramp is a ramp.
  const layout = [
    { x: 0, z: WORLD.ringRadius * -0.38, rotation: 0, length: 20, width: 12 },
    { x: WORLD.ringRadius * -0.62, z: WORLD.ringRadius * 0.65, rotation: Math.PI * 0.5, length: 20, width: 12 },
    { x: WORLD.ringRadius * 0.7, z: WORLD.ringRadius * -0.48, rotation: Math.PI * 1.5, length: 20, width: 12 },
    { x: WORLD.ringRadius * -0.98, z: WORLD.ringRadius * 0.03, rotation: Math.PI, length: 18, width: 11 },
    { x: WORLD.ringRadius * 1.25, z: WORLD.ringRadius * 0.8, rotation: Math.PI * 0.25, length: 18, width: 11 },
  ];

  for (const cfg of layout) {
    const ramp = addRamp({ ...cfg, height: RAMP_LAUNCH * 0.42 });

    // Visual wedge: a rotated, tapered box whose top surface matches the
    // heightfield exactly at both lips.
    const geo = new THREE.BufferGeometry();
    const hw = ramp.width / 2;
    const hl = ramp.length / 2;
    const L = ramp.height;
    const verts = new Float32Array([
      // entry face + sides + deck as a closed wedge
      -hw, 0, -hl, hw, 0, -hl, hw, 0, hl, -hw, 0, hl, // base
      -hw, 0, hl, hw, 0, hl, hw, L, hl, -hw, L, hl, // launch lip (degenerate height)
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    const wedgeGeo = new THREE.BufferGeometry();
    wedgeGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([
          -hw, 0, -hl, hw, 0, -hl, hw, 0, hl,
          -hw, 0, -hl, hw, 0, hl, -hw, 0, hl,
          -hw, 0, -hl, -hw, L, hl, hw, 0, -hl,
          hw, 0, -hl, -hw, L, hl, hw, L, hl,
          -hw, 0, -hl, -hw, 0, hl, -hw, L, hl,
          hw, 0, -hl, hw, L, hl, hw, 0, hl,
        ]),
        3,
      ),
    );
    wedgeGeo.computeVertexNormals();
    const rampMesh = new THREE.Mesh(wedgeGeo, rampMat);
    rampMesh.castShadow = true;
    rampMesh.receiveShadow = true;
    rampMesh.position.set(ramp.x, 0, ramp.z);
    rampMesh.rotation.y = ramp.rotation;
    props.add(rampMesh);

    const edge = new THREE.Mesh(new THREE.BoxGeometry(ramp.width, 0.35, 1.1), stripeMat);
    edge.position.set(ramp.x, ramp.height + 0.1, ramp.z);
    edge.rotation.y = ramp.rotation;
    edge.translateZ(ramp.length / 2 - 0.5);
    props.add(edge);
  }
}

function addTown(props, colliders) {
  const seed = mulberry(7781);
  const placedBoxes = [];
  // One shared texture for every wall poster, so the artwork is rasterised
  // once no matter how many buildings carry a copy.
  const posterTexture = makePosterTexture();
  let posterBudget = Math.round(TOWN.posters * areaScale());
  const palette = [0xcfd6dd, 0xb8c4cf, 0xd8cbb4, 0xc2b6a4, 0x9fb0bd, 0xdcd6cc];
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x7a4b3a, roughness: 0.9 });
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x9fd4f0,
    emissive: 0x2b4658,
    roughness: 0.2,
    metalness: 0.4,
  });

  // Blocks scattered through town. Placement is rejection-sampled against the
  // road network so no building ever blocks the route the player drives.
  let placed = 0;
  const wanted = Math.round(44 * areaScale());
  // Cap the auto-raise rather than scaling it, so the growth comes from the
  // density and there is still a spending limit per building.
  const maxHeight = Math.min(35, (9 + 26) * Math.sqrt(areaScale()));
  // The town is a disc inside a square field, so it holds fewer buildings than
  // its share of the area suggests and every attempt costs a road test against
  // the whole block list. Budget for the rejection rate rather than stopping
  // short with the field half built.
  const budget = wanted * 16;
  for (let attempt = 0; attempt < budget && placed < wanted; attempt++) {
    const w = 12 + seed() * 16;
    const d = 12 + seed() * 16;
    const h = 9 + seed() * (maxHeight - 9);
    const halfW = w / 2;
    const halfD = d / 2;

    const angle = seed() * Math.PI * 2;
    // Buildings fill the town, not just a ribbon beside the ring road. A band
    // around the ring is the obvious reading of "along the street", but the
    // ring is a circle and the buildings are squares, so the band wastes most
    // of the ground it claims and the whole middle of the map stays empty
    // grass. Sampling a disc instead puts blocks along both sides of the ring
    // and through the middle of town, and the road tests below clear the
    // streets through it.
    const inner = TOWN.innerRadius;
    const outer = TOWN.outerRadius;
    // Square-rooted so the sample is even over the disc rather than clustered
    // in the middle, which is what a raw uniform radius would give.
    const radius = Math.sqrt(inner * inner + seed() * (outer * outer - inner * inner));
    // The north arc stops short of the beach, or every attempt up there is
    // thrown away by the beach test below. `northLimit` is the furthest north a
    // building may sit: the sand starts at BEACH.zStart and the palms need room
    // in front of it.
    const northLimit = BEACH.zStart - 40;
    let x = Math.cos(angle) * radius;
    let z = Math.sin(angle) * radius;
    if (z > northLimit) {
      const alongX = Math.abs(x);
      if (northLimit * northLimit - alongX * alongX <= 0) continue;
      z = northLimit;
    }

    if (Math.abs(x) + halfW > S - 12 || Math.abs(z) + halfD > S - 12) continue;
    if (z + halfD > BEACH.zStart - 10) continue;
    if (overlapsRoad(x, z, halfW, halfD)) continue;
    if (POI.some((p) => Math.hypot(p.position.x - x, p.position.z - z) < 32)) continue;
    if (ramps.some((r) => Math.hypot(r.x - x, r.z - z) < 28)) continue;
    // Do not stack buildings on each other.
    if (placedBoxes.some((b) => Math.abs(b.x - x) < b.halfW + halfW + 4 && Math.abs(b.z - z) < b.halfD + halfD + 4)) continue;

    placedBoxes.push({ x, z, halfW, halfD });
    placed++;
    const mat = new THREE.MeshStandardMaterial({ color: palette[Math.floor(seed() * palette.length)], roughness: 0.85 });
    const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    building.position.set(x, h / 2, z);
    building.castShadow = true;
    building.receiveShadow = true;
    props.add(building);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: h });

    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.7, d + 1), roofMat);
    roof.position.set(x, h + 0.35, z);
    props.add(roof);

    // Window bands on the two faces that point back toward the town centre.
    for (let floor = 4; floor < h - 1; floor += 4) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, 1.4, 0.12), windowMat);
      band.position.set(x, floor, z + d / 2 + 0.05);
      props.add(band);
      const band2 = band.clone();
      band2.position.set(x + w / 2 + 0.05, floor, z);
      band2.rotation.y = Math.PI / 2;
      props.add(band2);
    }

    // Wanted posters pasted on the street-facing walls. The window bands sit
    // at y = 4, 8, 12, ... and are 1.4 tall, so the poster is centred in the
    // clear gap above the first band rather than straddling one.
    if (posterBudget > 0 && seed() < 0.75) {
      posterBudget--;
      const posterY = 6;
      const lift = 0.12;
      if (seed() < 0.5) {
        // South face, facing +Z.
        addWallPoster(props, posterTexture, {
          x: x + (seed() - 0.5) * w * 0.4,
          y: posterY,
          z: z + d / 2 + lift,
        });
      } else {
        // East face, facing +X.
        addWallPoster(props, posterTexture, {
          x: x + w / 2 + lift,
          y: posterY,
          z: z + (seed() - 0.5) * d * 0.4,
          rotation: Math.PI / 2,
        });
      }
    }
  }

  // Concrete blocks the player can thread between. These are obstacles, not
  // walls, so they only need to stay off the road surface itself.
  for (let i = 0, wanted = Math.round(TOWN.blockers * areaScale()); i < wanted; i++) {
    const w = 5 + seed() * 5;
    const h = 1.6 + seed() * 1.6;
    const d = 5 + seed() * 5;
    const x = -S + 30 + seed() * (S * 2 - 60);
    // Stops short of the beach, as before: the sand is not a building site.
    const z = -S + 30 + seed() * (BEACH.zStart - 40 + S - 30);
    if (overlapsRoad(x, z, w / 2, d / 2)) continue;
    if (ramps.some((r) => Math.hypot(r.x - x, r.z - z) < 22)) continue;
    if (POI.some((p) => Math.hypot(p.position.x - x, p.position.z - z) < 24)) continue;
    const blockMat = new THREE.MeshStandardMaterial({ color: 0xa9adb3, roughness: 0.95 });
    const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), blockMat);
    block.position.set(x, h / 2, z);
    block.castShadow = true;
    block.receiveShadow = true;
    props.add(block);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: h });
  }
}

function addPoiBuildings(props, colliders) {
  for (const poi of POI) {
    const group = new THREE.Group();
    const { x, z } = poi.position;
    const rotation = poi.rotation || 0;
    group.position.set(x, 0, z);
    group.rotation.y = rotation;

    const wallMat = new THREE.MeshStandardMaterial({ color: poi.color, roughness: 0.85 });
    const accentMat = new THREE.MeshStandardMaterial({ color: poi.accent, roughness: 0.6, emissive: poi.accent, emissiveIntensity: 0.12 });

    // Structure: two side walls and a back wall, open at the front so the car
    // can actually drive in to the trigger volume.
    const depth = 20;
    const width = poi.radius * 1.7;
    const height = 7;
    const wallT = 1.4;

    const back = new THREE.Mesh(new THREE.BoxGeometry(width, height, wallT), wallMat);
    back.position.set(0, height / 2, -depth / 2);
    group.add(back);

    const left = new THREE.Mesh(new THREE.BoxGeometry(wallT, height, depth), accentMat);
    left.position.set(-width / 2, height / 2, 0);
    group.add(left);
    const right = left.clone();
    right.position.x = width / 2;
    group.add(right);

    // Canopy over the front apron.
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(width * 1.15, 0.7, depth * 0.75), wallMat);
    canopy.position.set(0, height, depth * 0.32);
    group.add(canopy);

    // Floor slab marks the drivable bay.
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(width * 1.1, 0.08, depth * 0.8),
      new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 1 }),
    );
    apron.position.set(0, 0.05, depth * 0.25);
    group.add(apron);

    // Signage band, readable on approach.
    const sign = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, 1.7, 0.25), accentMat);
    sign.position.set(0, height + 0.9, depth * 0.7);
    group.add(sign);

    group.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    props.add(group);

    // Colliders are placed in world space, so rotate the wall extents by hand.
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const wallSpecs = [
      { lx: 0, lz: -depth / 2, w: width, d: wallT },
      { lx: -width / 2, lz: 0, w: wallT, d: depth },
      { lx: width / 2, lz: 0, w: wallT, d: depth },
    ];
    for (const ws of wallSpecs) {
      const wx = x + ws.lx * cos + ws.lz * sin;
      const wz = z - ws.lx * sin + ws.lz * cos;
      // Use the larger axis extent so the collider covers the rotated wall.
      const halfW = (Math.abs(ws.w * cos) + Math.abs(ws.d * sin)) / 2;
      const halfD = (Math.abs(ws.w * sin) + Math.abs(ws.d * cos)) / 2;
      colliders.push({ minX: wx - halfW, maxX: wx + halfW, minZ: wz - halfD, maxZ: wz + halfD, height });
    }

    poi.world = group.position.clone();
    poi.trigger = { x, z, radius: poi.radius * 0.72, rotation };
  }
}

// A few parked cars so the field does not feel empty; they are solid.
function addParkedCars(props, colliders) {
  const seed = mulberry(3131);
  const keys = ['bmw', 'porsche', 'rolls'];
  const count = Math.round(9 * areaScale());
  for (let i = 0; i < count; i++) {
    const key = keys[i % keys.length];
    const built = buildCarMesh(
      { ...carSpecFor(key), body: { ...carSpecFor(key).body } },
      { colorOverride: [0x9c3b3b, 0x3b6f9c, 0xd8d2c4, 0x40484f, 0xb0723c][i % 5] },
    );
    // The parked car is dropped into the same space the physics car uses: the
    // resolver insists a vehicle keep its broad-phase circle clear of a
    // collider, and that circle is measured from the car's centre, so an
    // axis-aligned box hugging the bodywork is one the resolver can never
    // actually clear. It parks the car 1.8 m short of a 2.6 m face, leaving it
    // inside the solid, and the next frame pushes it out again. That is the
    // jitter felt against a parked car: the collider has to be the circle the
    // resolver wants to keep clear, not the silhouette of the bodywork.
    const spec = carSpecFor(key);
    const radius = Math.hypot(spec.body.width / 2, spec.body.length / 2) * 0.72;
    const angle = (i / count) * Math.PI * 2 + 0.4;
    // They line the ring road, so they scale with it.
    const r = WORLD.ringRadius + 16;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const heading = seed() * Math.PI * 2;
    built.group.position.set(x, 0, z);
    built.group.rotation.y = heading;
    props.add(built.group);
    colliders.push({
      minX: x - radius,
      maxX: x + radius,
      minZ: z - radius,
      maxZ: z + radius,
      height: 1.4,
      movable: true,
      // Remembered so the push-out below can put the body back on the surface
      // its collider describes.
      mesh: built.group,
      centre: { x, z },
    });
  }
}

let cachedSpecs = null;
function carSpecFor(key) {
  if (!cachedSpecs) {
    // Imported lazily to avoid a circular import with config.
    cachedSpecs = {
      bmw: { body: { width: 2.0, length: 4.7, height: 0.86, ride: 0.42, cabin: 0.34, wheel: 0.36 }, color: 0x2f6fd0, accent: 0x121821 },
      rolls: { body: { width: 2.15, length: 5.9, height: 1.02, ride: 0.48, cabin: 0.46, wheel: 0.4 }, color: 0x1b1b1e, accent: 0xb9953f },
      porsche: { body: { width: 2.02, length: 4.5, height: 0.72, ride: 0.34, cabin: 0.3, wheel: 0.37 }, color: 0xe8b23a, accent: 0x17181c },
    };
  }
  return cachedSpecs[key];
}

function mulberry(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
