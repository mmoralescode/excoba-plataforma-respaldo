import { randomBytes, createHash } from "crypto";

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
 * Genera un folio legible con el formato EXCOBA-XXXX-XXXX (ver Módulo 1,
 * sección 6). Usa un alfabeto sin caracteres ambiguos (sin 0/O, 1/I/L).
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateLicenseFolio(): string {
  const randomChar = () => {
    // randomBytes(1) siempre devuelve un Buffer de longitud 1, y el
    // resultado del módulo siempre cae dentro de ALPHABET; los `!` son
    // seguros aquí. Se anotan explícitamente porque `noUncheckedIndexedAccess`
    // (tsconfig.json) marca todo acceso por índice como potencialmente
    // `undefined`.
    const byte = randomBytes(1)[0]!;
    return ALPHABET[byte % ALPHABET.length]!;
  };
  const group = () => Array.from({ length: 4 }, randomChar).join("");
  return `EXCOBA-${group()}-${group()}`;
}
