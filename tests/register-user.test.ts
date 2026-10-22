import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { ActivationLicense } from "@/lib/license-validity";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), password: vi.fn() }));
vi.mock("@/db/client", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/lib/security/password", () => ({ hashPassword: mocks.password }));
import { registerUser, RegisterInputSchema } from "@/server/use-cases/register-user";
import { hashToken } from "@/lib/security/tokens";
import { hashRecoveryCode, isRecoveryCode } from "@/lib/security/recovery-code";

const folio = "EXCOBA-AAAA-BBBB-CCCC-DDDD";
const licenseId = "00000000-0000-4000-8000-000000000002";
const now = new Date("2026-08-31T15:04:05.123Z");
const input = {
  name: "Student",
  email: "Student@Example.test",
  password: "a-secure-password",
  licenseId,
  folio,
};
type StoredLicense = ActivationLicense & { id: string; codeHash: string };
type UserData = {
  recoveryCodeHash: string;
  recoveryCodeCreatedAt: Date;
  email: string;
  passwordHash: string;
  name: string;
  roles: { create: { roleId: string } };
};
type StoredUser = UserData & { id: string };
type DatePredicate = Date | null | { gt?: Date; lte?: Date };
type DateFilter = { expiresAt?: DatePredicate; startsAt?: DatePredicate };
type Claim = {
  where: {
    id: string;
    codeHash: string;
    userId?: null;
    activatedAt?: null;
    status: { in: string[] };
    validityMonths?: number | null;
    startsAt?: Date | null;
    expiresAt?: Date | null;
    AND?: { OR: DateFilter[] }[];
  };
  data: Partial<StoredLicense>;
};
const sameDate = (a: Date | null | undefined, b: Date | null | undefined) =>
  a?.getTime() === b?.getTime();

function fakeDatabase(
  options: {
    license?: Partial<StoredLicense>;
    synchronizeReads?: boolean;
    afterUserCreate?: () => void;
    eventFailure?: boolean;
    emailCollision?: boolean;
  } = {},
) {
  let license: StoredLicense = {
    id: licenseId,
    codeHash: hashToken(folio),
    userId: null,
    status: "CREADA",
    startsAt: null,
    activatedAt: null,
    expiresAt: null,
    validityMonths: 4,
    ...options.license,
  };
  const users: StoredUser[] = [];
  const events: unknown[] = [];
  const claims: Claim[] = [];
  let readCount = 0;
  let nextId = 0;
  let releaseReads!: () => void;
  const readsReady = new Promise<void>((resolve) => {
    releaseReads = resolve;
  });
  const event = vi.fn();

  const matchesDate = (value: Date | null, predicate: DatePredicate) => {
    if (predicate === null || predicate instanceof Date) return sameDate(value, predicate);
    return Boolean(
      value &&
      (!predicate.gt || value > predicate.gt) &&
      (!predicate.lte || value <= predicate.lte),
    );
  };
  mocks.transaction.mockImplementation(async (callback) => {
    const pendingUsers: StoredUser[] = [];
    const pendingEvents: unknown[] = [];
    let original: StoredLicense | undefined;
    let claimedUser: string | undefined;
    const tx = {
      license: {
        findUnique: vi.fn(async () => {
          const snapshot = { ...license };
          if (options.synchronizeReads) {
            readCount += 1;
            if (readCount === 2) releaseReads();
            await readsReady;
          }
          return snapshot;
        }),
        updateMany: vi.fn(async (claim: Claim) => {
          claims.push(claim);
          const where = claim.where;
          const eligible =
            where.id === license.id &&
            where.codeHash === license.codeHash &&
            (where.userId !== null || license.userId === null) &&
            (where.activatedAt !== null || license.activatedAt === null) &&
            where.status.in.includes(license.status) &&
            where.validityMonths === license.validityMonths &&
            sameDate(where.startsAt, license.startsAt) &&
            sameDate(where.expiresAt, license.expiresAt) &&
            (where.AND ?? []).every((and) =>
              and.OR.some(
                (or) =>
                  (or.expiresAt === undefined || matchesDate(license.expiresAt, or.expiresAt)) &&
                  (or.startsAt === undefined || matchesDate(license.startsAt, or.startsAt)),
              ),
            );
          if (!eligible) return { count: 0 };
          original = { ...license };
          license = { ...license, ...claim.data };
          claimedUser = license.userId ?? undefined;
          return { count: 1 };
        }),
      },
      role: { findUniqueOrThrow: vi.fn(async () => ({ id: "role-alumno", name: "ALUMNO" })) },
      user: {
        create: vi.fn(async ({ data }: { data: UserData }) => {
          if (options.emailCollision)
            throw new Prisma.PrismaClientKnownRequestError("Unique email", {
              code: "P2002",
              clientVersion: "test",
              meta: { target: ["email"] },
            });
          const created = { ...data, id: "user-" + ++nextId };
          pendingUsers.push(created);
          options.afterUserCreate?.();
          return created;
        }),
      },
      licenseEvent: {
        create: vi.fn(async (args: unknown) => {
          event(args);
          if (options.eventFailure) throw new Error("Event write failed");
          pendingEvents.push(args);
          return args;
        }),
      },
    };
    try {
      const result = await callback(tx);
      users.push(...pendingUsers);
      events.push(...pendingEvents);
      return result;
    } catch (error) {
      if (original && license.userId === claimedUser) license = original;
      throw error;
    }
  });
  return { users, events, claims, event, license: () => license };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  mocks.password.mockResolvedValue("hashed-password");
});
afterEach(() => vi.useRealTimers());

