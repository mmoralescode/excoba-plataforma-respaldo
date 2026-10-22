import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  createLicense: vi.fn(),
  upsertQuestion: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSessionUser: mocks.session }));
vi.mock("@/server/use-cases/create-license", () => ({ createLicense: mocks.createLicense }));
vi.mock("@/server/use-cases/academic-content", () => ({ upsertQuestion: mocks.upsertQuestion }));
vi.mock("@/db/client", () => ({ db: { auditLog: { create: mocks.audit } } }));

import * as licenses from "../src/app/api/admin/licenses/route";
import * as questions from "../src/app/api/admin/questions/route";

const authorizedReviewer = {
  id: "limited-reviewer-test",
  email: "reviewer@example.test",
  canReviewFeedback: true,
  roles: [{ role: { name: "ALUMNO" } }],
};
const endpoints = [
  ["licenses", licenses.POST],
  ["questions", questions.POST],
] as const;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue(authorizedReviewer);
});

describe("El permiso de buzón no se extiende a operaciones administrativas", () => {
  it.each(endpoints)("POST /api/admin/%s sigue devolviendo 403", async (path, post) => {
    const request = new NextRequest(`https://excoba.example.test/api/admin/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        canReviewFeedback: true,
        role: "SUPER_ADMIN",
        roles: [{ role: { name: "SUPER_ADMIN" } }],
        createdByAdminId: "forged-admin",
        authorId: "forged-admin",
      }),
    });
    const response = await post(request);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "No autorizado." });
    expect(mocks.createLicense).not.toHaveBeenCalled();
    expect(mocks.upsertQuestion).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(authorizedReviewer.roles).toEqual([{ role: { name: "ALUMNO" } }]);
  });

  it.each(endpoints)(
    "POST /api/admin/%s exige sesión antes de leer contenido",
    async (path, post) => {
      mocks.session.mockResolvedValue(null);
      const request = new NextRequest(`https://excoba.example.test/api/admin/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{malformed",
      });
      expect((await post(request)).status).toBe(401);
      expect(mocks.createLicense).not.toHaveBeenCalled();
      expect(mocks.upsertQuestion).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
    },
  );
});
