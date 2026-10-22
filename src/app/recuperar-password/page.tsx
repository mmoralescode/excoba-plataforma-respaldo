"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

export default function RecuperarPasswordPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const clearSecrets = () => {
      setCode("");
      setNewPassword("");
      setConfirmPassword("");
    };
    window.addEventListener("pagehide", clearSecrets);
    return () => window.removeEventListener("pagehide", clearSecrets);
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    if (newPassword.length < 10 || newPassword.length > 128) {
      setError("La contraseña debe tener entre 10 y 128 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden. Escríbelas de nuevo.");
      return;
    }
    if (!code.trim()) {
      setError("Escribe el código de recuperación que guardaste, no tu folio.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/recover-with-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
          newPassword,
          confirmPassword,
        }),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? "Has realizado demasiados intentos. Espera unos minutos antes de intentarlo de nuevo."
            : response.status >= 500
              ? "No fue posible guardar la contraseña. Intenta de nuevo en unos minutos."
              : "No fue posible recuperar la cuenta. Revisa el correo y el código; puede ser incorrecto, haberse usado o haber sido reemplazado.",
        );
        return;
      }
      setCode("");
      setNewPassword("");
      setConfirmPassword("");
      setComplete(true);
    } catch {
      setError(
        "No se pudo conectar con el servidor. Si ya se guardó el cambio, podrás iniciar sesión con tu nueva contraseña.",
      );
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
        {complete ? "Contraseña actualizada" : "Recupera tu contraseña"}
      </h1>
      {complete ? (
        <div className="mt-8 space-y-4">
          <div
            role="status"
            className="space-y-3 rounded-md bg-aprobado/10 px-4 py-3 text-sm leading-6 text-ink/80"
          >
            <p>Tu contraseña se guardó y se cerraron las sesiones anteriores de tu cuenta.</p>
            <p>
              El código ya fue utilizado y dejó de funcionar. Inicia sesión con tu nueva contraseña
              y genera otro código desde tu perfil. Tu licencia, vigencia y progreso se conservan.
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-md bg-pizarron px-4 py-2 text-sm text-white"
          >
            Iniciar sesión
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            Usa el código secreto que guardaste al crear tu cuenta o desde tu perfil. Es distinto
            del folio y permite restablecer tu contraseña sin recibir un correo.
          </p>
          <form onSubmit={handleSubmit} aria-busy={loading} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm text-ink/70">
              Correo de tu cuenta
              <input
                type="email"
                required
                maxLength={254}
                disabled={loading}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError(null);
                }}
                onBlur={() => setEmail(email.trim())}
                autoComplete="email"
                className="rounded-md border border-ink/20 px-3 py-2 text-ink outline-none focus:border-pizarron"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink/70">
              Código de recuperación
              <input
                type={showCode ? "text" : "password"}
                required
                maxLength={100}
                disabled={loading}
                value={code}
                onChange={(event) => {
                  setCode(event.target.value);
                  setError(null);
                }}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="REC-XXXX-…"
                className="rounded-md border border-ink/20 px-3 py-2 font-mono text-ink outline-none focus:border-pizarron"
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink/70">
              <input
                type="checkbox"
                checked={showCode}
                disabled={loading}
                onChange={(event) => setShowCode(event.target.checked)}
              />
              Mostrar código
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink/70">
              Nueva contraseña (de 10 a 128 caracteres)
              <input
                type={showPasswords ? "text" : "password"}
                required
                minLength={10}
                maxLength={128}
                disabled={loading}
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  setError(null);
                }}
                autoComplete="new-password"
                className="rounded-md border border-ink/20 px-3 py-2 text-ink outline-none focus:border-pizarron"
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
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setError(null);
                }}
                autoComplete="new-password"
                className="rounded-md border border-ink/20 px-3 py-2 text-ink outline-none focus:border-pizarron"
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink/70">
              <input
                type="checkbox"
                checked={showPasswords}
                disabled={loading}
                onChange={(event) => setShowPasswords(event.target.checked)}
              />
              Mostrar contraseñas
            </label>
            <p className="text-xs leading-5 text-ink/60">
              Al guardar, el código se consume y se cierran tus sesiones abiertas. Después deberás
              iniciar sesión y generar un código nuevo desde tu perfil.
            </p>
            {error && (
              <p role="alert" className="text-sm leading-6 text-alerta">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="min-h-11 rounded-md bg-pizarron px-4 py-2 text-white transition hover:bg-pizarron/90 disabled:opacity-50"
            >
              {loading ? "Guardando…" : "Guardar nueva contraseña"}
            </button>
          </form>
          <details className="mt-6 text-sm leading-6 text-ink/70">
            <summary className="min-h-11 cursor-pointer text-pizarron">
              No tengo mi código de recuperación
            </summary>
            <p className="mt-2">
              Si todavía recuerdas tu contraseña, inicia sesión y genera un código desde tu perfil.
              Si ya perdiste la contraseña y nunca guardaste un código, esta opción no puede
              generarlo desde fuera. El folio no sirve para restablecer contraseñas.
            </p>
          </details>
          <Link
            href="/login"
            className="mt-6 inline-flex min-h-11 items-center text-sm text-ink/60 hover:text-pizarron"
          >
            Volver a iniciar sesión
          </Link>
        </>
      )}
    </main>
  );
}
