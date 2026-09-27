import * as THREE from 'three';

// One-off bodywork for a car that should not be the shared box with a cabin on
// it. Everything is built from the same primitives as buildCarMesh and returns
// the same shape, so the vehicle, the damage dents and the wheels all work
// without knowing which model they were handed.
//
// The BMW 2 Series Gran Coupe: a four-door fastback, so a long bonnet, a
// windscreen raked back over the front axle, a roof that peaks early and then
// falls away into a boot lid, a low black kidney grille, and an M-style rear
// bumper with a diffuser and a pair of round pipes.
export function buildBmwMesh(spec, { beatUp = false, colorOverride = null } = {}) {
  const group = new THREE.Group();
  const bodyGroup = new THREE.Group();
  group.add(bodyGroup);

  const b = spec.body;
  const paint = new THREE.Color(colorOverride ?? spec.color);
  const paintMat = new THREE.MeshStandardMaterial({ color: paint.clone(), metalness: 0.62, roughness: 0.26 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0a1119,
    metalness: 0.9,
    roughness: 0.1,
    transparent: true,
    opacity: 0.76,
  });
  const glossTrim = new THREE.MeshStandardMaterial({ color: 0x0e1114, metalness: 0.65, roughness: 0.34 });
  const darkTrim = new THREE.MeshStandardMaterial({ color: 0x15181c, metalness: 0.45, roughness: 0.72 });

  const painted = (mesh) => {
    mesh.userData.baseColor = paint.clone();
    return mesh;
  };
  const add = (mesh) => {
    bodyGroup.add(mesh);
    return mesh;
  };
  // A slab tilted about the car's width axis. The rotation runs about the
  // centre, so the caller works out where its two ends land and passes the
  // midpoint; that is what keeps the glass and the roof meeting instead of
  // floating apart. Angle is from the car's forward axis, nose up.
  const raked = (w, thick, len, material, y, z, angle) => {
    const slab = box(w, thick, len, material, 0, 0, 0);
    slab.position.set(0, y, z);
    slab.rotation.x = angle;
    return add(slab);
  };

  const zNose = b.length / 2;
  const zTail = -b.length / 2;
  const yBelt = b.ride + b.height;

  // Sill, running the length of the car under the doors.
  add(painted(box(b.width * 0.99, 0.3, b.length * 0.66, paintMat, 0, b.ride + 0.16, -0.1)));

  // Bonnet: long and flat, from the base of the windscreen to the nose.
  add(painted(box(b.width * 0.94, 0.24, b.length * 0.33, paintMat, 0, b.ride + 0.38, b.length * 0.205)));

  // Front wings, a little taller than the bonnet so the headlights sit in a
  // shoulder rather than floating on the nose.
  for (const side of [-1, 1]) {
    add(painted(box(0.34, 0.34, b.length * 0.3, paintMat, side * b.width * 0.34, b.ride + 0.42, b.length * 0.2)));
  }

  // The greenhouse: a windscreen from the bonnet up to the roof's leading edge,
  // a roof panel, and a rear screen from the roof's trailing edge down to the
  // boot. Each one is placed by the height of both its ends, so the panels stay
  // joined however the rake is changed.
  const RAKE = 0.62;
  const yScreenTop = b.ride + 0.95;
  const zScreenTop = 0.05;
  const zScreenBase = zScreenTop + (yScreenTop - yBelt) / Math.tan(RAKE);

  const RAKE_REAR = 0.6;
  const yRearTop = b.ride + 0.95;
  const zRearTop = -0.9;
  const zRearBase = zRearTop - (yRearTop - yBelt) / Math.tan(RAKE_REAR);
  const rearLen = Math.hypot(yRearTop - yBelt, zRearTop - zRearBase);
  // The screens run a little past the roof's leading and trailing edges, which
  // is what closes the joint between them once they are tilted apart.
  const GLASS_W = b.width * 0.82;
  raked(GLASS_W, 0.18, Math.hypot(yScreenTop - yBelt, zScreenTop - zScreenBase) + 0.18, glassMat, (yBelt + yScreenTop) / 2 - 0.04, (zScreenBase + zScreenTop) / 2 + 0.05, -RAKE);
  raked(GLASS_W * 0.95, 0.18, rearLen + 0.14, glassMat, (yBelt + yRearTop) / 2 - 0.03, (zRearBase + zRearTop) / 2 - 0.03, RAKE_REAR);

  // Roof, laid between the tops of the two screens. Its width is the glass it
  // caps, so its edges land on the pillars instead of overhanging the doors.
  add(painted(box(GLASS_W + 0.06, 0.2, Math.abs(zScreenTop - zRearTop) + 0.22, paintMat, 0, yScreenTop + 0.04, (zScreenTop + zRearTop) / 2)));

  // Doors, filled between the belt line and the window glass so the shadowed
  // gap under the screens is not visible from the side.
  for (const side of [-1, 1]) {
    add(painted(box(0.06, 0.26, b.length * 0.44, paintMat, side * (b.width * 0.44 - 0.02), yBelt - 0.12, -0.36)));
  }

  // A, B and C pillars, framing the glass between the belt line and the roof.
  // They sit outside the glass rather than crossing it, which is what makes the
  // windows read as windows.
  const pillarY = (yBelt + yScreenTop) / 2 - 0.02;
  const pillarHeight = yScreenTop - yBelt - 0.04;
  const pillarX = GLASS_W / 2 + 0.02;
  for (const side of [-1, 1]) {
    add(box(0.09, pillarHeight, 0.14, glossTrim, side * pillarX, pillarY, zScreenBase - 0.02));
    add(box(0.09, pillarHeight, 0.14, glossTrim, side * pillarX, pillarY, -0.46));
    add(box(0.09, pillarHeight, 0.16, glossTrim, side * pillarX, pillarY, zRearBase + 0.02));
  }

  // Rear wings, and the boot deck between them: the deck runs from the base of
  // the rear screen back to the tail, so the rear glass lands on it.
  const zBootFront = zRearBase + 0.02;
  for (const side of [-1, 1]) {
    add(painted(box(0.34, 0.36, b.length * 0.2, paintMat, side * b.width * 0.34, b.ride + 0.42, -b.length * 0.36)));
  }
  const bootLen = Math.abs(zBootFront - zTail) + 0.04;
  add(painted(box(b.width * 0.62, 0.22, bootLen, paintMat, 0, yBelt - 0.11, (zBootFront + zTail) / 2)));

  // Front bumper: a deep black intake under a body-coloured top, with the
  // kidney grille between the headlights.
  add(painted(box(b.width * 0.97, 0.2, 0.22, paintMat, 0, b.ride + 0.3, zNose - 0.1)));
  add(box(b.width * 0.66, 0.34, 0.16, glossTrim, 0, b.ride + 0.16, zNose - 0.03));
  for (const side of [-1, 1]) {
    add(box(0.3, 0.22, 0.14, darkTrim, side * b.width * 0.32, b.ride + 0.14, zNose - 0.03));
    add(box(b.width * 0.42, 0.24, 0.09, glossTrim, side * b.width * 0.12, b.ride + 0.44, zNose - 0.02));
  }

  // Splitter under the front bumper.
  add(box(b.width * 0.98, 0.08, 0.44, glossTrim, 0, b.ride - 0.04, zNose - 0.2));

  // Headlights, set into the front shoulders.
  const headMat = () => new THREE.MeshStandardMaterial({
    color: 0xf8fbff,
    emissive: 0xdfeaff,
    emissiveIntensity: 1.0,
  });
  for (const side of [-1, 1]) {
    const lens = box(0.54, 0.15, 0.1, headMat(), side * b.width * 0.28, b.ride + 0.5, zNose - 0.02);
    lens.rotation.y = side * -0.16;
    add(lens);
  }

  // Tail lights, which wrap a little onto the rear wings.
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x4a0f12, emissive: 0xd8394a, emissiveIntensity: 1.3 });
  const lights = [];
  for (const side of [-1, 1]) {
    const lens = box(0.52, 0.14, 0.1, tailMat, side * b.width * 0.28, b.ride + 0.5, zTail + 0.05);
    add(lens);
    lights.push(lens);
    add(box(0.12, 0.12, 0.3, tailMat, side * b.width * 0.45, b.ride + 0.5, zTail + 0.16));
  }

  // Boot lip spoiler, sitting on the boot deck rather than floating above it.
  add(painted(box(b.width * 0.72, 0.05, 0.2, paintMat, 0, yBelt + 0.02, zTail + 0.2)));
  add(painted(box(b.width * 0.97, 0.24, 0.24, paintMat, 0, b.ride + 0.38, zTail + 0.1)));
  add(box(b.width * 0.88, 0.28, 0.2, glossTrim, 0, b.ride + 0.16, zTail + 0.04));
  // Twin round pipes, one each side.
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 0.9, roughness: 0.3 });
  for (const side of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 12), pipeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(side * 0.42, b.ride - 0.02, zTail - 0.02);
    add(pipe);
  }

  // Front doors and the mirror stalks.
  for (const side of [-1, 1]) {
    add(box(0.03, 0.5, 0.04, darkTrim, side * (b.width / 2 - 0.02), b.ride + 0.5, 0.16));
    add(box(0.03, 0.5, 0.04, darkTrim, side * (b.width / 2 - 0.02), b.ride + 0.5, -0.66));
    const mirror = box(0.2, 0.11, 0.26, glossTrim, side * (b.width / 2 + 0.02), b.ride + 0.64, 0.42);
    add(mirror);
  }

  // Wheels. The M wheels of the day had blue calipers behind them.
  const wheelGeo = new THREE.CylinderGeometry(b.wheel, b.wheel, 0.3, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.92 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x1a1d21, metalness: 0.72, roughness: 0.4 });
  const caliperMat = new THREE.MeshStandardMaterial({ color: 0x2f6fd0, metalness: 0.35, roughness: 0.45 });
  const wheels = [];
  const axleZ = b.length * 0.31;
  for (const [side, front] of [
    [-1, true],
    [1, true],
    [-1, false],
    [1, false],
  ]) {
    const holder = new THREE.Group();
    holder.position.set(side * (b.width / 2 - 0.05), b.wheel, front ? axleZ : -axleZ);
    holder.userData.steerable = front;
    const tyre = new THREE.Mesh(wheelGeo, wheelMat);
    tyre.castShadow = true;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(b.wheel * 0.56, b.wheel * 0.56, 0.32, 14), rimMat);
    rim.rotation.z = Math.PI / 2;
    const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.14), caliperMat);
    caliper.position.set(side * 0.14, 0.02, 0);
    holder.add(tyre, rim, caliper);
    group.add(holder);
    wheels.push(holder);
  }

  return finishCarMesh({ group, bodyGroup, wheels, lights, paintMat, glassMat, b, spec, beatUp, paint, cabinZ: -0.3 });
}

