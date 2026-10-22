const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { buildSync } = require("esbuild");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "preview-dist");
fs.mkdirSync(output, { recursive: true });
buildSync({
  absWorkingDir: root,
  entryPoints: ["src/preview/index.tsx"],
  outfile: path.join(output, "app.js"),
  bundle: true,
  minify: true,
  platform: "browser",
  jsx: "automatic",
  define: { "process.env": '{"NODE_ENV":"production"}' },
  tsconfig: path.join(root, "tsconfig.json"),
});
execFileSync(
  process.execPath,
  [
    require.resolve("tailwindcss/lib/cli.js"),
    "-i",
    "src/app/globals.css",
    "-o",
    "preview-dist/app.css",
    "--minify",
  ],
  { cwd: root, stdio: "inherit" },
);
fs.writeFileSync(
  path.join(output, "index.html"),
  `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EXCOBA UAQ · Instructivo por temas</title><meta name="description" content="Todos los temas del instructivo oficial EXCOBA por asignatura."><link rel="stylesheet" href="./app.css"></head><body class="bg-paper font-body text-ink"><div id="root"></div><script defer src="./app.js"></script></body></html>\n`,
);
fs.writeFileSync(path.join(output, ".nojekyll"), "");
console.info("Vista de prueba compilada en preview-dist");
