import * as THREE from 'three';

// Every car is assembled from the same primitives and driven by the spec's body
// dimensions, so a new car is a config entry rather than a new model.
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

  // Spare dent panels: hidden until the player takes damage. They are placed on
  // the outer skin and pushed/pulled out of shape as damage accumulates.
  const dents = [];
  if (beatUp) {
    const panelPositions = [
      [b.width / 2 + 0.01, b.ride + b.height * 0.55, b.length * 0.24, 0.06, 0.5, 0.9],
      [-b.width / 2 - 0.01, b.ride + b.height * 0.5, -b.length * 0.18, 0.06, 0.55, 1.0],
      [0, b.ride + b.height + b.cabin * 0.4, cabinZ + b.length * 0.22, b.width * 0.5, 0.05, 0.55],
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
  group.userData.axleZ = axleZ;
  group.userData.halfWidth = b.width / 2;

  return { group, bodyGroup, wheels, lights, dents, paintMeshes, materials: { paintMat, accentMat } };
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
