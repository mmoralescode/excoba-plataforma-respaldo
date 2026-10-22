/**
 * Explicit, one-time operator command. Never import this file from the app or
 * add it to the normal build/seed. FEEDBACK_REVIEWER_EMAILS must be a JSON array.
 * Default: read-only preflight. Mutation requires the literal --apply argument.
 * Run: tsx scripts/grant-feedback-reviewers.ts [--apply]
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { canAccessPlatform } from "../src/lib/license-access";

const reviewerSelect = {
  id: true,
  email: true,
  status: true,
  deletedAt: true,
  canReviewFeedback: true,
  roles: { select: { role: { select: { name: true } } } },
  license: {
    select: { userId: true, status: true, startsAt: true, expiresAt: true },
  },
} satisfies Prisma.UserSelect;

type Candidate = Prisma.UserGetPayload<{ select: typeof reviewerSelect }>;
type Client = Pick<PrismaClient, "user" | "$transaction">;
type Mode = "dry-run" | "apply";
export type FeedbackReviewerGrantReport = {
  mode: Mode;
  accounts: Array<{ email: string; canReviewFeedback: boolean }>;
  missingEmails: string[];
  unavailableEmails: string[];
};

export class FeedbackReviewerConfigurationError extends Error {
  constructor() {
    super(
      "Configuración inválida: proporciona una lista JSON de correos únicos y usa solo --apply para confirmar.",
    );
    this.name = "FeedbackReviewerConfigurationError";
  }
}

export class FeedbackReviewerGrantError extends Error {
  constructor(public readonly report: FeedbackReviewerGrantReport) {
    super("No se concedió ningún permiso: revisa las cuentas solicitadas.");
    this.name = "FeedbackReviewerGrantError";
  }
}

function validateEmails(value: unknown): string[] {
  const parsed = z
    .array(z.string().trim().toLowerCase().email().max(254))
    .min(1)
    .max(20)
    .safeParse(value);
  if (!parsed.success || new Set(parsed.data).size !== parsed.data.length) {
    throw new FeedbackReviewerConfigurationError();
  }
  return parsed.data;
}

export function parseFeedbackReviewerEmails(value: string | undefined): string[] {
  let input: unknown;
  try {
    input = JSON.parse(value ?? "");
  } catch {
    throw new FeedbackReviewerConfigurationError();
  }
  return validateEmails(input);
}

function lookup(emails: readonly string[]) {
  return {
    where: {
      OR: emails.map((email) => ({ email: { equals: email, mode: "insensitive" as const } })),
    },
    select: reviewerSelect,
  };
}

function resolveAccounts(rows: Candidate[], emails: string[], mode: Mode, now: Date) {
  const accounts: Array<{ email: string; user: Candidate }> = [];
  const report: FeedbackReviewerGrantReport = {
    mode,
    accounts: [],
    missingEmails: [],
    unavailableEmails: [],
  };
  for (const email of emails) {
    const matches = rows.filter((row) => row.email.toLowerCase() === email);
    if (!matches.length) {
      report.missingEmails.push(email);
      continue;
    }
    const user = matches[0]!;
    if (matches.length !== 1 || !canAccessPlatform(user, now)) {
      report.unavailableEmails.push(email);
      continue;
    }
    accounts.push({ email, user });
    report.accounts.push({ email, canReviewFeedback: user.canReviewFeedback });
  }
  // Even separate requested addresses must never resolve to a single account.
  if (new Set(accounts.map(({ user }) => user.id)).size !== accounts.length) {
    report.unavailableEmails = [...new Set([...report.unavailableEmails, ...emails])];
    report.accounts = [];
  }
  if (report.missingEmails.length || report.unavailableEmails.length) {
    throw new FeedbackReviewerGrantError(report);
  }
  return { accounts, report };
}

function changedAccounts(mode: Mode, emails: string[]): FeedbackReviewerGrantError {
  return new FeedbackReviewerGrantError({
    mode,
    accounts: [],
    missingEmails: [],
    unavailableEmails: emails,
  });
}

export async function grantFeedbackReviewers(
  client: Client,
  requestedEmails: readonly string[],
  options: { apply?: boolean } = {},
): Promise<FeedbackReviewerGrantReport> {
  const emails = validateEmails(requestedEmails);
  const mode: Mode = options.apply === true ? "apply" : "dry-run";
  const initialRows = await client.user.findMany(lookup(emails));
  const initial = resolveAccounts(initialRows, emails, mode, new Date());
  if (mode === "dry-run") return initial.report;

  const ids = initial.accounts.map(({ user }) => user.id).sort();
  return client.$transaction(
    async (tx) => {
      // Stable ordering prevents two explicit operator runs from locking users
      // in opposite order. Bind values; never interpolate SQL identifiers.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "User"
        WHERE "id" IN (${Prisma.join(ids)})
        ORDER BY "id" FOR UPDATE
      `;
      if (locked.length !== ids.length || ids.some((id) => !locked.some((row) => row.id === id))) {
        throw changedAccounts(mode, emails);
      }

      // Re-read by email as well as comparing IDs: email changes, duplicate
      // case variants, suspension, deletion or license expiry abort ALL grants.
      const freshRows = await tx.user.findMany(lookup(emails));
      const fresh = resolveAccounts(freshRows, emails, mode, new Date());
      for (const { email, user } of fresh.accounts) {
        if (initial.accounts.find((entry) => entry.email === email)?.user.id !== user.id) {
          throw changedAccounts(mode, emails);
        }
      }

      for (const { user } of fresh.accounts) {
        if (user.canReviewFeedback) continue;
        const result = await tx.user.updateMany({
          where: {
            id: user.id,
            email: user.email,
            status: "ACTIVO",
            deletedAt: null,
            canReviewFeedback: false,
          },
          data: { canReviewFeedback: true },
        });
        if (result.count !== 1) throw changedAccounts(mode, emails);
        await tx.auditLog.create({
          data: {
            actorId: null,
            action: "FEEDBACK_REVIEW_PERMISSION_GRANTED",
            entity: "User",
            entityId: user.id,
            metadata: { source: "operator-request", permission: "feedback-review" },
          },
        });
      }
      return {
        mode,
        accounts: fresh.accounts.map(({ email }) => ({ email, canReviewFeedback: true })),
        missingEmails: [],
        unavailableEmails: [],
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 },
  );
}

export async function runFeedbackReviewerCommand(
  client: Client,
  args: readonly string[],
  env: { FEEDBACK_REVIEWER_EMAILS?: string },
) {
  if (args.length > 1 || (args.length === 1 && args[0] !== "--apply")) {
    throw new FeedbackReviewerConfigurationError();
  }
  const emails = parseFeedbackReviewerEmails(env.FEEDBACK_REVIEWER_EMAILS);
  return grantFeedbackReviewers(client, emails, { apply: args[0] === "--apply" });
}

export function feedbackReviewerErrorReport(error: unknown) {
  const report = error instanceof FeedbackReviewerGrantError ? error.report : undefined;
  return {
    event: "feedback-reviewer-grant",
    ok: false,
    ...(report ?? {}),
    error:
      error instanceof FeedbackReviewerGrantError ||
      error instanceof FeedbackReviewerConfigurationError
        ? error.message
        : "No fue posible completar la operación de permisos del buzón.",
  };
}

async function main() {
  let client: PrismaClient | undefined;
  try {
    // This independent client must not log Prisma errors containing DB URLs.
    client = new PrismaClient({ log: [] });
    const report = await runFeedbackReviewerCommand(client, process.argv.slice(2), {
      FEEDBACK_REVIEWER_EMAILS: process.env.FEEDBACK_REVIEWER_EMAILS,
    });
    console.info(JSON.stringify({ event: "feedback-reviewer-grant", ok: true, ...report }));
  } catch (error) {
    console.error(JSON.stringify(feedbackReviewerErrorReport(error)));
    process.exitCode = 1;
  } finally {
    if (client) {
      try {
        await client.$disconnect();
      } catch {
        console.error(
          '{"event":"feedback-reviewer-grant","ok":false,"error":"No fue posible cerrar la conexión."}',
        );
        process.exitCode = 1;
      }
    }
  }
}

// Imports in tests and tooling cannot execute this privileged operation.
if (typeof require !== "undefined" && require.main === module) void main();
