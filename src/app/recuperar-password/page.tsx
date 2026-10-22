"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";

export default function RecuperarPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      // La respuesta es siempre genérica por diseño (ver Módulo 4): no
      // revela si el correo existe o no en la plataforma.
      setMessage(data.message ?? "Si el correo existe, se envió un enlace de recuperación.");
    } catch {
      setMessage("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <p className="font-display text-sm uppercase tracking-widest text-acento">Plataforma EXCOBA</p>
      <h1 className="mt-2 font-display text-3xl text-pizarron">Recupera tu contraseña</h1>
      <p className="mt-2 text-sm text-ink/60">
        Ingresa tu correo y, si tienes una cuenta, te enviaremos un enlace para restablecerla.
      </p>

      {!message ? (
        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-ink/70">
            Correo
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-ink/20 px-3 py-2 text-ink outline-none focus:border-pizarron"
              autoComplete="email"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-md bg-pizarron px-4 py-2 text-white transition hover:bg-pizarron/90 disabled:opacity-50"
          >
            {loading ? "Enviando…" : "Enviar enlace"}
          </button>
        </form>
      ) : (
        <p className="mt-8 rounded-md bg-aprobado/10 px-4 py-3 text-sm text-aprobado">{message}</p>
      )}

      <Link href="/login" className="mt-6 text-sm text-ink/60 hover:text-pizarron">
        Volver a iniciar sesión
      </Link>
    </main>
  );
}
