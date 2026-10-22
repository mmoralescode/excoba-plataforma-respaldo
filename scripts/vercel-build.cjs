"use strict";

// Maintenance is explicit, build-only, and ALWAYS stops before publishing.
// No operation endpoint or credential is ever shipped to the browser.
const { spawnSync } = require("node:child_process");
function run(script, args = []) {
  const result = spawnSync(process.execPath, [require.resolve(script), ...args], {
    stdio: "inherit", shell: false, windowsHide: true,
  });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
const operation = process.env.EXCOBA_LICENSE_OPERATION;
if (operation) {
  if (operation === "inspect") {
    run("tsx/cli", ["scripts/license-plans-preflight.ts"]);
  } else if (["apply", "verify"].includes(operation)) {
    run("tsx/cli", ["scripts/license-plan-batch.ts", operation, "--file", "operations/license-plans-2026-09-30.hashes.json"]);
  } else {
    throw new Error("UNKNOWN_LICENSE_OPERATION");
  }
  console.info("MAINTENANCE_COMPLETE_INTENTIONALLY_NO_DEPLOYMENT");
  process.exit(1);
}
run("prisma/build/index.js", ["migrate", "deploy"]);
// Optional read-only acceptance check for this release; never issues codes.
if (process.env.EXCOBA_VERIFY_LICENSE_BATCH === "1") {
  run("tsx/cli", ["scripts/license-plan-batch.ts", "verify", "--file", "operations/license-plans-2026-09-30.hashes.json"]);
  run("tsx/cli", ["scripts/license-plans-preflight.ts"]);
}
run("tsx/cli", ["prisma/import-content.ts"]);
run("next/dist/bin/next", ["build"]);
