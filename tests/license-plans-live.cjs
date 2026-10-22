/** Read-only live acceptance: validates folios but NEVER registers or activates a user.
 * Secret files stay local. Do not enable Playwright traces/network logging.
 */
const { readFileSync, mkdirSync } = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");
const assert = require("node:assert/strict");

async function main() {
  const origin = "https://excoba-plataforma.vercel.app";
  const batch = JSON.parse(readFileSync(process.env.EXCOBA_PRIVATE_BATCH_FILE, "utf8"));
  assert.equal(batch.records.length, 20);
  const activation = await fetch(origin + "/activar");
  assert.equal(activation.status, 200);
  assert.match(await activation.text(), /Hay dos planes/);
  for (const record of batch.records) {
    assert.equal(createHash("sha256").update(record.folio).digest("hex"), record.codeHash);
    const response = await fetch(origin + "/api/licenses/activate", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ folio: record.folio }),
    });
    assert.equal(response.status, 200, "A new folio did not validate");
    const preview = await response.json();
    assert.equal(preview.licenseId, record.id);
    assert.equal(preview.validityMonths, record.validityMonths);
    assert.equal(preview.careerScope, record.careerScope);
    assert.equal(preview.startsAt, null);
    assert.equal(preview.expiresAt, null);
  }
  if (process.env.EXCOBA_RETIRED_BATCH_FILE) {
    const retired = JSON.parse(readFileSync(process.env.EXCOBA_RETIRED_BATCH_FILE, "utf8"));
    const response = await fetch(origin + "/api/licenses/activate", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ folio: retired.records.at(-1).folio }),
    });
    assert.equal(response.status, 400, "A retired six-month folio remains available");
  }
  assert.equal((await fetch(origin + "/api/license-access")).status, 401);
  assert.equal((await fetch(origin + "/api/license-access/career", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: '{}' })).status, 401);
  const privatePage = await fetch(origin + "/mi-acceso", { redirect: "manual" });
  assert.equal(privatePage.status, 307);
  assert.match(privatePage.headers.get("location"), /\/login\?/);
  const { chromium } = require(process.env.EXCOBA_PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const output = path.join(__dirname, "../test-results-license-plans");
  mkdirSync(output, { recursive: true });
  try {
    for (const months of [2, 4]) {
      const record = batch.records.find(item => item.validityMonths === months);
      await page.goto(origin + "/activar");
      await page.getByLabel("Folio", { exact: true }).fill(record.folio);
      await page.getByRole("button", { name: "Continuar", exact: true }).click();
      await page.getByRole("heading", { name: "Crea tu cuenta", exact: true }).waitFor();
      const text = await page.locator("main").innerText();
      assert.match(text, new RegExp(`Tu plan: ${months} meses`));
      assert.match(text, months === 2 ? /Una sola carrera/ : /Todas las carreras/);
      assert.equal(text.includes(record.folio), false, "Never capture a screenshot with a plaintext folio");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(output, `live-activar-${months}-meses-mobile.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.info(JSON.stringify({ ok: true, origin, newCodesValidated: 20, codesActivated: 0, retiredCodeRejected: true, authenticatedRoutesProtected: true, liveUiPlans: [2, 4], browserErrors: 0 }));
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
