import { afterEach, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import { game } from "./game";
import * as C from "./constants";
import { gravity, impact } from "./simulation";

const engines: ReturnType<typeof createEngine>[] = [];
async function setup() {
  const events = new EventTarget();
  const engine = createEngine({
    canvas: createCanvas(C.FIELD_W, C.FIELD_H) as unknown as HTMLCanvasElement,
    width: C.FIELD_W,
    height: C.FIELD_H,
    game,
    clock: new ConstantClock(1000 / C.TICK_HZ),
    background: "#080e18",
    surface: {
      cssWidth: () => C.FIELD_W,
      cssHeight: () => C.FIELD_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  await engine.initialize();
  engines.push(engine);
  const key = (code: string, type = "keydown") => {
    const e = new Event(type);
    Object.assign(e, { code, repeat: false });
    events.dispatchEvent(e);
  };
  const pose = (fn: (s: typeof engine.state) => typeof engine.state) =>
    engine.apply(fn);
  const sandbox = () => {
    pose((s) => ({
      ...s,
      screen: "playing",
      waveSpawning: false,
      saucerSpawning: false,
      ship: { ...s.ship, collision: false },
    }));
  };
  return { engine, key, pose, sandbox, events };
}
afterEach(() => {
  for (const e of engines) e.destroy();
  engines.length = 0;
});
describe("Shatter through the engine", () => {
  it("starts with the complete title state, registers diagnostics, and starts a safe first wave", async () => {
    const { engine, key } = await setup();
    expect(engine.debug.snapshot(engine.state).torpedoReady).toBe(true);
    key("Enter");
    await engine.advance(1);
    expect(engine.state.screen).toBe("playing");
    expect(engine.state.rocks).toHaveLength(C.WAVE_BASE_ROCKS + 1);
    expect(engine.diagnostics().find((d) => d.name === "rocks")?.value).toBe(4);
  });
  it("uses accumulated fixed ticks and freezes the field while paused", async () => {
    const { engine, pose, sandbox, key } = await setup();
    sandbox();
    pose((s) => engine.debug.setShipVelocity(s, 120, 0));
    await engine.advance(10);
    const x = engine.state.ship.x;
    key("KeyP");
    await engine.advance(30);
    expect(engine.state.ship.x).toBe(x);
    expect(engine.state.simTime).toBeCloseTo(40 * C.TICK_DT);
    key("KeyP", "keyup");
    key("KeyP");
    await engine.advance(1);
    expect(engine.state.ship.x).toBeGreaterThan(x);
  });
  it("chips armor without scoring, then splits at full child health", async () => {
    const { engine, pose, sandbox } = await setup();
    sandbox();
    pose((s) => engine.debug.addRock(s, "large", 200, 200));
    const id = engine.state.rocks[0].id;
    for (let i = 0; i < 3; i++) {
      pose((s) =>
        engine.debug.addBullet(
          s,
          engine.state.rocks[0].x,
          engine.state.rocks[0].y,
          100,
          0,
        ),
      );
      await engine.advance(1);
      if (i < 2) {
        expect(engine.state.score).toBe(0);
        expect(engine.state.rocks[0].health).toBe(2 - i);
      }
    }
    expect(engine.state.score).toBe(C.SCORE_LARGE);
    expect(engine.state.rocks.map((r) => r.size)).toEqual(["medium", "medium"]);
    expect(engine.state.rocks.every((r) => r.health === 2 && r.id !== id)).toBe(
      true,
    );
    expect(engine.state.rocks[0].vy - engine.state.rocks[1].vy).toBeCloseTo(
      2 * C.SPLIT_KICK,
      0,
    );
  });
  it("torpedoes kill armored rocks outright and scatter along their travel", async () => {
    const { engine, pose, sandbox } = await setup();
    sandbox();
    pose((s) => engine.debug.addRock(s, "large", 200, 200));
    pose((s) => engine.debug.addTorpedo(s, 200, 200, 0));
    await engine.advance(1);
    expect(engine.state.torpedoes).toHaveLength(0);
    expect(engine.state.score).toBe(C.SCORE_LARGE);
    expect(engine.state.rocks[0].vx - engine.state.rocks[1].vx).toBeCloseTo(
      2 * C.TORPEDO_SCATTER,
      0,
    );
  });
  it("recycles the same damaged rock on a posed edge without scoring", async () => {
    const { engine, pose, sandbox } = await setup();
    sandbox();
    pose((s) => engine.debug.addRock(s, "large", C.STAR_X, C.STAR_Y));
    const id = engine.state.rocks[0].id;
    pose((s) => engine.debug.setRockHealth(s, id, 1));
    pose((s) => engine.debug.setNextRecycleEdge(s, "left"));
    pose((s) => engine.debug.setNextRockSpeed(s, 75));
    await engine.advance(1);
    expect(engine.state.rocks[0]).toMatchObject({
      id,
      health: 1,
      x: 0,
      vx: 75,
    });
    expect(engine.state.nextRecycleEdge).toBeNull();
    expect(engine.state.score).toBe(0);
  });
  it("only destruction clears a wave, and the banner delays the next rocks", async () => {
    const { engine, pose, sandbox } = await setup();
    sandbox();
    pose((s) => ({ ...s, waveSpawning: true, wave: 1 }));
    await engine.advance(1);
    expect(engine.state.wave).toBe(1);
    pose((s) => engine.debug.addRock(s, "small", 150, 150));
    pose((s) => engine.debug.addBullet(s, 150, 150, 1, 0));
    await engine.advance(1);
    expect(engine.state.wave).toBe(2);
    expect(engine.state.waveBanner).toBe(C.WAVE_BANNER_TIME);
    await engine.advance(C.WAVE_BANNER_TIME * C.TICK_HZ - 1);
    expect(engine.state.rocks).toHaveLength(0);
    await engine.advance(1);
    expect(engine.state.rocks).toHaveLength(5);
  });
  it("respawns with grace and a full torpedo charge, then ends on the last life", async () => {
    const { engine, pose, sandbox } = await setup();
    sandbox();
    pose((s) => ({
      ...s,
      ship: { ...s.ship, collision: true },
      torpedoCharge: 0,
    }));
    pose((s) => engine.debug.addRock(s, "small", C.SAFE_X, C.SAFE_Y));
    await engine.advance(1);
    expect(engine.state.lives).toBe(2);
    expect(engine.state.ship.invuln).toBe(C.INVULN_TIME);
    expect(engine.state.torpedoCharge).toBe(1);
    await engine.advance(10);
    expect(engine.state.lives).toBe(2);
    pose((s) => ({ ...s, lives: 1, ship: { ...s.ship, invuln: 0 } }));
    await engine.advance(1);
    expect(engine.state.screen).toBe("gameover");
  });
  it("fires at the tick gate, caps rounds, and treats torpedo as a press", async () => {
    const { engine, key, sandbox } = await setup();
    sandbox();
    key("Space");
    key("KeyF");
    await engine.advance(100);
    expect(engine.state.bullets.length).toBeLessThanOrEqual(C.MAX_BULLETS);
    expect(engine.state.torpedoes.length).toBeLessThanOrEqual(1);
    expect(engine.state.torpedoCharge).toBeCloseTo(
      (99 * C.TICK_DT) / C.TORPEDO_RECHARGE,
    );
  });
  it("consumes posed saucer entry and aim, respecting faculty gates", async () => {
    const { engine, pose, sandbox } = await setup();
    sandbox();
    pose((s) => ({
      ...s,
      saucerSpawning: true,
      saucerDue: 0,
      nextSaucerEdge: "right",
      nextSaucerRow: 100,
      nextSaucerAim: 0,
    }));
    await engine.advance(1);
    expect(engine.state.saucer?.vx).toBe(-C.SAUCER_SPEED);
    expect(engine.state.nextSaucerEdge).toBeNull();
    pose((s) => engine.debug.setSaucerTravel(s, false));
    const x = engine.state.saucer!.x;
    await engine.advance(192);
    expect(engine.state.saucer?.x).toBe(x);
    expect(engine.state.enemyBullets.length).toBeGreaterThan(0);
    expect(engine.state.nextSaucerAim).toBeNull();
  });
  it("poses immutably, rejects invalid arguments, and reconciles without stepping", async () => {
    const { engine, pose } = await setup();
    const before = engine.state;
    pose((s) => engine.debug.setShipVelocity(s, 3, 4));
    expect(before.ship.vx).toBe(0);
    expect(engine.debug.snapshot(engine.state).ship.speed).toBe(5);
    expect(engine.debug.reconcile(engine.state)).toEqual(engine.state);
    expect(() => engine.debug.removeRock(engine.state, 99)).toThrow();
    expect(() => engine.debug.setScore(engine.state, NaN)).toThrow();
  });

  it("confirms a pointer menu only when both edges occupy the same entry", async () => {
    const { engine, events } = await setup();
    const pointer = (type: string, x: number, y: number) => {
      const e = new Event(type);
      Object.assign(e, {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        isPrimary: true,
      });
      events.dispatchEvent(e);
    };
    pointer("pointerdown", 140, 445);
    await engine.advance(1);
    pointer("pointerup", 140, 445);
    await engine.advance(1);
    expect(engine.state.screen).toBe("howto");
  });
  it("absorbs rounds at the core while the ship slides without losing a life", async () => {
    const { engine, pose, sandbox } = await setup();
    sandbox();
    pose((s) => engine.debug.setShipPosition(s, C.STAR_X, C.STAR_Y + 45));
    pose((s) => engine.debug.setShipVelocity(s, 60, -600));
    pose((s) => engine.debug.addBullet(s, C.STAR_X, C.STAR_Y, 100, 0));
    await engine.advance(1);
    expect(engine.state.bullets).toHaveLength(0);
    expect(engine.state.lives).toBe(C.START_LIVES);
    expect(
      Math.hypot(
        engine.state.ship.x - C.STAR_X,
        engine.state.ship.y - C.STAR_Y,
      ),
    ).toBeCloseTo(C.CORE_R + C.SHIP_R);
    expect(engine.state.ship.vx).toBeGreaterThan(0);
  });
  it("awards an extra ship only through play, and reset keeps the runtime mute bit", async () => {
    const { engine, pose, sandbox, key } = await setup();
    sandbox();
    pose((s) => engine.debug.setScore(s, C.EXTRA_LIFE_STEP - 1));
    expect(engine.state.lives).toBe(C.START_LIVES);
    pose((s) => engine.debug.addRock(s, "small", 100, 100));
    pose((s) => engine.debug.addBullet(s, 100, 100, 10, 0));
    await engine.advance(1);
    expect(engine.state.lives).toBe(C.START_LIVES + 1);
    key("KeyM");
    await engine.advance(1);
    expect(engine.state.muted).toBe(true);
    pose((s) => engine.debug.reset(s));
    expect(engine.state.muted).toBe(true);
    expect(engine.state.screen).toBe("title");
  });
  it("retains a torpedo press until a complete simulation tick is available", async () => {
    const { engine, key, sandbox } = await setup();
    sandbox();
    engine.setClock(new ConstantClock(1000 / C.TICK_HZ / 2));
    key("KeyF");
    await engine.advance(1);
    expect(engine.state.torpedoes).toHaveLength(0);
    key("KeyF", "keyup");
    await engine.advance(1);
    expect(engine.state.torpedoes).toHaveLength(1);
  });

  it("wraps swept collisions even when a fast shot crosses a whole body", () => {
    expect(
      impact(
        { x: 100, y: 100, vx: 24000, vy: 0 },
        { x: 20, y: 100, vx: 0, vy: 0 },
        10,
      ),
    ).not.toBeNull();
    expect(
      impact(
        { x: 2, y: 100, vx: 0, vy: 0 },
        { x: 1278, y: 100, vx: 0, vy: 0 },
        7,
      ),
    ).toBe(0);
    const b = gravity({ x: C.STAR_X + 200, y: C.STAR_Y, vx: 0, vy: 0 });
    expect(b.vx).toBeCloseTo(-112.5 * C.TICK_DT);
  });
});
