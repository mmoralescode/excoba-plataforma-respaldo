const AUTHENTICATED_DESTINATIONS = [
  "/estudio",
  "/practica",
  "/simulador",
  "/perfil",
  "/instructivo",
  "/temario",
  "/admin",
] as const;

export function safeAuthenticatedPath(value: string | null, fallback = "/estudio") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const parsed = new URL(value, "https://excoba.invalid");
    const allowed = AUTHENTICATED_DESTINATIONS.some(
      (prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`),
    );
    return allowed && parsed.origin === "https://excoba.invalid"
      ? `${parsed.pathname}${parsed.search}`
      : fallback;
  } catch {
    return fallback;
  }
}
