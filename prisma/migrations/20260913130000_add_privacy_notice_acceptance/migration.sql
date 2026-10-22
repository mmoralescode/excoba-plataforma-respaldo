-- Conserva la constancia de lectura del aviso vigente por usuario.
ALTER TABLE "User" ADD COLUMN "privacyNoticeAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "privacyNoticeVersion" TEXT;
