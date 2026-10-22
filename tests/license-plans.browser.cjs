/* Local-only visual harness using production components, fake plans and no database.
 * EXCOBA_PLAYWRIGHT_MODULE points to an installed Playwright module. Never deploy tests.
 */
const { build } = require("esbuild");
const { createServer } = require("node:http");
const { readFileSync, readdirSync, mkdirSync } = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require(process.env.EXCOBA_PLAYWRIGHT_MODULE);
const root = path.resolve(__dirname, "..");
const careers = require("../src/content/careers.json").careers;
const output = path.join(root, "test-results-license-plans");

async function main() {
  const bundle = await build({
    stdin: { contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {LicenseAccessProvider,LicenseAccessBanner} from './src/components/license-access-provider';
      import {AlumnoNav} from './src/components/alumno-nav';
      import MiAccesoPage from './src/app/(alumno)/mi-acceso/page';
      import {StudyDashboard} from './src/components/study-dashboard';
      createRoot(document.getElementById('app')).render(
        <LicenseAccessProvider initialAccess={window.__PLAN__}>
          <AlumnoNav/><LicenseAccessBanner/>
          {location.pathname==='/estudio' ? <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="font-display text-3xl text-pizarron">Elegir carrera</h1><StudyDashboard subjects={[]}/></main> : <MiAccesoPage/>}
        </LicenseAccessProvider>);
    `, resolveDir: root, loader: "tsx" },
    absWorkingDir: root, bundle: true, write: false, platform: "browser", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "isolated-next-routing", setup(plugin) {
      plugin.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: "fixture" }));
      plugin.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({
        contents: args.path === "next/navigation"
          ? "export const useRouter=()=>({refresh(){},push(){}});"
          : "import React from 'react'; export default function Link({children,...props}){return React.createElement('a',props,children);}",
        resolveDir: root, loader: "js",
      }));
    } }],
  });
  const css = readdirSync(path.join(root, ".next/static/css")).filter(name => name.endsWith(".css"))
    .map(name => readFileSync(path.join(root, ".next/static/css", name), "utf8")).join("\n");
  let selectedCareerId = null;
  let writes = 0;
  const plan = months => ({ validityMonths: months, careerScope: months === 2 ? "SINGLE_CAREER" : "ALL_CAREERS",
    selectedCareerId: months === 2 ? selectedCareerId : null,
    careerSelectedAt: months === 2 && selectedCareerId ? "2026-09-30T18:00:00.000Z" : null,
    startsAt: "2026-09-30T18:00:00.000Z", expiresAt: months === 2 ? "2026-11-30T18:00:00.000Z" : "2027-01-30T18:00:00.000Z" });
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/bundle.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles[0].text); return; }
    if (url.pathname === "/style.css") { response.setHeader("Content-Type", "text/css"); response.end(css); return; }
    if (url.pathname === "/api/license-access/career" && request.method === "POST") {
      let body = ""; for await (const chunk of request) body += chunk;
      const requested = JSON.parse(body).careerId;
      response.setHeader("Content-Type", "application/json");
      if (selectedCareerId && requested !== selectedCareerId) { response.statusCode = 409; response.end(JSON.stringify({ error: "Carrera ya confirmada" })); return; }
      writes++; selectedCareerId = requested; response.end(JSON.stringify(plan(2))); return;
    }
    const months = url.searchParams.get("plan") === "4" ? 4 : 2;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>EXCOBA — prueba local</title></head><body class="bg-paper text-ink font-body antialiased"><div id="app"></div><script>window.__PLAN__=${JSON.stringify(plan(months))}</script><script src="/bundle.js"></script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  mkdirSync(output, { recursive: true });
  try {
    await page.goto(base + "/mi-acceso?plan=2");
    await page.getByRole("heading", { name: "Plan de 2 meses" }).waitFor();
    assert.match(await page.locator("main").innerText(), /30 de noviembre de 2026/);
    await page.screenshot({ path: path.join(output, "mi-acceso-2-meses-mobile.png"), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.goto(base + "/estudio?plan=2");
    await page.getByRole("combobox", { name: "Carrera", exact: true }).selectOption(careers[0].id);
    assert.equal(writes, 0, "Browsing a career must not save it");
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    assert.equal(writes, 0, "Cancelling must not consume choice");
    await page.getByRole("combobox", { name: "Carrera", exact: true }).selectOption(careers[0].id);
    await page.getByRole("button", { name: "Confirmar mi única carrera", exact: true }).click();
    await page.getByText(/Esta elección está vinculada a tu cuenta/).waitFor();
    assert.equal(writes, 1);
    assert.equal(await page.getByRole("combobox", { name: "Carrera", exact: true }).count(), 0);
    await page.reload();
    await page.getByText(/Esta elección está vinculada a tu cuenta/).waitFor();
    await page.goto(base + "/mi-acceso?plan=2");
    await page.getByText(careers[0].name, { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, "mi-acceso-2-meses-confirmado-mobile.png"), fullPage: true });
    await page.goto(base + "/estudio?plan=4");
    await page.getByRole("combobox", { name: "Carrera", exact: true }).selectOption(careers[0].id);
    await page.getByText(/Cambiar carrera/).click();
    await page.getByRole("combobox", { name: "Carrera", exact: true }).selectOption(careers[1].id);
    assert.equal(writes, 1, "Four-month switches do not lock the license");
    await page.goto(base + "/mi-acceso?plan=4");
    await page.getByRole("heading", { name: "Plan de 4 meses" }).waitFor();
    assert.match(await page.locator("main").innerText(), /30 de enero de 2027/);
    await page.screenshot({ path: path.join(output, "mi-acceso-4-meses-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: path.join(output, "mi-acceso-4-meses-desktop.png"), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.info(JSON.stringify({ ok: true, suite: "local-ui-isolated-no-real-codes", checks: ["two-plan-expiry", "single-confirmation", "cancel-preserves-choice", "locked-after-reload", "four-switches", "mobile-no-overflow", "desktop-no-overflow", "no-browser-errors"], output }));
  } finally { await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
