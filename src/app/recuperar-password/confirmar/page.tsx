"use client";

import { useState, FormEvent, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function ConfirmarPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "El enlace no es válido o ya expiró.");
        return;
      }

      router.push("/login");
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <p className="mt-8 text-sm text-alerta">
        Este enlace no incluye un token válido. Solicita uno nuevo desde la página de recuperación.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-ink/70">
        Nueva contraseña (mínimo 10 caracteres)
        <input
          type="password"
          required
          minLength={10}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="rounded-md border border-ink/20 px-3 py-2 text-ink outline-none focus:border-pizarron"
          autoComplete="new-password"
        />
      </label>

      {error && <p className="text-sm text-alerta">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="mt-2 rounded-md bg-pizarron px-4 py-2 text-white transition hover:bg-pizarron/90 disabled:opacity-50"
      >
        {loading ? "Guardando…" : "Guardar nueva contraseña"}
      </button>
    </form>
  );
}

export default function ConfirmarPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <p className="font-display text-sm uppercase tracking-widest text-acento">Plataforma EXCOBA</p>
      <h1 className="mt-2 font-display text-3xl text-pizarron">Elige una nueva contraseña</h1>

      <Suspense fallback={<p className="mt-8 text-sm text-ink/60">Cargando…</p>}>
        <ConfirmarPasswordForm />
      </Suspense>
    </main>
  );
}
