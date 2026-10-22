import { randomInt } from "node:crypto";
import { hashToken } from "./tokens";

// 32 independent uniformly selected symbols = 160 bits. Not a license folio.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function generateRecoveryCode() {
  const secret = Array.from({ length: 32 }, () => ALPHABET[randomInt(ALPHABET.length)]!).join("");
  return "REC-" + secret.match(/.{4}/g)!.join("-");
}

/** Hyphens/whitespace and case are cosmetic; other characters are never ignored. */
export function normalizeRecoveryCode(code: string) {
  return code.toUpperCase().replace(/[\s-]/g, "");
}
export function isRecoveryCode(code: string) {
  return /^REC[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{32}$/.test(normalizeRecoveryCode(code));
}
export function hashRecoveryCode(code: string) {
  return hashToken("excoba:recovery-code:v1:" + normalizeRecoveryCode(code));
}
