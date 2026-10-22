"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";

export default function ConfirmarPasswordPage() {
  const initialized = useRef(false);
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const readLink = () => {
      const url = new URL(window.location.href);
      const fragment = new URLSearchParams(url.hash.slice(1));
      // Keep the credential in memory when StrictMode replays the effect after URL cleanup.
      if (initialized.current && !fragment.has("token") && !url.searchParams.has("token")) return;
      initialized.current = true;
      const rawToken = fragment.get("token") ?? url.searchParams.get("token") ?? "";
      setToken(/^[A-Za-z0-9_-]{43}$/.test(rawToken) ? rawToken : "");
      setNewPassword("");
      setConfirmation("");
      setError(null);
      setComplete(false);
      url.searchParams.delete("token");
      fragment.delete("token");
      url.hash = fragment.toString();
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      setReady(true);
    };
    readLink();
    // A second email link can navigate to another fragment without remounting this page.
    window.addEventListener("hashchange", readLink);
    window.addEventListener("popstate", readLink);
    return () => {
      window.removeEventListener("hashchange", readLink);
      window.removeEventListener("popstate", readLink);
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading || !token) return;
    setError(null);
    if (newPassword.length < 10 || newPassword.length > 128) {
      setError("La contraseña debe tener entre 10 y 128 caracteres.");
      return;
    }
    if (newPassword !== confirmation) {
      setError("Las contraseñas no coinciden. Escríbelas de nuevo.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data.code === "INVALID_RESET_TOKEN") {
          setToken("");
          setNewPassword("");
          setConfirmation("");
        } else {
          setError(
            response.status === 429
              ? "Has realizado demasiados intentos. Espera unos minutos e intenta de nuevo."
              : data.code === "INVALID_INPUT"
                ? "Revisa que la contraseña tenga entre 10 y 128 caracteres."
                : "No fue posible guardar la contraseña. Intenta de nuevo en unos minutos.",
          );
        }
        return;
      }
      setToken("");
      setNewPassword("");
      setConfirmation("");
      setComplete(true);
    } catch {
      setError("No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <p className="font-display text-sm uppercase tracking-widest text-acento">
        Plataforma EXCOBA
      </p>
      <h1 className="mt-2 font-display text-3xl text-pizarron">
        {complete ? "Contraseña actualizada" : "Elige una nueva contraseña"}
      </h1>
      {!ready ? (
        <p role="status" className="mt-8 text-sm text-ink/60">
          Cargando enlace…
        </p>
      ) : complete ? (
        <div className="mt-8 space-y-5">
          <p
            role="status"
            className="rounded-md bg-aprobado/10 px-4 py-3 text-sm leading-6 text-ink/80"
          >
            Tu contraseña se guardó correctamente. Por seguridad, se cerraron las sesiones de tu
            cuenta en todos los dispositivos. Inicia sesión con tu nueva contraseña y genera un
            nuevo código de recuperación en tu perfil; el anterior dejó de funcionar.
          </p>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-md bg-pizarron px-4 py-2 text-sm text-white"
          >
            Iniciar sesión
          </Link>
        </div>
      ) : !token ? (
        <div className="mt-8 space-y-4">
          <p role="alert" className="text-sm leading-6 text-alerta">
            El enlace no es válido, ya se utilizó o expiró. Si guardaste tu código de recuperación,
            puedes usarlo para cambiar tu contraseña.
          </p>
          <Link
            href="/recuperar-password"
            className="inline-flex min-h-11 items-center text-sm text-pizarron underline"
          >
            Usar mi código de recuperación
          </Link>
          <Link href="/login" className="block text-sm text-ink/60 underline">
            Volver a iniciar sesión
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} aria-busy={loading} className="mt-8 flex flex-col gap-4">
          <p className="text-sm leading-6 text-ink/60">
            Usa entre 10 y 128 caracteres. Al guardar, este enlace dejará de funcionar y se cerrarán
            las sesiones abiertas de tu cuenta. Tu código de recuperación anterior también dejará de
            funcionar; genera otro en Perfil después de iniciar sesión.
          </p>
          <label className="flex flex-col gap-1 text-sm text-ink/70">
            Nueva contraseña
            <input
              type={showPasswords ? "text" : "password"}
              required
              minLength={10}
              maxLength={128}
              disabled={loading}
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setError(null);
              }}
              className="rounded-md border border-ink/20 px-3 py-2 text-ink outline-none focus:border-pizarron"
              autoComplete="new-password"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink/70">
            Confirma tu nueva contraseña
            <input
              type={showPasswords ? "text" : "password"}
              required
              minLength={10}
              maxLength={128}
              disabled={loading}
              value={confirmation}
              onChange={(e) => {
                setConfirmation(e.target.value);
                setError(null);
              }}
              className="rounded-md border border-ink/20 px-3 py-2 text-ink outline-none focus:border-pizarron"
              autoComplete="new-password"
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm text-ink/70">
            <input
              type="checkbox"
              checked={showPasswords}
              disabled={loading}
              onChange={(e) => setShowPasswords(e.target.checked)}
            />
            Mostrar contraseñas
          </label>
          {error && (
            <p role="alert" className="text-sm text-alerta">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 min-h-11 rounded-md bg-pizarron px-4 py-2 text-white transition hover:bg-pizarron/90 disabled:opacity-50"
          >
            {loading ? "Guardando…" : "Guardar nueva contraseña"}
          </button>
          <Link href="/recuperar-password" className="text-sm text-pizarron underline">
            Usar mi código de recuperación
          </Link>
        </form>
      )}
    </main>
  );
}
