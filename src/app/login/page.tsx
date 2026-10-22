"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { safeAuthenticatedPath } from "@/lib/safe-next-path";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Correo o contraseña incorrectos.");
        return;
      }

      const destination = new URLSearchParams(window.location.search).get("next");
      router.push(safeAuthenticatedPath(destination));
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <p className="font-display text-sm uppercase tracking-widest text-acento">
        Plataforma EXCOBA
      </p>
      <h1 className="mt-2 font-display text-3xl text-pizarron">Inicia sesión</h1>

      <form onSubmit={handleSubmit} aria-busy={loading} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink/70">
          Correo
          <input
            type="email"
            required
            maxLength={254}
            disabled={loading}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            onBlur={() => setEmail(email.trim())}
            className="rounded-md border border-ink/20 px-3 py-2 text-ink outline-none focus:border-pizarron"
            autoComplete="email"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/70">
          Contraseña
          <input
            type="password"
            required
            disabled={loading}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            className="rounded-md border border-ink/20 px-3 py-2 text-ink outline-none focus:border-pizarron"
            autoComplete="current-password"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-alerta">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-md bg-pizarron px-4 py-2 text-white transition hover:bg-pizarron/90 disabled:opacity-50"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <div className="mt-6 flex flex-col gap-2 text-sm text-ink/60">
        <Link href="/recuperar-password" className="hover:text-pizarron">
          Olvidé mi contraseña
        </Link>
        <Link href="/activar" className="hover:text-pizarron">
          Tengo un folio y quiero crear mi cuenta
        </Link>
      </div>
    </main>
  );
}