describe("Registro con reclamo exclusivo de licencia", () => {
  it("descarta cualquier permiso del buzón o rol enviado en el registro", async () => {
    const store = fakeDatabase();
    const tampered = { ...input, canReviewFeedback: true, roles: ["SUPER_ADMIN"] };
    expect(RegisterInputSchema.parse(tampered)).not.toHaveProperty("canReviewFeedback");
    await registerUser(tampered);
    expect(store.users[0]).not.toHaveProperty("canReviewFeedback");
    expect(store.users[0]!.roles).toEqual({ create: { roleId: "role-alumno" } });
  });
  it("no admite registrar solamente un UUID sin demostrar posesión del folio", async () => {
    const { folio: ignored, ...withoutSecret } = input;
    expect(ignored).toBe(folio);
    expect(RegisterInputSchema.safeParse(withoutSecret).success).toBe(false);
    const store = fakeDatabase();
    await expect(registerUser({ ...input, folio: "EXCOBA-WRNG-WRNG-WRNG-WRNG" })).rejects.toThrow(
      "No fue posible completar",
    );
    expect(store.users).toHaveLength(0);
    expect(store.claims).toHaveLength(0);
  });

  it("crea usuario ALUMNO y activa la licencia por cuatro meses calendario", async () => {
    const store = fakeDatabase();
    const user = await registerUser({ ...input, folio: "  " + folio.toLowerCase() + "  " });
    expect(user.email).toBe("student@example.test");
    expect(isRecoveryCode(user.recoveryCode)).toBe(true);
    expect(store.users[0]!.recoveryCodeHash).toBe(hashRecoveryCode(user.recoveryCode));
    expect(store.users[0]!.recoveryCodeCreatedAt).toEqual(now);
    expect(JSON.stringify(store.users)).not.toContain(user.recoveryCode);
    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("recoveryCodeHash");
    expect(store.users[0]!.roles).toEqual({ create: { roleId: "role-alumno" } });
    expect(store.license()).toMatchObject({
      userId: user.id,
      status: "ACTIVADA",
      activatedAt: now,
      startsAt: now,
      expiresAt: new Date("2026-12-31T15:04:05.123Z"),
    });
    expect(store.events).toHaveLength(1);
    expect(store.claims[0]!.where).toMatchObject({
      id: licenseId,
      codeHash: hashToken(folio),
      userId: null,
      activatedAt: null,
      status: { in: ["CREADA", "ASIGNADA"] },
    });
    expect(JSON.stringify(store.users)).not.toContain(folio);
  });

  it("dos registros que leen el mismo folio libre producen exactamente un ganador", async () => {
    const store = fakeDatabase({ synchronizeReads: true });
    const outcomes = await Promise.allSettled([
      registerUser({ ...input, email: "first@example.test" }),
      registerUser({ ...input, email: "second@example.test" }),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(store.claims).toHaveLength(2);
    expect(store.users).toHaveLength(1);
    expect(store.events).toHaveLength(1);
    expect(store.license().userId).toBe(store.users[0]!.id);
  });

  it("un folio activado no puede registrar un segundo usuario", async () => {
    const store = fakeDatabase();
    const first = await registerUser(input);
    await expect(registerUser({ ...input, email: "second@example.test" })).rejects.toThrow();
    expect(store.users).toHaveLength(1);
    expect(store.license().userId).toBe(first.id);
  });

  it("revalida vencimiento después de la validación preliminar y del hash de contraseña", async () => {
    const store = fakeDatabase({
      license: { validityMonths: null, expiresAt: new Date(now.getTime() + 1000) },
    });
    mocks.password.mockImplementation(async () => {
      vi.setSystemTime(new Date(now.getTime() + 2000));
      return "hash";
    });
    await expect(registerUser(input)).rejects.toThrow();
    expect(store.users).toHaveLength(0);
    expect(store.claims).toHaveLength(0);
  });

  it("si vence entre la lectura y el CAS, revierte también el usuario y su rol", async () => {
    const store = fakeDatabase({
      license: { validityMonths: null, expiresAt: new Date(now.getTime() + 1000) },
      afterUserCreate: () => vi.setSystemTime(new Date(now.getTime() + 2000)),
    });
    await expect(registerUser(input)).rejects.toThrow();
    expect(store.claims).toHaveLength(1);
    expect(store.users).toHaveLength(0);
    expect(store.events).toHaveLength(0);
    expect(store.license().userId).toBeNull();
  });

  it("conserva las fechas originales de una licencia anterior", async () => {
    const startsAt = new Date("2026-01-01T00:00:00Z");
    const expiresAt = new Date("2026-10-01T00:00:00Z");
    const store = fakeDatabase({ license: { validityMonths: null, startsAt, expiresAt } });
    await registerUser(input);
    expect(store.license().startsAt).toEqual(startsAt);
    expect(store.license().expiresAt).toEqual(expiresAt);
    expect(store.claims[0]!.data).not.toHaveProperty("startsAt");
    expect(store.claims[0]!.data).not.toHaveProperty("expiresAt");
  });

  it("un error del evento revierte cuenta y activación juntas", async () => {
    const store = fakeDatabase({ eventFailure: true });
    await expect(registerUser(input)).rejects.toThrow("Event write failed");
    expect(store.event).toHaveBeenCalledTimes(1);
    expect(store.users).toHaveLength(0);
    expect(store.events).toHaveLength(0);
    expect(store.license().userId).toBeNull();
    expect(store.license().activatedAt).toBeNull();
  });

  it("una colisión de correo devuelve el mismo error genérico sin consumir folio", async () => {
    const store = fakeDatabase({ emailCollision: true });
    await expect(registerUser(input)).rejects.toThrow("No fue posible completar");
    expect(store.license().userId).toBeNull();
    expect(store.users).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });

  it("limita las contraseñas a 128 caracteres", () => {
    expect(RegisterInputSchema.safeParse({ ...input, password: "x".repeat(129) }).success).toBe(
      false,
    );
  });
});
