"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PRIVACY_NOTICE_VERSION } from "@/content/privacy-notice-version";
import { PrivacyNoticeContent } from "./privacy-notice-content";

export function PrivacyNoticeDialog() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      titleRef.current?.focus({ preventScroll: true });
      dialog.scrollTop = 0;
    }
    return () => dialog?.close();
  }, []);

  async function accept() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/privacy/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: PRIVACY_NOTICE_VERSION, accepted: true }),
      });
      if (!response.ok) throw new Error();
      dialogRef.current?.close();
      setAccepted(true);
      router.refresh();
    } catch {
      setError("No pudimos registrar tu aceptación. Intenta de nuevo.");
      setSubmitting(false);
    }
  }

  if (accepted) return null;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => event.preventDefault()}
      aria-labelledby="privacy-notice-title"
      className="m-auto max-h-[92dvh] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto rounded-xl border-0 bg-paper p-0 text-ink shadow-xl backdrop:bg-ink/45"
    >
      <section className="p-6 sm:p-8">
        <p className="font-display text-sm uppercase tracking-widest text-acento">
          Plataforma EXCOBA
        </p>
        <h1
          ref={titleRef}
          tabIndex={-1}
          id="privacy-notice-title"
          className="mt-2 font-display text-3xl text-pizarron outline-none"
        >
          Aviso de privacidad
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink/70">
          Mensaje informativo sobre el uso de tus datos. Léelo antes de continuar; guardaremos la
          fecha y versión de tu aceptación.
        </p>
        <div className="mt-6 border-y border-ink/10 py-6">
          <PrivacyNoticeContent />
        </div>
        {error && (
          <p className="mt-4 text-sm text-alerta" role="alert">
            {error}
          </p>
        )}
        <button
          className="mt-6 min-h-11 w-full rounded-lg bg-pizarron px-5 py-3 text-white disabled:opacity-50"
          disabled={submitting}
          onClick={accept}
          type="button"
        >
          {submitting ? "Guardando…" : "He leído y acepto este mensaje"}
        </button>
      </section>
    </dialog>
  );
}
