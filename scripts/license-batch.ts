import { randomUUID } from "node:crypto";
import { readFile, writeFile, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { generateLicenseFolio, hashToken } from "../src/lib/security/tokens";
import { addCalendarMonths } from "../src/lib/license-validity";

// Explicit operator command only. Never imported by the website or run by default.
const recordSchema = z
  .object({
    id: z.string().uuid(),
    codeHash: z.string().regex(/^[a-f0-9]{64}$/),
    codeLastFour: z.string().regex(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/),
  })
  .strict();
const manifestSchema = z
  .object({
    version: z.literal(1),
    batchId: z.string().uuid(),
    productId: z.string().min(1),
    adminId: z.string().uuid(),
    validityMonths: z.literal(6),
    records: z.array(recordSchema).length(30),
  })
  .strict();

function option(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error("MISSING_OPTION");
  return process.argv[index + 1]!;
}

async function main() {
  const command = process.argv[2];
  // Retired product. Keep historical verification tooling, never issue/reissue it.
  if (command === "prepare" || command === "apply") {
    throw new Error("SIX_MONTH_LICENSES_RETIRED_USE_LICENSE_PLAN_BATCH");
  }
  const file = path.resolve(option("--file"));
  if (command === "prepare") {
    const parent = await realpath(path.dirname(file));
    const repository = await realpath(path.resolve(__dirname, ".."));
    const relative = path.relative(repository.toLowerCase(), parent.toLowerCase());
    if (
      !relative ||
      (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative))
    ) {
      throw new Error("PRIVATE_FILE_MUST_BE_OUTSIDE_REPOSITORY");
    }
    const used = new Set<string>();
    const privateRecords = Array.from({ length: 30 }, () => {
      let folio: string;
      do {
        folio = generateLicenseFolio();
      } while (used.has(folio));
      used.add(folio);
      return { id: randomUUID(), folio, codeHash: hashToken(folio), codeLastFour: folio.slice(-4) };
    });
    const manifest = manifestSchema.parse({
      version: 1,
      batchId: randomUUID(),
      productId: option("--product"),
      adminId: option("--admin"),
      validityMonths: 6,
      records: privateRecords.map(({ folio: _folio, ...record }) => record),
    });
    // Persist recoverable plaintext BEFORE any DB operation. Never overwrite a batch.
    await writeFile(
      file,
      JSON.stringify({ ...manifest, records: privateRecords }, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    await writeFile(file + ".hashes.json", JSON.stringify(manifest, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    const csv =
      "\uFEFFNumero,Folio,Vigencia,Inicio,Usuarios permitidos\r\n" +
      privateRecords
        .map(
          (record, index) =>
            `${index + 1},${record.folio},6 meses naturales,Al completar la activacion,1`,
        )
        .join("\r\n") +
      "\r\n";
    await writeFile(file + ".csv", csv, { flag: "wx", mode: 0o600 });
    console.info(
      JSON.stringify({
        operation: "prepared_not_issued",
        batchId: manifest.batchId,
        count: 30,
        privateFile: file,
      }),
    );
    return;
  }
  if (command !== "apply" && command !== "verify") throw new Error("INVALID_COMMAND");
  const manifest = manifestSchema.parse(JSON.parse(await readFile(file, "utf8")));
  if (
    new Set(manifest.records.map((record) => record.id)).size !== 30 ||
    new Set(manifest.records.map((record) => record.codeHash)).size !== 30
  )
    throw new Error("DUPLICATE_MANIFEST_RECORD");
  const reference = `six-month-batch:${manifest.batchId}`;
  const db = new PrismaClient({ log: [] });
  try {
    const result = await db.$transaction(
      async (tx) => {
        // Serializes retries of this exact batch, including concurrent deployments.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${reference}))::text`;
        const existing = await tx.license.findMany({ where: { purchaseReference: reference } });
        if (existing.length) {
          if (
            existing.length !== 30 ||
            existing.some((license) => {
              const record = manifest.records.find((item) => item.id === license.id);
              const invalidDates = license.activatedAt
                ? license.startsAt?.getTime() !== license.activatedAt.getTime() ||
                  license.expiresAt?.getTime() !==
                    addCalendarMonths(license.activatedAt, 6).getTime() ||
                  !license.userId
                : license.startsAt !== null ||
                  license.expiresAt !== null ||
                  license.userId !== null;
              return (
                invalidDates ||
                !record ||
                record.codeHash !== license.codeHash ||
                record.codeLastFour !== license.codeLastFour ||
                license.productId !== manifest.productId ||
                license.validityMonths !== 6 ||
                license.maxActivations !== 1 ||
                license.createdByAdminId !== manifest.adminId
              );
            })
          )
            throw new Error("EXISTING_BATCH_MISMATCH");
          return {
            created: 0,
            verified: 30,
            pendingActivation: existing.filter((license) => !license.activatedAt).length,
          };
        }
        if (command === "verify") throw new Error("BATCH_NOT_ISSUED");
        const product = await tx.product.findUnique({ where: { id: manifest.productId } });
        const admin = await tx.user.findFirst({
          where: {
            id: manifest.adminId,
            status: "ACTIVO",
            deletedAt: null,
            roles: { some: { role: { name: { in: ["SUPER_ADMIN", "SOPORTE"] } } } },
          },
          select: { id: true },
        });
        if (!product?.isActive || !admin) throw new Error("INVALID_PRODUCT_OR_ADMIN");
        await tx.license.createMany({
          data: manifest.records.map((record) => ({
            ...record,
            productId: manifest.productId,
            createdByAdminId: manifest.adminId,
            purchaseReference: reference,
            validityMonths: 6,
            maxActivations: 1,
            status: "CREADA",
            userId: null,
            startsAt: null,
            activatedAt: null,
            expiresAt: null,
          })),
        });
        await tx.licenseEvent.createMany({
          data: manifest.records.map((record) => ({
            licenseId: record.id,
            type: "CREACION",
            adminId: manifest.adminId,
            reason: "Folio individual de seis meses naturales desde activación.",
          })),
        });
        await tx.auditLog.create({
          data: {
            actorId: manifest.adminId,
            action: "LICENSE_BATCH_CREATED",
            entity: "LicenseBatch",
            entityId: manifest.batchId,
            metadata: { count: 30, validityMonths: 6, maxActivations: 1 },
          },
        });
        return { created: 30, verified: 30, pendingActivation: 30 };
      },
      { timeout: 30000 },
    );
    console.info(JSON.stringify({ operation: command, batchId: manifest.batchId, ...result }));
  } finally {
    await db.$disconnect();
  }
}

main().catch(() => {
  // Prisma errors can contain connection details; never print the error object.
  console.error(
    "[license-batch] Operation failed. No credentials or folios logged. Check the manifest and database configuration; retry the SAME manifest only.",
  );
  process.exitCode = 1;
});