// Every car that is not the BMW is assembled from the same primitives and driven
// by the spec's body dimensions, so a new car is a config entry rather than a
// new model.
export function buildCarMesh(spec, { beatUp = false, colorOverride = null } = {}) {
  const group = new THREE.Group();
  const bodyGroup = new THREE.Group();
  group.add(bodyGroup);

  const b = spec.body;
  const paint = new THREE.Color(colorOverride ?? spec.color);
  const accent = new THREE.Color(spec.accent);

  const paintMat = new THREE.MeshStandardMaterial({
    color: paint.clone(),
    metalness: 0.55,
    roughness: 0.32,
  });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent.clone(), metalness: 0.4, roughness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0c1420,
    metalness: 0.9,
    roughness: 0.12,
    transparent: true,
    opacity: 0.72,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x14161a, metalness: 0.5, roughness: 0.7 });

  const chassis = box(b.width, b.height, b.length, paintMat, 0, b.ride + b.height / 2, 0);
  bodyGroup.add(chassis);
  markBaseColor(chassis, paint);

  // Cabin sits forward of centre on the sports cars and further back on the lux.
  const cabinZ = spec.key === 'rolls' ? -0.15 : spec.key === 'porsche' ? -0.25 : 0.0;
  const cabin = box(
    b.width * 0.82,
    b.cabin,
    b.length * 0.44,
    glassMat,
    0,
    b.ride + b.height + b.cabin / 2 - 0.04,
    cabinZ,
  );
  bodyGroup.add(cabin);

  const roof = box(
    b.width * 0.78,
    b.cabin * 0.42,
    b.length * 0.34,
    paintMat,
    0,
    b.ride + b.height + b.cabin - 0.02,
    cabinZ,
  );
  markBaseColor(roof, paint);
  bodyGroup.add(roof);

  // Front splitter, rear diffuser and side skirts.
  bodyGroup.add(box(b.width * 1.02, 0.09, 0.5, trimMat, 0, b.ride - 0.06, b.length / 2 - 0.2));
  bodyGroup.add(box(b.width * 1.02, 0.12, 0.55, trimMat, 0, b.ride - 0.05, -b.length / 2 + 0.22));
  for (const side of [-1, 1]) {
    bodyGroup.add(
      box(0.1, 0.1, b.length * 0.55, trimMat, side * (b.width / 2 + 0.02), b.ride + 0.02, 0),
    );
  }

  // Lights.
  const headMat = () => new THREE.MeshStandardMaterial({ color: 0xfff4d0, emissive: 0xffe9a8, emissiveIntensity: 1.1 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x5c1414, emissive: 0xd8323f, emissiveIntensity: 1.1 });
  for (const side of [-1, 1]) {
    bodyGroup.add(box(0.46, 0.16, 0.08, headMat(), side * b.width * 0.29, b.ride + b.height * 0.62, b.length / 2 + 0.01));
  }
  const lights = [];
  for (const side of [-1, 1]) {
    const tail = box(0.5, 0.15, 0.08, tailMat, side * b.width * 0.3, b.ride + b.height * 0.66, -b.length / 2 - 0.01);
    bodyGroup.add(tail);
    lights.push(tail);
  }

  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(b.wheel, b.wheel, 0.3, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xb9bfc8, metalness: 0.85, roughness: 0.25 });
  const wheels = [];
  const axleZ = b.length * 0.31;
  for (const [side, front] of [
    [-1, true],
    [1, true],
    [-1, false],
    [1, false],
  ]) {
    const holder = new THREE.Group();
    holder.position.set(side * (b.width / 2 - 0.04), b.wheel, front ? axleZ : -axleZ);
    holder.userData.steerable = front;
    const tyre = new THREE.Mesh(wheelGeo, wheelMat);
    tyre.castShadow = true;
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(b.wheel * 0.55, b.wheel * 0.55, 0.32, 12),
      rimMat,
    );
    rim.rotation.z = Math.PI / 2;
    holder.add(tyre, rim);
    group.add(holder);
    wheels.push(holder);
  }

  return finishCarMesh({
    group,
    bodyGroup,
    wheels,
    lights,
    paintMat,
    glassMat,
    b,
    spec,
    beatUp,
    paint,
    cabinZ,
    materials: { paintMat, accentMat },
  });
}

