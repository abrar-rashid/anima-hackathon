// Screenshots the other attempt's surfaces for side-by-side comparison.
// node scripts/compare-shot.mjs
import { chromium } from "playwright";

const OUT = process.env.SHOT_DIR ?? "/tmp/careclosure-shots";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1680, height: 1000 } });
const errs = [];
p.on("pageerror", (e) => errs.push(`PAGEERROR ${e.message}`));
p.on("console", (m) => m.type() === "error" && errs.push(`CONSOLE ${m.text().slice(0, 200)}`));

for (const [path, name] of [
  ["/", "m1-home"],
  ["/world", "m2-world"],
  ["/case/SIM-000001", "m3-case"],
]) {
  try {
    const r = await p.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 30000 });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    console.log(`${path} -> ${r?.status()} -> ${name}.png`);
  } catch (e) {
    console.log(`${path} -> FAILED ${e.message.slice(0, 120)}`);
  }
}

console.log(errs.length ? `\nerrors:\n${errs.slice(0, 10).join("\n")}` : "\nno page errors");
await b.close();
