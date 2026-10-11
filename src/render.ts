import type { RenderApi } from "@clockwyrks/simple-2d";
import type { View, RockState, ShipState, BulletState } from "./game";
import * as C from "./constants";
import { items, menuRect } from "./debug";
const cyan = "#8df4ee",
  amber = "#ffc681",
  ink = "#e5edf3",
  dim = "#7d92a4";
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 14,
  color = ink,
  font = "monospace",
) {
  ctx.fillStyle = color;
  ctx.font = `${size}px ${font}`;
  ctx.fillText(value, x, y);
}
function line(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  x2: number,
  y2: number,
) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function circle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}
function copies(
  ctx: CanvasRenderingContext2D,
  b: { x: number; y: number },
  r: number,
  draw: () => void,
) {
  for (const x of [
    0,
    ...(b.x < r ? [C.FIELD_W] : []),
    ...(b.x > C.FIELD_W - r ? [-C.FIELD_W] : []),
  ])
    for (const y of [
      0,
      ...(b.y < r ? [C.FIELD_H] : []),
      ...(b.y > C.FIELD_H - r ? [-C.FIELD_H] : []),
    ]) {
      ctx.save();
      ctx.translate(b.x + x, b.y + y);
      draw();
      ctx.restore();
    }
}
function ship(ctx: CanvasRenderingContext2D, s: ShipState, time: number) {
  ctx.rotate(s.angle);
  ctx.strokeStyle = cyan;
  ctx.fillStyle = "#122b37";
  ctx.lineWidth = 1.8;
  ctx.shadowColor = cyan;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(19, 0);
  ctx.lineTo(-15, 13);
  ctx.lineTo(-9, 0);
  ctx.lineTo(-15, -13);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  line(ctx, -7, 0, 9, 0);
  if (s.thrusting) {
    ctx.fillStyle = amber;
    ctx.beginPath();
    ctx.moveTo(-13, -5);
    ctx.lineTo(-29 - 8 * Math.sin(time * 50), 0);
    ctx.lineTo(-13, 5);
    ctx.fill();
  }
}
function rock(ctx: CanvasRenderingContext2D, r: RockState) {
  const radius = C.ROCK_RADIUS[r.size];
  ctx.rotate(r.spin);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle =
    r.flash > 0
      ? "#fff6de"
      : r.health < C.ROCK_HEALTH[r.size]
        ? "#cbb89c"
        : "#7895a8";
  ctx.fillStyle = r.flash > 0 ? "#6b6158" : "#142330";
  ctx.beginPath();
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2,
      rr = radius * (0.78 + 0.19 * (0.5 + 0.5 * Math.sin(r.id * 8 + i * 7)));
    const x = Math.cos(a) * rr,
      y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#304655";
  line(ctx, -radius * 0.5, -radius * 0.15, radius * 0.15, -radius * 0.5);
  line(ctx, radius * 0.15, -radius * 0.5, radius * 0.55, -radius * 0.1);
  const damage = C.ROCK_HEALTH[r.size] - r.health;
  if (damage) {
    ctx.strokeStyle = amber;
    for (let i = 0; i < damage; i++) {
      ctx.save();
      ctx.rotate(i * 2.1);
      ctx.beginPath();
      ctx.moveTo(-radius * 0.75, 0);
      ctx.lineTo(-radius * 0.2, -radius * 0.17);
      ctx.lineTo(radius * 0.08, radius * 0.2);
      ctx.lineTo(radius * 0.6, radius * 0.1);
      ctx.stroke();
      ctx.restore();
    }
  }
}
function bullet(ctx: CanvasRenderingContext2D, b: BulletState, color: string) {
  // Reverse the semi-implicit ballistic tick to reconstruct the recent curved path.
  let x = b.x,
    y = b.y,
    vx = b.vx,
    vy = b.vy;
  const path = [{ x, y }];
  const ticks = Math.min(
    C.TRAIL_TICKS,
    Math.round(
      ((color === cyan ? C.BULLET_LIFE : C.SAUCER_BULLET_LIFE) - b.life) /
        C.TICK_DT,
    ),
  );
  for (let i = 0; i < ticks; i++) {
    x -= vx * C.TICK_DT;
    y -= vy * C.TICK_DT;
    const dx = C.STAR_X - (((x % C.FIELD_W) + C.FIELD_W) % C.FIELD_W),
      dy = C.STAR_Y - (((y % C.FIELD_H) + C.FIELD_H) % C.FIELD_H),
      d = Math.hypot(dx, dy),
      k = d ? (C.MU / Math.max(d, C.SOFTEN) ** 2 / d) * C.TICK_DT : 0;
    vx -= dx * k;
    vy -= dy * k;
    path.push({ x, y });
  }
  for (let i = path.length - 1; i > 0; i--) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = (1 - i / path.length) * 0.65;
    ctx.lineWidth = (1 - i / path.length) * 3;
    line(
      ctx,
      path[i].x - b.x,
      path[i].y - b.y,
      path[i - 1].x - b.x,
      path[i - 1].y - b.y,
    );
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  circle(ctx, 0, 0, C.BULLET_R);
  ctx.fill();
  ctx.shadowBlur = 0;
}
export function render(s: View, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.save();
  ctx.textBaseline = "alphabetic";
  for (let i = 0; i < 190; i++) {
    const x = (i * 613.7) % C.FIELD_W,
      y = (i * 271.3) % C.FIELD_H;
    ctx.fillStyle = i % 9 === 0 ? "#698694" : "#283b4a";
    ctx.fillRect(x, y, i % 9 === 0 ? 1.7 : 1, 1);
  }
  ctx.strokeStyle = "#142532";
  ctx.lineWidth = 1;
  for (let x = 40; x < C.FIELD_W; x += 80) {
    for (let y = 40; y < C.FIELD_H; y += 80) {
      line(ctx, x - 2, y, x + 2, y);
      line(ctx, x, y - 2, x, y + 2);
    }
  }
  const halo = ctx.createRadialGradient(
    C.STAR_X,
    C.STAR_Y,
    C.CORE_R * 0.5,
    C.STAR_X,
    C.STAR_Y,
    C.HALO_R * 1.5,
  );
  halo.addColorStop(0, "#ffce8888");
  halo.addColorStop(0.24, "#ef9e4335");
  halo.addColorStop(0.65, "#e0902810");
  halo.addColorStop(1, "#e0902800");
  ctx.fillStyle = halo;
  circle(ctx, C.STAR_X, C.STAR_Y, C.HALO_R * 1.5);
  ctx.fill();
  ctx.strokeStyle = "#85613d55";
  for (const r of [C.CORE_R + 12, 76, 117, 160]) {
    circle(ctx, C.STAR_X, C.STAR_Y, r);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(C.STAR_X, C.STAR_Y);
  ctx.rotate(s.simTime * 0.08);
  ctx.strokeStyle = "#bc8c5155";
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6);
    line(ctx, 143, 0, 153, 0);
  }
  ctx.restore();
  const core = ctx.createRadialGradient(
    C.STAR_X - 8,
    C.STAR_Y - 8,
    1,
    C.STAR_X,
    C.STAR_Y,
    C.CORE_R,
  );
  core.addColorStop(0, "#fff9df");
  core.addColorStop(0.6, "#ffe4a5");
  core.addColorStop(1, "#f5aa59");
  ctx.fillStyle = core;
  ctx.shadowColor = "#ffc978";
  ctx.shadowBlur = 25;
  circle(ctx, C.STAR_X, C.STAR_Y, C.CORE_R);
  ctx.fill();
  ctx.shadowBlur = 0;
  if (s.screen === "title" || s.screen === "howto") {
    const decorative = [
      { x: 930, y: 190, size: "large" as const },
      { x: 1070, y: 500, size: "medium" as const },
      { x: 780, y: 610, size: "small" as const },
    ];
    for (const [i, r] of decorative.entries())
      copies(ctx, r, 50, () =>
        rock(ctx, {
          ...r,
          id: i + 4,
          vx: 0,
          vy: 0,
          spin: s.simTime * 0.06,
          health: C.ROCK_HEALTH[r.size],
          flash: 0,
        }),
      );
  } else {
    for (const r of s.rocks)
      copies(ctx, r, C.ROCK_RADIUS[r.size], () => rock(ctx, r));
    for (const b of s.bullets)
      copies(ctx, b, Math.hypot(b.vx, b.vy) * C.TRAIL_TICKS * C.TICK_DT, () =>
        bullet(ctx, b, cyan),
      );
    for (const b of s.enemyBullets)
      copies(ctx, b, 80, () => bullet(ctx, b, "#fa8b86"));
    for (const t of s.torpedoes)
      copies(ctx, t, 30, () => {
        ctx.rotate(t.heading);
        ctx.fillStyle = amber;
        ctx.shadowColor = amber;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(-7, 6);
        ctx.lineTo(-4, 0);
        ctx.lineTo(-7, -6);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = amber;
        line(ctx, -9, 0, -25, 0);
      });
    if (s.saucer)
      copies(ctx, s.saucer, C.SAUCER_R + 6, () => {
        ctx.strokeStyle = "#fa8b86";
        ctx.fillStyle = "#381f30";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 23, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -3, 10, Math.PI, 0);
        ctx.stroke();
        line(ctx, -18, 3, 18, 3);
      });
    if (s.lives > 0) {
      ctx.globalAlpha =
        s.ship.invuln > 0
          ? 0.35 + 0.65 * (Math.sin(s.simTime * 30) > 0 ? 1 : 0)
          : 1;
      copies(ctx, s.ship, 40, () => ship(ctx, s.ship, s.simTime));
      ctx.globalAlpha = 1;
      if (s.ship.invuln > 0) {
        ctx.strokeStyle = cyan + "66";
        circle(ctx, s.ship.x, s.ship.y, 26);
        ctx.stroke();
      }
    }
    if (s.score >= C.EXTRA_LIFE_STEP)
      text(ctx, "EXTRA SHIP EARNED", 40, 166, 12, cyan);
    text(ctx, "SCORE", 40, 35, 11, dim);
    text(ctx, String(s.score).padStart(6, "0"), 40, 68, 32, ink);
    for (let i = 0; i < s.lives - 1; i++) {
      ctx.save();
      ctx.translate(49 + i * 26, 91);
      ctx.scale(0.4, 0.4);
      ship(ctx, { ...s.ship, angle: C.FACE_UP, thrusting: false }, 0);
      ctx.restore();
    }
    text(
      ctx,
      "F  /  TORPEDO",
      40,
      125,
      11,
      s.torpedoCharge === 1 ? amber : dim,
    );
    ctx.fillStyle = "#263642";
    ctx.fillRect(40, 135, 110, 3);
    ctx.fillStyle = amber;
    ctx.fillRect(40, 135, 110 * s.torpedoCharge, 3);
    text(ctx, "WARHEAD", 1125, 35, 12, amber);
    text(ctx, `WAVE ${String(s.wave).padStart(2, "0")}`, 1125, 57, 13, dim);
    text(ctx, s.muted ? "M / SOUND OFF" : "M / SOUND ON", 1100, 687, 11, dim);
    if (s.waveBanner > 0) {
      ctx.textAlign = "center";
      text(ctx, `WAVE ${s.wave}`, C.STAR_X, 260, 36);
      text(ctx, "ANOTHER FIELD. ANOTHER CHANCE.", C.STAR_X, 291, 11, dim);
      ctx.textAlign = "left";
    }
  }
  if (s.screen === "title") {
    text(ctx, "01 / WARHEAD", 110, 152, 12, amber);
    text(ctx, C.TITLE_TEXT, 103, 267, 92, ink, "Arial Black, sans-serif");
    text(ctx, C.TAGLINE_TEXT, 110, 310, 15, cyan);
    text(ctx, "BEND THE SHOT. BREAK THE FIELD.", 110, 560, 12, dim);
    text(ctx, "A SINGLE SHIP IN A RESTLESS UNIVERSE", 110, 584, 11, dim);
  }
  if (s.screen === "howto") {
    ctx.fillStyle = "#080e18ed";
    ctx.fillRect(70, 80, 1130, 560);
    text(ctx, "FLIGHT MANUAL", 110, 137, 12, amber);
    text(ctx, "PLAY THE PULL", 110, 194, 42);
    const paragraphs = [
      "Break every rock through its fragments to clear the wave.",
      "The star bends bullets and rocks. Your ship holds its course.",
      "Swallowed rocks return from the edge. The core absorbs shots.",
      "Large rocks wear armor: watch for cracks as you chip them down.",
      "A saucer will come hunting. Shoot it before it shoots you.",
      "F launches a guided torpedo: nearest target in a narrow forward cone.",
      "It flies true through the well, kills any rock, and recharges in ten seconds.",
    ];
    paragraphs.forEach((p, i) => text(ctx, p, 110, 240 + i * 30, 16, ink));
    text(
      ctx,
      "ARROWS / WASD  TURN + THRUST     SPACE  FIRE     F  TORPEDO",
      110,
      503,
      15,
      cyan,
    );
    text(
      ctx,
      "ENTER  CONFIRM     ESC / P  PAUSE     M  SOUND",
      110,
      540,
      15,
      cyan,
    );
    text(ctx, "ENTER / ESC  RETURN TO MENU", 110, 594, 12, dim);
  }
  if (s.screen === "paused" || s.screen === "gameover") {
    ctx.fillStyle = "#080e18d9";
    ctx.fillRect(65, 160, 450, 420);
    text(
      ctx,
      s.screen === "paused" ? "FLIGHT HELD" : "SIGNAL LOST",
      110,
      244,
      38,
    );
    text(
      ctx,
      s.screen === "paused"
        ? "TAKE A BREATH. THE WELL CAN WAIT."
        : `SCORE ${s.score}   /   WAVE ${s.wave}`,
      110,
      293,
      13,
      dim,
    );
  }
  items(s).forEach((label, i) => {
    const r = menuRect(s, i)!;
    ctx.fillStyle = i === s.menuIndex ? "#15343e" : "#101d29";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = i === s.menuIndex ? cyan : "#2a3d4b";
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    text(ctx, label, r.x + 22, r.y + 32, 16, i === s.menuIndex ? cyan : dim);
    if (i === s.menuIndex) text(ctx, "↗", r.x + r.w - 34, r.y + 32, 20, cyan);
  });
  if (s.screen === "title") {
    text(ctx, "↑ ↓  SELECT     ENTER  CONFIRM", 110, 675, 11, dim);
    text(ctx, "SHATTER / 01", 1100, 675, 11, dim);
  }
  ctx.restore();
}
