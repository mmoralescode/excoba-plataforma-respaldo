import { randomBytes } from "crypto";
import { argon2id, argon2Verify } from "hash-wasm";

/**
 * Hashing de contraseñas con Argon2id, implementado en WebAssembly
 * (hash-wasm) en vez del paquete nativo `argon2`.
 *
 * Por qué el cambio: el paquete `argon2` (binding nativo, un archivo
 * .node compilado por plataforma) sufría fallos intermitentes e
 * impredecibles en el empaquetado por-ruta de Vercel — algunas rutas
 * serverless incluían correctamente el binario nativo al desplegar y
 * otras no, incluso dentro del mismo build, dependiendo de detalles del
 * grafo de imports que no llegamos a controlar de forma confiable (se
 * probaron: fijar la versión de Node, y declarar el paquete como
 * "external" en la config de Next.js — ninguna resolvió el problema de
 * forma consistente). WebAssembly no tiene este problema: es un archivo
 * de datos normal, no un binario específico de plataforma/arquitectura,
 * así que el empaquetado de Vercel lo trata como cualquier otro asset.
 *
 * Los parámetros (memoria, iteraciones, paralelismo) se mantienen
 * idénticos a los que se usaban con el paquete `argon2` para que los
 * hashes ya generados (incluido el del usuario admin de seed) sigan
 * siendo válidos — el formato de salida ('encoded') es el estándar PHC
 * ($argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>), el mismo que genera
 * el paquete `argon2` y que cualquier verificador de Argon2 reconoce.
 */
const ARGON2_PARAMS = {
  iterations: 3,
  parallelism: 4,
  memorySize: 65536, // KiB (64 MB)
  hashLength: 32,
} as const;

export async function hashPassword(plainPassword: string): Promise<string> {
  const salt = randomBytes(16);
  return argon2id({
    password: plainPassword,
    salt,
    ...ARGON2_PARAMS,
    outputType: "encoded",
  });
}

export async function verifyPassword(
  passwordHash: string,
  plainPassword: string,
): Promise<boolean> {
  try {
    return await argon2Verify({ password: plainPassword, hash: passwordHash });
  } catch {
    // Un hash corrupto o con formato inesperado nunca debe lanzar hacia
    // arriba; se trata como contraseña incorrecta.
    return false;
  }
}
