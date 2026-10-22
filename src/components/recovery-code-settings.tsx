"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { RecoveryCodeDisplay } from "@/components/recovery-code-display";

type RecoveryCodeStatus = { available: boolean; createdAt: string | null };

export function RecoveryCodeSettings() {
  const [status, setStatus] = useState<RecoveryCodeStatus | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [currentPassword, setCurrentPassword] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const requestInFlight = useRef(false);

  useEffect(() => {
    const clearSecrets = () => {
      setCode(null);
      setCurrentPassword("");
    };
    window.addEventListener("pagehide", clearSecrets);
    return () => window.removeEventListener("pagehide", clearSecrets);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const response = await fetch("/api/account/recovery-code", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || typeof data.available !== "boolean") {
          throw new Error(
            "No se pudo consultar tu código. Intenta de nuevo o vuelve a iniciar sesión.",
          );
        }
        if (!controller.signal.aborted) {
          setStatus({
            available: data.available,
            createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
          });
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("No se pudo consultar tu código. Intenta de nuevo o vuelve a iniciar sesión.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [refresh]);

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    if (requestInFlight.current || saving || !status || !currentPassword) return;
    requestInFlight.current = true;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/account/recovery-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ currentPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          response.status === 429
            ? "Has realizado demasiados intentos. Espera unos minutos antes de intentarlo de nuevo."
            : response.status >= 500
              ? "No fue posible generar el código. Intenta de nuevo en unos minutos."
              : typeof data.error === "string"
                ? data.error
                : "No fue posible generar el código. Revisa tu contraseña o vuelve a iniciar sesión.",
        );
        return;
      }
      if (typeof data.code !== "string" || !data.code) {
        setMessage("No se recibió el código. Genera uno nuevo para reemplazar el anterior.");
        setRefresh((value) => value + 1);
        return;
      }
      setStatus({
        available: true,
        createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
      });
      setCode(data.code);
    } catch {
      setError(
        "No se pudo conectar con el servidor. Si no recibiste un código, genera otro para reemplazarlo.",
      );
    } finally {
      requestInFlight.current = false;
      setCurrentPassword("");
      setSaving(false);
    }
  }

  return (
    <section
      className="mt-8 rounded-md border border-ink/10 bg-white p-4"
      aria-labelledby="recovery-settings-title"
    >
      <h2 id="recovery-settings-title" className="font-display text-lg text-pizarron">
        Protege el acceso a tu cuenta
      </h2>
      <p className="mt-2 text-sm leading-6 text-ink/70">
        Guarda un código de recuperación para restablecer tu contraseña sin correo automático. Es
        distinto del folio y no cambia tu licencia ni tu progreso.
      </p>
      {code ? (
        <div className="mt-4">
          <RecoveryCodeDisplay
            code={code}
            onSaved={() => {
              setCode(null);
              setMessage(
                "Tu código está listo. Conserva tu copia privada: no volveremos a mostrarlo.",
              );
            }}
          />
        </div>
      ) : loading ? (
        <p role="status" className="mt-4 text-sm text-ink/60">
          Consultando código de recuperación…
        </p>
      ) : status ? (
        <form onSubmit={handleGenerate} aria-busy={saving} className="mt-4 flex flex-col gap-4">
          <p className="text-sm leading-6 text-ink/80">
            {status.available
              ? "Ya tienes un código sin usar. Si generas otro, el anterior dejará de funcionar inmediatamente."
              : "Aún no tienes un código disponible, o ya usaste el anterior. Genera uno y guarda tu copia."}
          </p>
          {status.available && status.createdAt && !Number.isNaN(Date.parse(status.createdAt)) && (
            <p className="text-xs text-ink/60">
              Generado el{" "}
              {new Date(status.createdAt).toLocaleDateString("es-MX", {
                dateStyle: "long",
                timeZone: "America/Mexico_City",
              })}
              .
            </p>
          )}
          <label className="flex flex-col gap-1 text-sm text-ink/70">
            Confirma tu contraseña actual
            <input
              type="password"
              required
              maxLength={128}
              autoComplete="current-password"
              value={currentPassword}
              disabled={saving}
              onChange={(event) => {
                setCurrentPassword(event.target.value);
                setError(null);
              }}
              className="rounded-md border border-ink/20 px-3 py-2 text-ink outline-none focus:border-pizarron"
            />
          </label>
          <button
            type="submit"
            disabled={saving || !currentPassword}
            className="min-h-11 self-start rounded-md bg-pizarron px-4 py-2 text-sm text-white transition hover:bg-pizarron/90 disabled:opacity-50"
          >
            {saving
              ? "Generando…"
              : status.available
                ? "Reemplazar código de recuperación"
                : "Generar código de recuperación"}
          </button>
          <p className="text-xs leading-5 text-ink/60">
            El código es secreto y de un solo uso. Después de recuperar tu cuenta, inicia sesión y
            genera uno nuevo aquí.
          </p>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setRefresh((value) => value + 1)}
          className="mt-3 inline-flex min-h-11 items-center text-sm text-pizarron underline"
        >
          Volver a consultar
        </button>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm leading-6 text-alerta">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-4 text-sm leading-6 text-ink/70">
          {message}
        </p>
      )}
    </section>
  );
}
