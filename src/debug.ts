import * as C from "./constants";
import { initial } from "./game";
import type { View, ShatterState, Screen, SaucerEdge, FieldEdge } from "./game";
import type { RockSize } from "./constants";
export const items = (s: View) =>
  s.screen === "title"
    ? C.TITLE_ITEMS
    : s.screen === "paused"
      ? C.PAUSE_ITEMS
      : s.screen === "gameover"
        ? C.GAMEOVER_ITEMS
        : [];
export function menuRect(s: View, index: number) {
  return index >= 0 && index < items(s).length
    ? { x: 110, y: 365 + index * 62, w: 340, h: 50 }
    : null;
}
function check(...values: unknown[]) {
  for (const v of values)
    if (typeof v === "number" && !Number.isFinite(v))
      throw new Error("Expected finite number");
}
function named<T extends string>(v: T, values: readonly string[]): T {
  if (!values.includes(v)) throw new Error("Invalid name");
  return v;
}
function edit<T extends { readonly id: number }>(
  list: readonly T[],
  id: number,
  patch: Partial<T>,
): T[] {
  check(id, ...Object.values(patch));
  if (!list.some((v) => v.id === id)) throw new Error("Unknown entity");
  return list.map((v) => (v.id === id ? { ...v, ...patch } : v));
}
function remove<T extends { readonly id: number }>(
  list: readonly T[],
  id: number,
): T[] {
  edit(list, id, {});
  return list.filter((v) => v.id !== id);
}
export const debug = {
  version: C.SHATTER_DEBUG_VERSION,
  reset: (s: View): ShatterState => initial(s.muted),
  reconcile: (s: View): ShatterState => ({ ...s }),
  menuItemRect: menuRect,
  snapshot: (s: View) => {
    const {
      tickClock: _tick,
      nextId: _id,
      pointerStarts: _pointer,
      pendingFire: _fire,
      pendingTorpedo: _torpedo,
      ...rest
    } = s;
    return {
      ...rest,
      version: C.SHATTER_DEBUG_VERSION,
      ship: { ...s.ship, speed: Math.hypot(s.ship.vx, s.ship.vy) },
      rocks: s.rocks.map((r) => ({
        id: r.id,
        x: r.x,
        y: r.y,
        vx: r.vx,
        vy: r.vy,
        size: r.size,
        health: r.health,
        radius: C.ROCK_RADIUS[r.size],
      })),
      torpedoReady: s.torpedoCharge === 1,
    };
  },
  setScreen: (s: View, v: Screen): ShatterState => {
    check(v);
    named(v, ["title", "howto", "playing", "paused", "gameover"]);
    return { ...s, screen: v };
  },
  setMenuIndex: (s: View, v: number): ShatterState => {
    check(v);
    return { ...s, menuIndex: v };
  },
  setScore: (s: View, v: number): ShatterState => {
    check(v);
    return { ...s, score: v };
  },
  setLives: (s: View, v: number): ShatterState => {
    check(v);
    return { ...s, lives: v };
  },
  setWave: (s: View, v: number): ShatterState => {
    check(v);
    return { ...s, wave: v };
  },
  setWaveBanner: (s: View, v: number): ShatterState => {
    check(v);
    return { ...s, waveBanner: v };
  },
  setWaveSpawning: (s: View, v: boolean): ShatterState => {
    check(v);
    return { ...s, waveSpawning: v };
  },
  setSaucerSpawning: (s: View, v: boolean): ShatterState => {
    check(v);
    return { ...s, saucerSpawning: v };
  },
  setSaucerDue: (s: View, v: number): ShatterState => {
    check(v);
    return { ...s, saucerDue: v };
  },
  setNextSaucerEdge: (s: View, v: SaucerEdge): ShatterState => {
    check(v);
    named(v, ["left", "right"]);
    return { ...s, nextSaucerEdge: v };
  },
  setNextSaucerRow: (s: View, v: number): ShatterState => {
    check(v);
    return { ...s, nextSaucerRow: v };
  },
  setNextSaucerAim: (s: View, v: number): ShatterState => {
    check(v);
    return { ...s, nextSaucerAim: v };
  },
  setNextRockSpeed: (s: View, v: number): ShatterState => {
    check(v);
    return { ...s, nextRockSpeed: v };
  },
  setNextRecycleEdge: (s: View, v: FieldEdge): ShatterState => {
    check(v);
    named(v, ["top", "bottom", "left", "right"]);
    return { ...s, nextRecycleEdge: v };
  },
  setTorpedoCharge: (s: View, v: number): ShatterState => {
    check(v);
    if (v < 0 || v > 1) throw new Error("Invalid charge");
    return { ...s, torpedoCharge: v };
  },
  setShipPosition: (s: View, x: number, y: number): ShatterState => {
    check(x, y);
    return { ...s, ship: { ...s.ship, x, y } };
  },
  setShipVelocity: (s: View, vx: number, vy: number): ShatterState => {
    check(vx, vy);
    return { ...s, ship: { ...s.ship, vx, vy } };
  },
  setShipAngle: (s: View, angle: number): ShatterState => {
    check(angle);
    return { ...s, ship: { ...s.ship, angle } };
  },
  setShipInvuln: (s: View, invuln: number): ShatterState => {
    check(invuln);
    return { ...s, ship: { ...s.ship, invuln } };
  },
  setShipCollision: (s: View, collision: boolean): ShatterState => {
    check(collision);
    return { ...s, ship: { ...s.ship, collision } };
  },
  setFireCooldown: (s: View, fireCooldown: number): ShatterState => {
    check(fireCooldown);
    return { ...s, ship: { ...s.ship, fireCooldown } };
  },
  addBullet: (
    s: View,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): ShatterState => {
    check(x, y, vx, vy);
    return {
      ...s,
      nextId: s.nextId + 1,
      bullets: [
        ...s.bullets,
        { id: s.nextId, x, y, vx, vy, life: C.BULLET_LIFE },
      ],
    };
  },
  addEnemyBullet: (
    s: View,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): ShatterState => {
    check(x, y, vx, vy);
    return {
      ...s,
      nextId: s.nextId + 1,
      enemyBullets: [
        ...s.enemyBullets,
        { id: s.nextId, x, y, vx, vy, life: C.SAUCER_BULLET_LIFE },
      ],
    };
  },
  removeBullet: (s: View, id: number): ShatterState => ({
    ...s,
    bullets: remove(s.bullets, id),
  }),
  clearBullets: (s: View): ShatterState => ({ ...s, bullets: [] }),
  removeEnemyBullet: (s: View, id: number): ShatterState => ({
    ...s,
    enemyBullets: remove(s.enemyBullets, id),
  }),
  clearEnemyBullets: (s: View): ShatterState => ({ ...s, enemyBullets: [] }),
  removeRock: (s: View, id: number): ShatterState => ({
    ...s,
    rocks: remove(s.rocks, id),
  }),
  clearRocks: (s: View): ShatterState => ({ ...s, rocks: [] }),
  removeTorpedo: (s: View, id: number): ShatterState => ({
    ...s,
    torpedoes: remove(s.torpedoes, id),
  }),
  clearTorpedoes: (s: View): ShatterState => ({ ...s, torpedoes: [] }),
  addRock: (s: View, size: RockSize, x: number, y: number): ShatterState => {
    check(x, y);
    named(size, ["large", "medium", "small"]);
    return {
      ...s,
      nextId: s.nextId + 1,
      rocks: [
        ...s.rocks,
        {
          id: s.nextId,
          size,
          x,
          y,
          vx: 0,
          vy: 0,
          spin: 0,
          health: C.ROCK_HEALTH[size],
          flash: 0,
        },
      ],
    };
  },
  setRockVelocity: (
    s: View,
    id: number,
    vx: number,
    vy: number,
  ): ShatterState => ({ ...s, rocks: edit(s.rocks, id, { vx, vy }) }),
  setRockHealth: (s: View, id: number, health: number): ShatterState => {
    const r = s.rocks.find((r) => r.id === id);
    if (
      !r ||
      !Number.isInteger(health) ||
      health < 1 ||
      health > C.ROCK_HEALTH[r.size]
    )
      throw new Error("Invalid health");
    return { ...s, rocks: edit(s.rocks, id, { health }) };
  },
  addSaucer: (s: View, x: number, y: number): ShatterState => {
    check(x, y);
    return {
      ...s,
      nextId: s.nextId + 1,
      saucer: {
        id: s.nextId,
        x,
        y,
        vx: C.SAUCER_SPEED,
        vy: 0,
        mind: true,
        gun: true,
        travel: true,
        weave: 1,
        fireClock: C.SAUCER_FIRE_INTERVAL,
        weaveClock: C.SAUCER_WEAVE_INTERVAL,
        age: 0,
      },
    };
  },
  removeSaucer: (s: View): ShatterState => ({ ...s, saucer: null }),
  setSaucerVelocity: (s: View, vx: number, vy: number): ShatterState => {
    check(vx, vy);
    if (!s.saucer) throw new Error("No saucer");
    return { ...s, saucer: { ...s.saucer, vx, vy } };
  },
  setSaucerWeave: (s: View, weave: 1 | -1): ShatterState => {
    check(weave);
    if (weave !== 1 && weave !== -1) throw new Error("Invalid weave");
    if (!s.saucer) throw new Error("No saucer");
    return { ...s, saucer: { ...s.saucer, weave } };
  },
  setSaucerMind: (s: View, mind: boolean): ShatterState => {
    check(mind);
    if (!s.saucer) throw new Error("No saucer");
    return { ...s, saucer: { ...s.saucer, mind } };
  },
  setSaucerGun: (s: View, gun: boolean): ShatterState => {
    check(gun);
    if (!s.saucer) throw new Error("No saucer");
    return { ...s, saucer: { ...s.saucer, gun } };
  },
  setSaucerTravel: (s: View, travel: boolean): ShatterState => {
    check(travel);
    if (!s.saucer) throw new Error("No saucer");
    return { ...s, saucer: { ...s.saucer, travel } };
  },
  addTorpedo: (
    s: View,
    x: number,
    y: number,
    heading: number,
  ): ShatterState => {
    check(x, y, heading);
    return {
      ...s,
      nextId: s.nextId + 1,
      torpedoes: [
        ...s.torpedoes,
        {
          id: s.nextId,
          x,
          y,
          heading,
          vx: C.TORPEDO_SPEED * Math.cos(heading),
          vy: C.TORPEDO_SPEED * Math.sin(heading),
          life: C.TORPEDO_LIFE,
          homing: true,
        },
      ],
    };
  },
  setTorpedoHeading: (s: View, id: number, heading: number): ShatterState => {
    const t = s.torpedoes.find((t) => t.id === id);
    if (!t) throw new Error("Unknown torpedo");
    const speed = Math.hypot(t.vx, t.vy);
    return {
      ...s,
      torpedoes: edit(s.torpedoes, id, {
        heading,
        vx: speed * Math.cos(heading),
        vy: speed * Math.sin(heading),
      }),
    };
  },
  setTorpedoHoming: (s: View, id: number, homing: boolean): ShatterState => ({
    ...s,
    torpedoes: edit(s.torpedoes, id, { homing }),
  }),
};
