"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

type FeedbackCategory = "SUGERENCIA" | "ERROR";
type FeedbackSection = "GENERAL" | "INSTRUCTIVO" | "PRACTICA" | "SIMULADOR" | "PERFIL" | "OTRO";
type Submission = { payload: string; id: string };

export function FeedbackBox() {
  const [category, setCategory] = useState<FeedbackCategory>("SUGERENCIA");
  const [section, setSection] = useState<FeedbackSection>("GENERAL");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [received, setReceived] = useState(false);
  const requestInFlight = useRef(false);
  const submission = useRef<Submission | null>(null);

  function clearFeedback() {
    submission.current = null;
    setError(null);
    setNeedsLogin(false);
    setReceived(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (requestInFlight.current || sending) return;
    const trimmedMessage = message.trim();
    setError(null);
    setNeedsLogin(false);
    setReceived(false);
    if (trimmedMessage.length < 10 || trimmedMessage.length > 1000) {
      setError("Escribe entre 10 y 1000 caracteres, sin contar los espacios al inicio o al final.");
      return;
    }

    requestInFlight.current = true;
    setSending(true);
    try {
      const payload = JSON.stringify({ category, section, message: trimmedMessage });
      if (submission.current?.payload !== payload) {
        submission.current = { payload, id: crypto.randomUUID() };
      }
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          category,
          section,
          message: trimmedMessage,
          submissionId: submission.current.id,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) {
          setNeedsLogin(true);
          setError("Tu sesión terminó. Inicia sesión de nuevo para enviar tu mensaje.");
        } else if (response.status === 429) {
          setError(
            "Puedes enviar hasta 5 mensajes por hora. Espera un poco antes de intentar de nuevo.",
          );
        } else if (response.status === 409) {
          submission.current = null;
          setError("No pudimos confirmar este envío. Revisa tu mensaje y vuelve a enviarlo.");
        } else if (response.status === 400) {
          setError("Revisa el tipo, el apartado y la extensión de tu mensaje antes de enviarlo.");
        } else {
          setError("No pudimos enviar tu mensaje. Intenta de nuevo en unos minutos.");
        }
        return;
      }
      if (typeof data.id !== "string" || !data.id) {
        setError(
          "No recibimos la confirmación. Vuelve a enviar el mismo mensaje para comprobarlo.",
        );
        return;
      }
      submission.current = null;
      setCategory("SUGERENCIA");
      setSection("GENERAL");
      setMessage("");
      setReceived(true);
    } catch {
      setError(
        "No se pudo conectar con el servidor. Tu mensaje sigue aquí; puedes volver a enviarlo.",
      );
    } finally {
      requestInFlight.current = false;
      setSending(false);
    }
  }

  return (
    <section
      id="buzon"
      className="mt-8 rounded-md border border-ink/10 bg-white p-4"
      aria-labelledby="feedback-title"
    >
      <h2 id="feedback-title" className="font-display text-lg text-pizarron">
        Buzón de sugerencias y errores
      </h2>
      <p className="mt-2 text-sm leading-6 text-ink/70">
        Cuéntanos tu idea para mejorar la plataforma o qué estabas haciendo cuando apareció un
        error.
      </p>
      <form onSubmit={handleSubmit} aria-busy={sending} className="mt-4">
        <fieldset disabled={sending} className="flex min-w-0 flex-col gap-4">
          <legend className="sr-only">Envía una sugerencia o reporta un error</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-ink/70">
              Tipo de mensaje
              <select
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value as FeedbackCategory);
                  clearFeedback();
                }}
                className="min-h-11 rounded-md border border-ink/20 bg-white px-3 py-2 text-ink outline-none focus:border-pizarron"
              >
                <option value="SUGERENCIA">Sugerencia de mejora</option>
                <option value="ERROR">Reportar un error</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink/70">
              Apartado de la plataforma
              <select
                value={section}
                onChange={(event) => {
                  setSection(event.target.value as FeedbackSection);
                  clearFeedback();
                }}
                className="min-h-11 rounded-md border border-ink/20 bg-white px-3 py-2 text-ink outline-none focus:border-pizarron"
              >
                <option value="GENERAL">General</option>
                <option value="INSTRUCTIVO">Instructivo</option>
                <option value="PRACTICA">Práctica</option>
                <option value="SIMULADOR">Simulador</option>
                <option value="PERFIL">Perfil</option>
                <option value="OTRO">Otro</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm text-ink/70">
            Tu mensaje
            <textarea
              required
              minLength={10}
              maxLength={1000}
              rows={4}
              value={message}
              aria-describedby="feedback-message-help feedback-privacy"
              onChange={(event) => {
                setMessage(event.target.value);
                clearFeedback();
              }}
              className="w-full resize-y rounded-md border border-ink/20 px-3 py-2 text-ink outline-none focus:border-pizarron"
            />
          </label>
          <p
            id="feedback-message-help"
            className="-mt-2 flex flex-wrap justify-between gap-2 text-xs text-ink/60"
          >
            <span>Mínimo 10 caracteres.</span>
            <span>{message.trim().length} / 1000</span>
          </p>
          <p id="feedback-privacy" className="text-xs leading-5 text-ink/60">
            Tu mensaje es privado, queda vinculado a tu cuenta y puede consultarlo el equipo de
            administración y soporte. No incluyas contraseñas, folios ni códigos de recuperación.
          </p>
          <button
            type="submit"
            disabled={sending || message.trim().length < 10 || message.trim().length > 1000}
            className="min-h-11 self-start rounded-md bg-pizarron px-4 py-2 text-sm text-white transition hover:bg-pizarron/90 disabled:opacity-50"
          >
            {sending ? "Enviando…" : "Enviar mensaje"}
          </button>
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="mt-4 text-sm leading-6 text-alerta">
          {error}
          {needsLogin && (
            <>
              {" "}
              <Link href="/login" className="text-pizarron underline">
                Iniciar sesión
              </Link>
              . Copia tu mensaje antes de salir para no perderlo.
            </>
          )}
        </p>
      )}
      {received && (
        <p role="status" className="mt-4 text-sm leading-6 text-aprobado">
          Recibimos tu mensaje. Gracias por ayudarnos a mejorar la plataforma.
        </p>
      )}
    </section>
  );
}
