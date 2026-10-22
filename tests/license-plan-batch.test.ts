import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { planManifestSchema, validateIssuedBatch } from "../scripts/license-plan-batch";
import { addCalendarMonths } from "../src/lib/license-validity";

function manifest() {
  return planManifestSchema.parse({
    version: 2, batchId: randomUUID(), productId: "product", adminId: randomUUID(),
    expectedRetiredCount: 70, expectedActivatedRetiredCount: 2,
    records: Array.from({ length: 20 }, (_, index) => ({
      id: randomUUID(), codeHash: (index + 1).toString(16).padStart(64, "0"), codeLastFour: "ABCD",
      validityMonths: index < 10 ? 4 : 2, careerScope: index < 10 ? "ALL_CAREERS" : "SINGLE_CAREER",
    })),
  });
}
function issued(batch: ReturnType<typeof manifest>) {
  return batch.records.map(record => ({ ...record, productId: batch.productId, createdByAdminId: batch.adminId,
    maxActivations: 1, status: "CREADA", activatedAt: null as Date | null, startsAt: null as Date | null,
    expiresAt: null as Date | null, userId: null as string | null, selectedCareerId: null, careerSelectedAt: null,
  }));
}

describe("private two/four month batch contract", () => {
  it("accepts exactly ten unused codes for each plan", () => {
    const batch = manifest();
    expect(() => validateIssuedBatch(batch, issued(batch))).not.toThrow();
  });
  it.each([6, 1, 3, 12])("rejects unsupported month term %i", months => {
    const batch = manifest();
    expect(planManifestSchema.safeParse({ ...batch, records: batch.records.map((record, i) => i === 0 ? { ...record, validityMonths: months } : record) }).success).toBe(false);
  });
  it("rejects scope-duration mismatch", () => {
    const batch = manifest();
    batch.records[0]!.careerScope = "SINGLE_CAREER";
    expect(planManifestSchema.safeParse(batch).success).toBe(false);
  });
  it("rejects duplicate ids or hashes and unbalanced batches", () => {
    const batch = manifest();
    batch.records[1]!.id = batch.records[0]!.id;
    expect(planManifestSchema.safeParse(batch).success).toBe(false);
    const other = manifest();
    other.records[1]!.codeHash = other.records[0]!.codeHash;
    expect(planManifestSchema.safeParse(other).success).toBe(false);
    const unbalanced = manifest();
    unbalanced.records[0]!.validityMonths = 2;
    unbalanced.records[0]!.careerScope = "SINGLE_CAREER";
    expect(planManifestSchema.safeParse(unbalanced).success).toBe(false);
  });
  it("rejects plaintext in the deployment manifest", () => {
    const batch = manifest();
    expect(planManifestSchema.safeParse({ ...batch, records: batch.records.map(record => ({ ...record, folio: "PRIVATE" })) }).success).toBe(false);
  });
  it("rejects altered retirement count so preflight approval is explicit", () => {
    expect(planManifestSchema.safeParse({ ...manifest(), expectedRetiredCount: 71 }).success).toBe(false);
  });
  it("rejects shortened batch, tampered hash and prematurely started term", () => {
    const batch = manifest();
    expect(() => validateIssuedBatch(batch, issued(batch).slice(1))).toThrow();
    const wrongHash = issued(batch);
    wrongHash[0]!.codeHash = "f".repeat(64);
    expect(() => validateIssuedBatch(batch, wrongHash)).toThrow();
    const alreadyStarted = issued(batch);
    alreadyStarted[0]!.startsAt = new Date();
    expect(() => validateIssuedBatch(batch, alreadyStarted)).toThrow();
  });
  it("verifies activated dates as calendar months, not fixed day counts", () => {
    const batch = manifest();
    const rows = issued(batch);
    const start = new Date("2026-12-31T15:00:00.000Z");
    for (const row of rows) {
      row.status = "ACTIVADA"; row.userId = randomUUID(); row.activatedAt = start;
      row.startsAt = start; row.expiresAt = addCalendarMonths(start, row.validityMonths);
    }
    expect(rows[10]!.expiresAt!.toISOString()).toBe("2027-02-28T15:00:00.000Z");
    expect(() => validateIssuedBatch(batch, rows)).not.toThrow();
    rows[0]!.status = "REVOCADA";
    expect(() => validateIssuedBatch(batch, rows)).toThrow();
    rows[0]!.status = "ACTIVADA";
    rows[10]!.expiresAt = new Date("2027-03-03T15:00:00.000Z");
    expect(() => validateIssuedBatch(batch, rows)).toThrow();
  });
  it.each(["REVOCADA", "CANCELADA", "SUSPENDIDA"])("does not verify an activated but unusable code with status %s", status => {
    const batch = manifest();
    const rows = issued(batch);
    const row = rows[0]!;
    row.userId = randomUUID();
    row.activatedAt = new Date("2026-09-30T15:00:00.000Z");
    row.startsAt = row.activatedAt;
    row.expiresAt = addCalendarMonths(row.activatedAt, row.validityMonths);
    row.status = status;
    expect(() => validateIssuedBatch(batch, rows)).toThrow("ISSUED_BATCH_MISMATCH");
  });
});
