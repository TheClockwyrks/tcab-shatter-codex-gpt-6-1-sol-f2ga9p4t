import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import type { RockSize } from "./constants";
import * as C from "./constants";
import { debug } from "./debug";
import { advance } from "./simulation";
import { render } from "./render";

export type Screen = "title" | "howto" | "playing" | "paused" | "gameover";
export type SaucerEdge = "left" | "right";
export type FieldEdge = "top" | "bottom" | "left" | "right";

export interface ShipState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly thrusting: boolean;
  readonly invuln: number;
  readonly collision: boolean;
  readonly fireCooldown: number;
}

export interface BulletState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly life: number;
}

export interface RockState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly size: RockSize;
  readonly spin: number;
  readonly health: number;
  readonly flash: number;
}

export interface SaucerState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly mind: boolean;
  readonly gun: boolean;
  readonly travel: boolean;
  readonly weave: 1 | -1;
  readonly fireClock: number;
  readonly weaveClock: number;
  readonly age: number;
}

export interface TorpedoState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly heading: number;
  readonly life: number;
  readonly homing: boolean;
}

export interface ShatterState {
  readonly pendingFire: boolean;
  readonly pendingTorpedo: boolean;
  readonly pointerStarts: Readonly<Record<number, { x: number; y: number }>>;
  readonly screen: Screen;
  readonly menuIndex: number;

  readonly score: number;
  readonly lives: number;
  readonly wave: number;
  readonly waveBanner: number;

  readonly ship: ShipState;
  readonly bullets: readonly BulletState[];
  readonly rocks: readonly RockState[];
  readonly saucer: SaucerState | null;
  readonly enemyBullets: readonly BulletState[];
  readonly torpedoes: readonly TorpedoState[];
  readonly torpedoCharge: number;

  readonly waveSpawning: boolean;
  readonly saucerSpawning: boolean;
  readonly saucerClock: number;
  readonly saucerDue: number;

  readonly nextSaucerEdge: SaucerEdge | null;
  readonly nextSaucerRow: number | null;
  readonly nextSaucerAim: number | null;
  readonly nextRockSpeed: number | null;
  readonly nextRecycleEdge: FieldEdge | null;

  readonly tickClock: number;
  readonly nextId: number;
  readonly simTime: number;
  readonly muted: boolean;
}

export type View = DeepReadonly<ShatterState>;
export type ShatterDebugApi = typeof debug;
export const BACKGROUND = "#080e18";
export function initial(muted = false): ShatterState {
  return {
    pendingFire: false,
    pendingTorpedo: false,
    pointerStarts: {},
    screen: "title",
    menuIndex: 0,
    score: 0,
    lives: C.START_LIVES,
    wave: 0,
    waveBanner: 0,
    ship: {
      x: C.SAFE_X,
      y: C.SAFE_Y,
      vx: 0,
      vy: 0,
      angle: C.FACE_UP,
      thrusting: false,
      invuln: 0,
      collision: true,
      fireCooldown: 0,
    },
    bullets: [],
    rocks: [],
    saucer: null,
    enemyBullets: [],
    torpedoes: [],
    torpedoCharge: 1,
    waveSpawning: true,
    saucerSpawning: true,
    saucerClock: 0,
    saucerDue: C.SAUCER_FIRST_DELAY,
    nextSaucerEdge: null,
    nextSaucerRow: null,
    nextSaucerAim: null,
    nextRockSpeed: null,
    nextRecycleEdge: null,
    tickClock: 0,
    nextId: 1,
    simTime: 0,
    muted,
  };
}
export const game: Game<ShatterState, ShatterDebugApi> = {
  initialize(api) {
    for (const a of C.ACTIONS) api.input.register(a, C.BINDINGS[a]);
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        wave: i === 2 ? "sawtooth" : "triangle",
        freq: [880, 110, 55, 320, 180, 660][i],
        freqTo: [240, 35, 55, 640, 30, 990][i],
        gain: 0.08,
        durationMs: [70, 180, 100, 250, 400, 350][i],
      }),
    );
    const fields = [
      "screen",
      "score",
      "lives",
      "wave",
      "torpedoCharge",
      "simTime",
    ] as const;
    for (const key of fields) api.diagnostics.register(key, (s) => s[key]);
    api.diagnostics.register(
      "ship.position",
      (s) => s.ship.x.toFixed(1) + ", " + s.ship.y.toFixed(1),
    );
    api.diagnostics.register(
      "ship.velocity",
      (s) => s.ship.vx.toFixed(1) + ", " + s.ship.vy.toFixed(1),
    );
    api.diagnostics.register("ship.speed", (s) =>
      Math.hypot(s.ship.vx, s.ship.vy),
    );
    api.diagnostics.register("ship.angle", (s) => s.ship.angle);
    api.diagnostics.register("ship.invuln", (s) => s.ship.invuln);
    api.diagnostics.register("bullets", (s) => s.bullets.length);
    api.diagnostics.register("rocks", (s) => s.rocks.length);
    api.diagnostics.register("saucer", (s) => s.saucer !== null);
    api.diagnostics.register("saucer.position", (s) =>
      s.saucer ? s.saucer.x.toFixed(1) + ", " + s.saucer.y.toFixed(1) : "none",
    );
    api.diagnostics.register("torpedoes", (s) => s.torpedoes.length);
    return [initial(), debug];
  },
  update: advance,
  render,
};
