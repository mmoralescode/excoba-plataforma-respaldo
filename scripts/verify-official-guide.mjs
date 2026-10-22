import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const pdfs = process.argv.slice(2);
if (!pdfs.length)
  throw new Error("Uso: node scripts/verify-official-guide.mjs <PDF oficial> [otro PDF...]");
const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const curriculum = readJson("../src/content/curriculum.json");
const catalog = readJson("../src/content/careers.json");
const provenance = readJson("../src/content/career-sources.json");
const normalize = (text) => text.normalize("NFC").replace(/\s+/g, " ").trim();

assert.equal(catalog.careers.length, 122);
assert.equal(new Set(catalog.careers.map((c) => c.id)).size, 122);
assert.deepEqual(Object.keys(provenance.careers).sort(), catalog.careers.map((c) => c.id).sort());
for (const career of catalog.careers) {
  const evidence = provenance.careers[career.id];
  assert.ok(provenance.sources[evidence.sourceId], `Fuente desconocida: ${career.id}`);
  assert.equal(new Set(career.subjectIds).size, 3);
  assert.deepEqual(career.subjectIds, provenance.groups[evidence.groupId].subjectIds, career.name);
  assert.ok(
    career.subjectIds.every(
      (id) => id.startsWith("3.") && curriculum.subjects.some((s) => s.id === id),
    ),
  );
}

for (const pdf of pdfs) {
  const hash = createHash("sha256").update(readFileSync(pdf)).digest("hex");
  const sourceEntry = Object.entries(provenance.sources).find(
    ([, source]) => source.sha256 === hash,
  );
  assert.ok(sourceEntry, "El PDF no corresponde a ninguna fuente registrada.");
  const [sourceId, source] = sourceEntry;
  const raw = execFileSync("pdftotext", ["-layout", pdf, "-"], {
    encoding: "utf8",
    maxBuffer: 5_000_000,
  });
  const pages = raw.split("\f");
  const records = Object.values(provenance.careers)
    .flatMap((record) => [record, ...(record.previousSource ? [record.previousSource] : [])])
    .filter((record) => record.sourceId === sourceId);
  assert.equal(records.length, source.optionCount ?? source.usedOptionCount);
  for (const record of records) {
    const page = pages[record.page + source.pdfPageOffset - 1];
    assert.ok(
      page && normalize(page).includes(normalize(record.sourceName)),
      `Carrera no encontrada en página ${record.page}: ${record.sourceName}`,
    );
  }
  console.log(
    `${sourceId}: ${records.length} opciones verificadas contra el PDF, SHA256 y página de procedencia correctos.`,
  );

  if (hash === curriculum.sha256) {
    const headings = [...raw.matchAll(/^(\d\.\d+\.\d+(?:\.\d+)?)\.\s+/gm)].map((m) => m[1]);
    const leaves = headings.filter(
      (code) => !headings.some((other) => other.startsWith(code + ".")),
    );
    assert.deepEqual(
      [...leaves].sort(),
      curriculum.topics.map((topic) => topic.id).sort(),
      "Faltan temas o sobran códigos.",
    );
    const clean = normalize(raw.replace(/^\s*Página\s*\|\s*\d+\s*$/gm, ""));
    for (const topic of curriculum.topics) {
      assert.ok(
        clean.includes(normalize(topic.name)),
        `Texto de tema diferente al PDF: ${topic.id}`,
      );
    }
    console.log(
      `Temario: ${leaves.length}/209 temas y sus descripciones, ${curriculum.subjects.length}/14 asignaturas verificados.`,
    );
  }
}
console.log(
  "Los grupos de tres áreas se cotejaron visualmente; ver docs/uaq-career-mapping-2026.md.",
);
