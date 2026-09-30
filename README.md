# Car Dash

An open-world driving game that runs in the browser and installs as an app. Pick
a BMW M4, a Rolls-Royce or a Porsche 911, then try to shake the police through a
town with ramps, a garage, a hospital, a gas station and a beach.

Built with Vite and three.js. No backend and no accounts. Solo play makes no
network calls at all; playing with a second device connects the two browsers
directly over WebRTC (see Two devices below).

## Play

- Touch: steering pad on the left, GAS and BRAKE pedals on the right, HB for
  handbrake.
- Keyboard: `W`/`Up` gas, `S`/`Down` brake and reverse, `A`/`D` or left/right to
  steer, `Space` handbrake, `C` cycles the camera, `R` respawns.

## Two devices

Two players can drive in the same city from two devices. The connection is a
direct peer-to-peer WebRTC data channel, so there is no game server to run: the
page is still static, and GitHub Pages is enough to host it.

1. Player one picks **Host a game** and is shown a three-digit room code.
2. Player two picks **Join a game** and types that code.
3. Both devices say **linked**, and either player can start.

Each device simulates its own car, so your own controls never wait on the
network; the other player's car is drawn from a 20 Hz state stream. The host
also owns the police: it simulates the cruisers and streams them, so both
players are chased by the same cars in the same places. Each device applies
damage to its own car, so a cruiser that hits you hurts you on your screen.

WebRTC still needs a signalling step to introduce the two browsers, and a static
host has no server to do it. That one step runs over PeerJS's public broker: the
host claims its room code there, the guest dials it, and the code *is* the
address. Once the channel is open the broker is out of the path and the two
browsers talk directly. Solo play never touches it.

Two caveats worth knowing: the broker is a third-party service, so a code can
only be claimed while it is reachable, and no TURN relay is configured, so two
devices behind strict symmetric NAT may fail to connect.

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
├─ net.js             WebRTC peer link: PeerJS signalling, state and cruiser streams
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