// Wraps up a built car: the hidden dent panels the player's damage reveals, the
// list of painted panels damage dulls, and the hooks the vehicle reads back.
function finishCarMesh({
  group,
  bodyGroup,
  wheels,
  lights,
  paintMat,
  b,
  spec,
  beatUp,
  paint,
  cabinZ,
  materials,
}) {
  // Spare dent panels: hidden until the player takes damage. They are placed on
  // the outer skin and pushed/pulled out of shape as damage accumulates.
  const dents = [];
  if (beatUp) {
    const panelPositions = [
      [b.width / 2 + 0.01, b.ride + b.height * 0.55, b.length * 0.24, 0.06, 0.5, 0.9],
      [-b.width / 2 - 0.01, b.ride + b.height * 0.5, -b.length * 0.18, 0.06, 0.55, 1.0],
      // The roof panel is a fraction of the width, not half of it: at half it
      // is wider than the cabin it covers, and it hangs over the bonnet and
      // boot as a shelf the real bodywork does not have.
      [0, b.ride + b.height + b.cabin * 0.4, cabinZ + b.length * 0.22, b.width * 0.3, 0.05, 0.5],
      [b.width * 0.22, b.ride + b.height * 0.7, b.length / 2 + 0.01, 0.5, 0.4, 0.05],
      [-b.width * 0.26, b.ride + b.height * 0.45, -b.length / 2 - 0.01, 0.55, 0.38, 0.05],
      [b.width / 2 + 0.01, b.ride + b.height * 0.35, -b.length * 0.4, 0.05, 0.3, 0.7],
    ];
    panelPositions.forEach((p, i) => {
      const dent = box(p[3], p[4], p[5], paintMat.clone(), p[0], p[1], p[2]);
      dent.userData.origin = dent.position.clone();
      dent.userData.baseRotX = dent.rotation.x;
      dent.userData.baseRotZ = dent.rotation.z;
      dent.userData.seed = (i + 1) / 7;
      dent.visible = false;
      bodyGroup.add(dent);
      dents.push(dent);
    });
  }

  // Every painted panel, collected once so damage can dull the paint without
  // walking the whole hierarchy each frame.
  const paintMeshes = [];
  bodyGroup.traverse((child) => {
    if (child.isMesh && child.userData.baseColor) paintMeshes.push(child);
  });

  const scale = spec.key === 'rolls' ? 1.02 : 1;
  group.scale.setScalar(scale);
  group.userData.spec = spec;
  group.userData.wheels = wheels;
  group.userData.wheelRadius = b.wheel;
  group.userData.axleZ = b.length * 0.31;
  group.userData.halfWidth = b.width / 2;

  return { group, bodyGroup, wheels, lights, dents, paintMeshes, materials };
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function markBaseColor(mesh, color) {
  mesh.userData.baseColor = color.clone();
}

// Police cruiser: the same body builder plus livery, light bar and a push bar.
export function buildPoliceMesh({ onLivery = 0x16181c } = {}) {
  const spec = {
    key: 'police',
    name: 'Police Cruiser',
    body: { length: 5.1, width: 2.05, height: 1.15, ride: 0.52, cabin: 0.52, wheel: 0.42 },
    color: 0xf2f4f7,
    accent: onLivery,
  };
  const built = buildCarMesh(spec, { beatUp: false });

  const liveryMat = new THREE.MeshStandardMaterial({ color: onLivery, roughness: 0.6, metalness: 0.3 });
  for (const side of [-1, 1]) {
    const stripe = box(0.04, 0.34, spec.body.length * 0.8, liveryMat, side * (spec.body.width / 2 + 0.01), 0.7, 0);
    built.bodyGroup.add(stripe);
  }
  const pushBar = box(1.9, 0.5, 0.14, new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.7, roughness: 0.5 }), 0, 0.7, spec.body.length / 2 + 0.06);
  built.bodyGroup.add(pushBar);

  const bar = new THREE.Group();
  bar.position.set(0, spec.body.ride + spec.body.height + spec.body.cabin + 0.06, -0.1);
  const red = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.14, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x3a0d10, emissive: 0xff2d3a, emissiveIntensity: 2.4 }),
  );
  red.position.x = -0.32;
  const blue = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.14, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x0d1a3a, emissive: 0x2d6bff, emissiveIntensity: 2.4 }),
  );
  blue.position.x = 0.32;
  bar.add(red, blue);
  built.bodyGroup.add(bar);
  built.lightBar = { group: bar, red, blue };

  return built;
}
