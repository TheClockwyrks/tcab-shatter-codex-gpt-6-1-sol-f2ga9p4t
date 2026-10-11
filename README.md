# Shatter

A browser space shooter where a central star bends bullets and rocks around a wrapping field. Chip armored rocks into fragments, survive the hunting saucer, and launch a guided torpedo when you need a decisive hit.

## Run

Requires Node.js and npm.

```sh
npm ci
npm run dev
```

## Build

```sh
npm run build
```

Serve `dist/` from any static host, including under a subpath. Use `npm run preview` to check the production build locally. No backend, assets, or credentials are needed.

## Controls

- **ARROWS / WASD:** turn left or right; up applies thrust.
- **SPACE:** fire; hold for repeated shots.
- **F:** guided torpedo, with a ten-second recharge.
- **P / ESC:** pause or resume.
- **M:** toggle sound.
- **Up / down:** select a menu entry. **ENTER / SPACE:** confirm.
- **ESC:** return from instructions or game over.
- **Backtick:** engine diagnostics overlay.

Menus also accept mouse and touch. Touch play uses the engine's on-screen pad and two weapon buttons.

Momentum carries the ship even after thrust ends. Turn and thrust against your velocity to slow down. The star never pulls your ship; its solid core lets you slide along its edge.

## Verification

`npm run typecheck`, `npm run lint`, `npm run format`, and `npm test` check the code and the simulation. Tests drive the actual engine with a counted clock and cover armor, splitting, torpedoes, recycling, waves, respawns, cadence, and swept wrap collisions.

The committed `showcase/` contains screenshots and an engine-recorded replay of live play.
