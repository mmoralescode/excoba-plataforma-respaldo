import { randomBytes, randomInt, createHash } from "crypto";

/**
 * Genera un token aleatorio criptográficamente seguro, codificado en base64url.
 * Se usa para: tokens de sesión, tokens de recuperación de contraseña y como
 * base para folios de licencia.
 */
export function generateRandomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Los tokens sensibles (folios, tokens de sesión, tokens de reset) nunca se
 * almacenan en texto plano: se guarda su hash SHA-256 y se compara contra
 * el hash del valor recibido del cliente.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Folio EXCOBA-XXXX-XXXX-XXXX-XXXX, con 16 caracteres aleatorios
 * (aproximadamente 78 bits). Sin caracteres ambiguos ni sesgo de módulo.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateLicenseFolio(): string {
  const randomChar = () => ALPHABET[randomInt(ALPHABET.length)]!;
  const group = () => Array.from({ length: 4 }, randomChar).join("");
  return `EXCOBA-${group()}-${group()}-${group()}-${group()}`;
}
