import type { UpdateApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import { initial } from "./game";
import type { View, ShatterState, RockState, BulletState } from "./game";
import { debug, items, menuRect } from "./debug";

export const wrap = (v: number, size: number) => ((v % size) + size) % size;
export const delta = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => ({
  x: wrap(b.x - a.x + C.FIELD_W / 2, C.FIELD_W) - C.FIELD_W / 2,
  y: wrap(b.y - a.y + C.FIELD_H / 2, C.FIELD_H) - C.FIELD_H / 2,
});
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const d = delta(a, b);
  return Math.hypot(d.x, d.y);
};
const star = { x: C.STAR_X, y: C.STAR_Y };
const random = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const down = (v: number) => (v - C.TICK_DT < 1e-10 ? 0 : v - C.TICK_DT);
const angleDiff = (a: number) => wrap(a + Math.PI, Math.PI * 2) - Math.PI;
type Body = { x: number; y: number; vx: number; vy: number };
export function gravity<T extends Body>(b: T): T {
  const x = C.STAR_X - b.x,
    y = C.STAR_Y - b.y,
    d = Math.hypot(x, y);
  const k = d === 0 ? 0 : (C.MU / Math.max(d, C.SOFTEN) ** 2 / d) * C.TICK_DT;
  return { ...b, vx: b.vx + x * k, vy: b.vy + y * k };
}
const move = <T extends Body>(b: T): T => ({
  ...b,
  x: wrap(b.x + b.vx * C.TICK_DT, C.FIELD_W),
  y: wrap(b.y + b.vy * C.TICK_DT, C.FIELD_H),
});
/** Relative-motion segment against all torus images touched by the segment. */
export function impact(
  a: Body,
  b: Body,
  r: number,
  travelA = true,
  travelB = true,
): number | null {
  const dx =
    (travelA ? a.vx : 0) * C.TICK_DT - (travelB ? b.vx : 0) * C.TICK_DT;
  const dy =
    (travelA ? a.vy : 0) * C.TICK_DT - (travelB ? b.vy : 0) * C.TICK_DT;
  const end = delta(b, a);
  const sx = end.x - dx,
    sy = end.y - dy;
  let best = Infinity;
  for (
    let ix = Math.floor((Math.min(sx, end.x) - r) / C.FIELD_W);
    ix <= Math.ceil((Math.max(sx, end.x) + r) / C.FIELD_W);
    ix++
  )
    for (
      let iy = Math.floor((Math.min(sy, end.y) - r) / C.FIELD_H);
      iy <= Math.ceil((Math.max(sy, end.y) + r) / C.FIELD_H);
      iy++
    ) {
      const x = sx - ix * C.FIELD_W,
        y = sy - iy * C.FIELD_H,
        q = x * x + y * y - r * r;
      if (q <= 0) {
        best = 0;
        continue;
      }
      const aa = dx * dx + dy * dy,
        bb = 2 * (x * dx + y * dy),
        disc = bb * bb - 4 * aa * q;
      if (aa > 0 && disc >= 0) {
        const t = (-bb - Math.sqrt(disc)) / (2 * aa);
        if (t >= 0 && t <= 1) best = Math.min(best, t);
      }
    }
  return best === Infinity ? null : best;
}
const core: Body = { ...star, vx: 0, vy: 0 };
function spawnWave(s: ShatterState): ShatterState {
  let next = s;
  for (let i = 0; i < C.WAVE_BASE_ROCKS + s.wave; i++) {
    let p;
    do {
      p = { x: random(0, C.FIELD_W), y: random(0, C.FIELD_H) };
    } while (
      distance(p, s.ship) < C.WAVE_MIN_SHIP_DIST ||
      distance(p, star) < C.WAVE_MIN_STAR_DIST
    );
    next = debug.addRock(next, "large", p.x, p.y);
    const a = random(0, Math.PI * 2),
      speed =
        (s.nextRockSpeed ??
          random(C.ROCK_SPEED_MIN.large, C.ROCK_SPEED_MAX.large)) *
        (1 + Math.min(C.WAVE_SPEED_CAP, C.WAVE_SPEED_STEP * (s.wave - 1)));
    next = debug.setRockVelocity(
      next,
      next.nextId - 1,
      Math.cos(a) * speed,
      Math.sin(a) * speed,
    );
  }
  return { ...next, nextRockSpeed: null };
}
function newGame(s: View): ShatterState {
  return spawnWave({
    ...initial(s.muted),
    screen: "playing",
    wave: 1,
    simTime: s.simTime,
  });
}
function confirm(s: ShatterState): ShatterState {
  if (s.screen === "title")
    return s.menuIndex === 0 ? newGame(s) : { ...s, screen: "howto" };
  if (s.screen === "paused")
    return s.menuIndex === 0
      ? { ...s, screen: "playing", menuIndex: 0 }
      : s.menuIndex === 1
        ? newGame(s)
        : { ...s, screen: "title", menuIndex: 0 };
  if (s.screen === "gameover")
    return s.menuIndex === 0
      ? newGame(s)
      : { ...s, screen: "title", menuIndex: 0 };
  return s;
}
type Controls = {
  turn: number;
  thrust: boolean;
  fire: boolean;
  torpedo: boolean;
};
function tick(input: View, ctl: Controls, api: UpdateApi): ShatterState {
  let s: ShatterState = { ...input, simTime: input.simTime + C.TICK_DT };
  if (s.screen !== "playing") return s;
  const cues = new Set<string>();
  let ship = {
    ...s.ship,
    angle: s.ship.angle + ctl.turn * C.SHIP_TURN * C.TICK_DT,
    thrusting: ctl.thrust,
    invuln: down(s.ship.invuln),
    fireCooldown: Math.max(0, s.ship.fireCooldown - 1),
  };
  if (ctl.thrust) {
    ship.vx += Math.cos(ship.angle) * C.SHIP_THRUST * C.TICK_DT;
    ship.vy += Math.sin(ship.angle) * C.SHIP_THRUST * C.TICK_DT;
  }
  const drag = 0.5 ** (C.TICK_DT / C.SHIP_DRAG_HALFLIFE);
  ship.vx *= drag;
  ship.vy *= drag;
  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed > C.SHIP_MAX) {
    ship.vx *= C.SHIP_MAX / speed;
    ship.vy *= C.SHIP_MAX / speed;
  }
  s = {
    ...s,
    ship,
    torpedoCharge: Math.min(
      1,
      s.torpedoCharge + C.TICK_DT / C.TORPEDO_RECHARGE,
    ),
  };
  if (ctl.fire && ship.fireCooldown === 0 && s.bullets.length < C.MAX_BULLETS) {
    s = debug.addBullet(
      s,
      ship.x + Math.cos(ship.angle) * C.SHIP_R,
      ship.y + Math.sin(ship.angle) * C.SHIP_R,
      ship.vx + Math.cos(ship.angle) * C.MUZZLE_SPEED,
      ship.vy + Math.sin(ship.angle) * C.MUZZLE_SPEED,
    );
    s = { ...s, ship: { ...ship, fireCooldown: C.FIRE_INTERVAL_TICKS } };
    cues.add(C.CUES.fire);
  }
  if (ctl.torpedo && s.torpedoCharge === 1 && !s.torpedoes.length) {
    s = debug.addTorpedo(
      s,
      ship.x + Math.cos(ship.angle) * C.SHIP_R,
      ship.y + Math.sin(ship.angle) * C.SHIP_R,
      ship.angle,
    );
    s = { ...s, torpedoCharge: 0 };
  }
  if (!s.saucer) {
    s = { ...s, saucerClock: s.saucerClock + C.TICK_DT };
    if (s.saucerSpawning && s.saucerClock + 1e-9 >= s.saucerDue) {
      const edge = s.nextSaucerEdge ?? (Math.random() < 0.5 ? "left" : "right");
      s = debug.addSaucer(
        s,
        edge === "left" ? 0 : C.FIELD_W - C.TICK_DT,
        s.nextSaucerRow ?? random(C.SAUCER_R, C.FIELD_H - C.SAUCER_R),
      );
      s = {
        ...s,
        saucer: {
          ...s.saucer!,
          vx: edge === "left" ? C.SAUCER_SPEED : -C.SAUCER_SPEED,
          weave: Math.random() < 0.5 ? 1 : -1,
        },
        nextSaucerEdge: null,
        nextSaucerRow: null,
      };
      cues.add(C.CUES.saucer);
    }
  }
  if (s.saucer) {
    let u = {
      ...s.saucer,
      age: s.saucer.age + C.TICK_DT,
      fireClock: down(s.saucer.fireClock),
      weaveClock: down(s.saucer.weaveClock),
    };
    if (u.mind) {
      if (u.weaveClock < 1e-9) {
        u.vy =
          u.vy === 0
            ? u.weave * C.SAUCER_WEAVE_SPEED
            : -Math.sign(u.vy) * C.SAUCER_WEAVE_SPEED;
        u.weaveClock = C.SAUCER_WEAVE_INTERVAL;
      }
      const d = delta(u, star);
      if (Math.abs(d.x) < 110 && Math.abs(d.y) < 95) {
        u.vy = (d.y > 0 ? -1 : 1) * C.SAUCER_WEAVE_SPEED;
      }
    }
    if (u.gun && u.fireClock < 1e-9) {
      const d = delta(u, s.ship),
        a =
          Math.atan2(d.y, d.x) +
          (s.nextSaucerAim ?? random(-C.SAUCER_AIM_ERROR, C.SAUCER_AIM_ERROR));
      s = debug.addEnemyBullet(
        s,
        u.x,
        u.y,
        u.vx + Math.cos(a) * C.SAUCER_BULLET_SPEED,
        u.vy + Math.sin(a) * C.SAUCER_BULLET_SPEED,
      );
      u.fireClock = C.SAUCER_FIRE_INTERVAL;
      s = { ...s, nextSaucerAim: null };
    }
    if (u.travel) u = move(u);
    if (u.mind && distance(u, star) < C.CORE_R + C.SAUCER_R) {
      const d = delta(star, u),
        len = Math.hypot(d.x, d.y) || 1;
      u = {
        ...u,
        x: C.STAR_X + (d.x / len) * (C.CORE_R + C.SAUCER_R),
        y: C.STAR_Y + (d.y / len) * (C.CORE_R + C.SAUCER_R),
      };
    }
    s = { ...s, saucer: u.age + 1e-9 >= C.SAUCER_LIFETIME ? null : u };
    if (!s.saucer)
      s = {
        ...s,
        saucerClock: 0,
        saucerDue: random(C.SAUCER_GAP_MIN, C.SAUCER_GAP_MAX),
      };
  }
  s = {
    ...s,
    ship: move(s.ship),
    rocks: s.rocks.map((r) =>
      move({
        ...gravity(r),
        spin: r.spin + C.TICK_DT * 0.18,
        flash: down(r.flash),
      }),
    ),
    bullets: s.bullets.map((b) => move({ ...gravity(b), life: down(b.life) })),
    enemyBullets: s.enemyBullets.map((b) =>
      move({ ...gravity(b), life: down(b.life) }),
    ),
    torpedoes: s.torpedoes.map((t) => {
      let heading = t.heading;
      const candidates = [...s.rocks, ...(s.saucer ? [s.saucer] : [])]
        .filter((b) => {
          const d = delta(t, b);
          return (
            Math.abs(angleDiff(Math.atan2(d.y, d.x) - heading)) <=
            C.TORPEDO_CONE
          );
        })
        .sort((a, b) => distance(t, a) - distance(t, b));
      if (t.homing && candidates[0]) {
        const d = delta(t, candidates[0]),
          turn = angleDiff(Math.atan2(d.y, d.x) - heading);
        heading += Math.max(
          -C.TORPEDO_TURN * C.TICK_DT,
          Math.min(C.TORPEDO_TURN * C.TICK_DT, turn),
        );
      }
      return move({
        ...t,
        heading,
        vx: Math.cos(heading) * C.TORPEDO_SPEED,
        vy: Math.sin(heading) * C.TORPEDO_SPEED,
        life: down(t.life),
      });
    }),
  };
  let destroyed = false;
  function award(points: number) {
    const score = s.score + points,
      extra =
        Math.floor(score / C.EXTRA_LIFE_STEP) -
        Math.floor(s.score / C.EXTRA_LIFE_STEP);
    s = { ...s, score, lives: s.lives + extra };
    if (extra) cues.add(C.CUES.extraLife);
  }
  function kill(r: RockState, w: Body, heavy: boolean) {
    destroyed = true;
    s = { ...s, rocks: s.rocks.filter((x) => x.id !== r.id) };
    award(
      r.size === "large"
        ? C.SCORE_LARGE
        : r.size === "medium"
          ? C.SCORE_MEDIUM
          : C.SCORE_SMALL,
    );
    cues.add(C.CUES.shatter);
    const child = C.ROCK_CHILD[r.size];
    if (child) {
      const len = Math.hypot(w.vx, w.vy) || 1,
        k = heavy ? C.TORPEDO_SCATTER : C.SPLIT_KICK,
        x = ((heavy ? w.vx : -w.vy) / len) * k,
        y = ((heavy ? w.vy : w.vx) / len) * k;
      for (const sign of [1, -1]) {
        s = debug.addRock(s, child, r.x, r.y);
        s = debug.setRockVelocity(
          s,
          s.nextId - 1,
          r.vx + sign * x,
          r.vy + sign * y,
        );
      }
    }
  }
  for (const r of [...s.rocks])
    if (impact(r, core, C.ROCK_RADIUS[r.size] + C.CORE_R) !== null) {
      const edge =
        s.nextRecycleEdge ??
        (["top", "bottom", "left", "right"] as const)[
          Math.floor(Math.random() * 4)
        ];
      const speed =
        s.nextRockSpeed ??
        random(C.ROCK_SPEED_MIN[r.size], C.ROCK_SPEED_MAX[r.size]);
      const horizontal = edge === "left" || edge === "right";
      const x = horizontal
          ? edge === "left"
            ? 0
            : C.FIELD_W - 1e-6
          : random(0, C.FIELD_W),
        y = horizontal
          ? random(0, C.FIELD_H)
          : edge === "top"
            ? 0
            : C.FIELD_H - 1e-6;
      const a = horizontal
        ? edge === "left"
          ? 0
          : Math.PI
        : edge === "top"
          ? Math.PI / 2
          : -Math.PI / 2;
      s = {
        ...s,
        nextRecycleEdge: null,
        nextRockSpeed: null,
        rocks: s.rocks.map((v) =>
          v.id === r.id
            ? { ...r, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed }
            : v,
        ),
      };
    }
  function resolve(w: BulletState, heavy: boolean): boolean {
    let hit: RockState | null = null;
    let time =
      impact(w, core, (heavy ? C.TORPEDO_R : C.BULLET_R) + C.CORE_R) ??
      Infinity;
    let saucer = false;
    for (const r of s.rocks) {
      const t = impact(
        w,
        r,
        (heavy ? C.TORPEDO_R : C.BULLET_R) + C.ROCK_RADIUS[r.size],
      );
      if (t !== null && t < time) {
        hit = r;
        time = t;
        saucer = false;
      }
    }
    if (s.saucer) {
      const t = impact(
        w,
        s.saucer,
        (heavy ? C.TORPEDO_R : C.BULLET_R) + C.SAUCER_R,
        true,
        s.saucer.travel,
      );
      if (t !== null && t < time) {
        hit = null;
        saucer = true;
        time = t;
      }
    }
    if (time === Infinity) return w.life > 0;
    if (hit) {
      if (heavy || hit.health === 1) kill(hit, w, heavy);
      else
        s = {
          ...s,
          rocks: s.rocks.map((r) =>
            r.id === hit!.id
              ? { ...r, health: r.health - 1, flash: C.HIT_FLASH_TIME }
              : r,
          ),
        };
    }
    if (saucer) {
      award(C.SCORE_SAUCER);
      s = {
        ...s,
        saucer: null,
        saucerClock: 0,
        saucerDue: random(C.SAUCER_GAP_MIN, C.SAUCER_GAP_MAX),
      };
    }
    return false;
  }
  const bullets = s.bullets.filter((w) => resolve(w, false));
  s = { ...s, bullets };
  const torpedoes = s.torpedoes.filter((w) => resolve(w, true));
  s = { ...s, torpedoes };
  s = {
    ...s,
    enemyBullets: s.enemyBullets.filter(
      (b) =>
        b.life > 0 && impact(b, core, C.SAUCER_BULLET_R + C.CORE_R) === null,
    ),
  };
  ship = { ...s.ship };
  const slide = impact(ship, core, C.SHIP_R + C.CORE_R);
  if (slide !== null) {
    const old = {
      x: ship.x - ship.vx * C.TICK_DT,
      y: ship.y - ship.vy * C.TICK_DT,
    };
    let dx = old.x + ship.vx * C.TICK_DT * slide - C.STAR_X,
      dy = old.y + ship.vy * C.TICK_DT * slide - C.STAR_Y;
    const len = Math.hypot(dx, dy);
    if (len === 0) {
      dx = 0;
      dy = 1;
    } else {
      dx /= len;
      dy /= len;
    }
    const inward = ship.vx * dx + ship.vy * dy;
    ship = {
      ...ship,
      x: C.STAR_X + dx * (C.CORE_R + C.SHIP_R),
      y: C.STAR_Y + dy * (C.CORE_R + C.SHIP_R),
      vx: ship.vx - Math.min(0, inward) * dx,
      vy: ship.vy - Math.min(0, inward) * dy,
    };
  }
  s = { ...s, ship };
  if (ship.collision && ship.invuln === 0) {
    const enemy = s.enemyBullets.find(
      (b) => impact(ship, b, C.SHIP_R + C.SAUCER_BULLET_R) !== null,
    );
    if (
      enemy ||
      s.rocks.some(
        (r) => impact(ship, r, C.SHIP_R + C.ROCK_RADIUS[r.size]) !== null,
      ) ||
      (s.saucer &&
        impact(ship, s.saucer, C.SHIP_R + C.SAUCER_R, true, s.saucer.travel) !==
          null)
    ) {
      cues.add(C.CUES.death);
      s = {
        ...s,
        lives: s.lives - 1,
        enemyBullets: s.enemyBullets.filter((b) => b.id !== enemy?.id),
      };
      if (s.lives === 0) s = { ...s, screen: "gameover", menuIndex: 0 };
      else
        s = {
          ...s,
          ship: { ...initial().ship, invuln: C.INVULN_TIME },
          torpedoCharge: 1,
        };
    }
  }
  if (s.waveBanner > 0) {
    const remaining = down(s.waveBanner);
    s = { ...s, waveBanner: remaining < 1e-9 ? 0 : remaining };
    if (s.waveBanner === 0 && s.waveSpawning) s = spawnWave(s);
  } else if (destroyed && s.rocks.length === 0 && s.waveSpawning)
    s = { ...s, wave: s.wave + 1, waveBanner: C.WAVE_BANNER_TIME };
  for (const cue of cues) api.audio.play(cue);
  if (s.ship.thrusting && s.screen === "playing") api.audio.loop(C.CUES.thrust);
  else api.audio.stop(C.CUES.thrust);
  return s;
}
export function advance(input: View, api: UpdateApi, dt: number): ShatterState {
  let s: ShatterState = { ...input };
  const edge = Object.fromEntries(
    C.ACTIONS.map((a) => [a, api.input.pressed(a)]),
  ) as Record<C.ActionName, boolean>;
  if (edge.mute) api.audio.setMuted(!api.audio.muted());
  s = { ...s, muted: api.audio.muted() };
  const paused = s.screen === "paused";
  let consumed = false;
  if (
    (s.screen === "playing" && edge.pause) ||
    (paused && (edge.pause || edge.back))
  ) {
    s = { ...s, screen: paused ? "playing" : "paused", menuIndex: 0 };
    consumed = true;
  }
  if (!consumed && s.screen === "howto" && (edge.back || edge.confirm)) {
    s = { ...s, screen: "title" };
    consumed = true;
  }
  if (!consumed && s.screen === "gameover" && edge.back) {
    s = { ...s, screen: "title", menuIndex: 0 };
    consumed = true;
  }
  if (!consumed && items(s).length) {
    const n = items(s).length;
    s = {
      ...s,
      menuIndex: wrap(s.menuIndex + (edge.down ? 1 : 0) - (edge.up ? 1 : 0), n),
    };
    const starts = { ...s.pointerStarts };
    for (const p of api.input.pointerSamples())
      if (p.type === "down") starts[p.id] = { x: p.x, y: p.y };
    s = { ...s, pointerStarts: starts };
    const before = s;
    if (edge.confirm) {
      s = confirm(s);
      consumed = true;
    }
    const samples = api.input.pointerSamples(),
      contacts = api.input.pointerContacts();
    const pointer = api.input.pointer();
    const at = (x: number, y: number) =>
      items(before).findIndex((_, i) => {
        const r = menuRect(before, i)!;
        return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      });
    let selection = samples.length > 0 ? at(pointer.x, pointer.y) : -1;
    for (const c of contacts) {
      const index = at(c.x, c.y);
      if (index >= 0) selection = index;
    }
    for (const p of samples) {
      const index = at(p.x, p.y);
      if (index >= 0) selection = index;
    }
    if (!consumed && selection >= 0) s = { ...s, menuIndex: selection };
    if (!consumed)
      for (const p of samples.filter((p) => p.type === "up")) {
        const start = samples.find((q) => q.id === p.id && q.type === "down");
        const contact = s.pointerStarts[p.id];
        const index = at(p.x, p.y);
        const startIndex = start
          ? at(start.x, start.y)
          : contact
            ? at(contact.x, contact.y)
            : -1;
        if (index >= 0 && index === startIndex) {
          s = confirm({ ...s, menuIndex: index });
          break;
        }
      }
  }
  s = {
    ...s,
    pendingFire:
      !consumed && s.screen === "playing" && (s.pendingFire || edge.a),
    pendingTorpedo:
      !consumed && s.screen === "playing" && (s.pendingTorpedo || edge.b),
  };
  const remainingStarts = { ...s.pointerStarts };
  for (const p of api.input.pointerSamples())
    if (p.type === "up") delete remainingStarts[p.id];
  s = { ...s, pointerStarts: remainingStarts };
  let clock = s.tickClock + dt,
    first = true;
  while (clock + 1e-12 >= C.TICK_DT) {
    s = tick(
      s,
      {
        turn: api.input.value("right") - api.input.value("left"),
        thrust: api.input.value("up") > 0,
        fire:
          !consumed && (api.input.value("a") > 0 || (first && s.pendingFire)),
        torpedo: !consumed && first && s.pendingTorpedo,
      },
      api,
    );
    clock -= C.TICK_DT;
    s = { ...s, pendingFire: false, pendingTorpedo: false };
    first = false;
  }
  if (s.screen !== "playing") api.audio.stop(C.CUES.thrust);
  return { ...s, tickClock: Math.max(0, clock) };
}
