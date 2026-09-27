# Car Dash

An open-world driving game that runs in the browser and installs as an app. Pick
a BMW M4, a Rolls-Royce or a Porsche 911, then try to shake the police through a
town with ramps, a garage, a hospital, a gas station and a beach.

Built with Vite and three.js. No backend, no accounts, no network calls at
runtime.

## Play

- Touch: steering pad on the left, GAS and BRAKE pedals on the right, HB for
  handbrake.
- Keyboard: `W`/`Up` gas, `S`/`Down` brake and reverse, `A`/`D` or left/right to
  steer, `Space` handbrake, `C` cycles the camera, `R` respawns.

## What is in the world

| Place | What it does |
| --- | --- |
| Garage (west, off the ring road) | Drive into the bay and the car is repaired to factory condition over a couple of seconds |
| Hospital (inside the ring road) | Landmark with an emergency bay |
| Gas Station (east, off the ring road) | Landmark refuel stop |
| Beach (north, past the ring road) | Sand, palms and a waterline that ends the run |
| Ramps (seven, plus two on the sand) | Hit one at speed to jump; the launch scales with your speed |
| Ring road | A closed loop around town with two straight spurs |

The field is walled by a track barrier. The middle of the map is deliberately
left open: buildings are rejection-sampled so none of them ever blocks a road,
a ramp run-up or a POI bay.

## Cars

| Car | Top speed | Character |
| --- | --- | --- |
| BMW M4 | 74 m/s | Fastest, balanced, quick to change direction |
| Rolls-Royce | 56 m/s | Heavy, planted, shrugs off contact |
| Porsche 911 | 68 m/s | Loose at the rear and delicate, rewards throttle control |

## Damage

Damage accumulates from real impacts only, scaled by the car's armour. As damage
rises the painted panels dull toward bare grey, six dent panels push and wrinkle
out of the bodywork, and the car loses top speed and throttle response. Driving
into a wall while stationary does not damage the car; only impacts above a
threshold count.

## Police

Any sustained speed draws attention. Heat builds with speed and damage, raising
the wanted level from one to five stars. Cruisers spawn behind you, chase, and
ram when they are lined up. A hard enough hit knocks a cruiser out of service;
heavy contact eventually kills its light bar. With no cruiser in sight and the
heat low, the pursuit ends on its own.

## Development

```bash
npm install
npm run dev        # dev server on http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the built output on http://localhost:4173
node tools/make-icons.mjs   # regenerate the PWA icon set
```

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the app and
publishes `dist/` to GitHub Pages. The Vite config uses a relative `base`, so the
same build works at a domain root or under a project path such as `/car-dash/`.

The service worker caches the app shell and the built assets, so the game boots
offline once it has been loaded.

## Layout

```
src/
├─ main.js            entry point; wires the game to the DOM and registers the SW
├─ game.js            game loop, cameras, POI triggers, collision orchestration
├─ config.js          all tuning: world size, physics, police, cars, POI placement
├─ vehicle.js         arcade car controller, terrain contact, damage and dents
├─ models.js          car and police meshes built from primitives
├─ world.js           ground, roads, beach, buildings, ramps, perimeter
├─ terrain.js         ramp height field, beach and waterline helpers
├─ physics.js         world, car-to-car and boundary collision response
├─ pursuit.js         cruiser spawning, heat and wanted level
├─ policeVehicle.js   cruiser driving, siren and cosmetic damage
├─ ui.js              car select, HUD, touch and keyboard input
└─ styles.css         navy and gold UI
```
