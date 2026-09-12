// Drives the full demo path in a real browser. Also doubles as a smoke test:
// any page error or console error fails the run.  node scripts/shot.mjs
import { chromium } from "playwright";

const OUT = process.env.SHOT_DIR ?? "/tmp/careclosure-shots";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CLIP = { x: 0, y: 0, width: 1240, height: 500 };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1680, height: 1000 } });
const errs = [];
p.on("pageerror", (e) => errs.push(`PAGEERROR ${e.message}`));
p.on("console", (m) => m.type() === "error" && errs.push(`CONSOLE ${m.text()}`));

const reset = (episode) =>
  fetch(`${BASE}/api/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ episode }),
  });

await reset("amira");
await p.goto(BASE, { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/10-rail.png`, clip: CLIP });

await p.getByRole("button", { name: /Advance 1 day/ }).click();
await p.waitForTimeout(1400);
await p.screenshot({ path: `${OUT}/11-advanced.png`, clip: CLIP });

await p.getByRole("button", { name: /^✓ Approve$/ }).first().click();
await p.waitForTimeout(1500);
await p.getByRole("button", { name: /Workplaces/ }).click();
await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/12-workplace.png`, fullPage: true });

await p.getByRole("button", { name: /Ops latency/ }).click();
await p.waitForTimeout(1100);
await p.screenshot({ path: `${OUT}/13-ops.png`, fullPage: true });

await p.getByRole("button", { name: /Eleanor Chen/ }).click();
await p.waitForTimeout(2400);
await p.screenshot({ path: `${OUT}/14-eleanor.png`, clip: CLIP });

console.log(errs.length ? `FAILED:\n${errs.slice(0, 8).join("\n")}` : "clean: no page or console errors");
await b.close();
process.exit(errs.length ? 1 : 0);
