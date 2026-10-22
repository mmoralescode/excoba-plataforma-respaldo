import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("../src/db/client", () => ({
  db: { user: { findUnique: mocks.findUser }, $transaction: mocks.transaction },
}));

import { PRIVACY_NOTICE_VERSION } from "../src/content/privacy-notice-version";
import {
  acceptPrivacyNotice,
  PrivacyNoticeAcceptanceError,
} from "../src/server/use-cases/accept-privacy-notice";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.update.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      user: { updateMany: mocks.update, findUnique: mocks.findUser },
      auditLog: { create: mocks.audit },
    }),
  );
});
afterEach(() => vi.useRealTimers());

describe("aviso de privacidad", () => {
  it("guarda una sola constancia con fecha y versión vigente", async () => {
    const acceptedAt = new Date("2026-09-13T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(acceptedAt);
    mocks.findUser.mockResolvedValue({ privacyNoticeAcceptedAt: null, privacyNoticeVersion: null });
    await expect(acceptPrivacyNotice("user-1")).resolves.toEqual({
      acceptedAt,
      alreadyAccepted: false,
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: {
        id: "user-1",
        OR: [
          { privacyNoticeAcceptedAt: null },
          { privacyNoticeVersion: null },
          { privacyNoticeVersion: { not: PRIVACY_NOTICE_VERSION } },
        ],
      },
      data: { privacyNoticeAcceptedAt: acceptedAt, privacyNoticeVersion: PRIVACY_NOTICE_VERSION },
    });
    expect(mocks.audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "user-1",
        action: "PRIVACY_NOTICE_ACCEPTED",
        metadata: { version: PRIVACY_NOTICE_VERSION },
      }),
    });
  });
  it("no reescribe la fecha cuando el usuario ya aceptó esta versión", async () => {
    const acceptedAt = new Date("2026-09-13T12:00:00.000Z");
    mocks.findUser.mockResolvedValue({
      privacyNoticeAcceptedAt: acceptedAt,
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    });
    await expect(acceptPrivacyNotice("user-1")).resolves.toEqual({
      acceptedAt,
      alreadyAccepted: true,
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("preserva la primera aceptación si otra solicitud la guarda simultáneamente", async () => {
    const acceptedAt = new Date("2026-09-13T12:00:00.000Z");
    mocks.findUser
      .mockResolvedValueOnce({ privacyNoticeAcceptedAt: null, privacyNoticeVersion: null })
      .mockResolvedValueOnce({
        privacyNoticeAcceptedAt: acceptedAt,
        privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      });
    mocks.update.mockResolvedValue({ count: 0 });
    await expect(acceptPrivacyNotice("user-1")).resolves.toEqual({
      acceptedAt,
      alreadyAccepted: true,
    });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("registra nuevamente solo si cambia la versión", async () => {
    mocks.findUser.mockResolvedValue({
      privacyNoticeAcceptedAt: new Date(),
      privacyNoticeVersion: "anterior",
    });
    await expect(acceptPrivacyNotice("user-1")).resolves.toEqual({
      acceptedAt: expect.any(Date),
      alreadyAccepted: false,
    });
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });
  it("rechaza una aceptación para un usuario inexistente", async () => {
    mocks.findUser.mockResolvedValue(null);
    await expect(acceptPrivacyNotice("unknown")).rejects.toBeInstanceOf(
      PrivacyNoticeAcceptanceError,
    );
  });
});
