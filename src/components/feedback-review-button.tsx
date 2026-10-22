"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function FeedbackReviewButton({
  id,
  reviewedAt,
}: {
  id: string;
  reviewedAt: string | null;
}) {
  const router = useRouter();
  const [reviewed, setReviewed] = useState(reviewedAt !== null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => setReviewed(reviewedAt !== null), [reviewedAt]);

  async function handleReview() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    setMessage(null);
    const nextReviewed = !reviewed;
    try {
      const response = await fetch(`/api/admin/feedback/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ reviewed: nextReviewed }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          response.status === 401 || response.status === 403
            ? "No tienes acceso para actualizar este mensaje. Revisa tu sesión y tus permisos."
            : "No se pudo actualizar el mensaje. Intenta de nuevo.",
        );
        return;
      }
      if (
        data?.id !== id ||
        !(
          data.reviewedAt === null ||
          (typeof data.reviewedAt === "string" && !Number.isNaN(Date.parse(data.reviewedAt)))
        ) ||
        (data.reviewedAt !== null) !== nextReviewed
      ) {
        setError("No se pudo confirmar el cambio. Actualiza la página para revisar el estado.");
        return;
      }
      setReviewed(nextReviewed);
      setMessage(nextReviewed ? "Mensaje marcado como revisado." : "Mensaje marcado como nuevo.");
      router.refresh();
    } catch {
      setError("No se pudo confirmar el cambio. Revisa tu conexión y actualiza la página.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={saving}
        onClick={handleReview}
        className="min-h-11 rounded-md border border-pizarron/30 px-3 py-2 text-sm text-pizarron transition hover:bg-paper disabled:opacity-50"
      >
        {saving ? "Guardando…" : reviewed ? "Marcar como nuevo" : "Marcar como revisado"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm leading-6 text-alerta">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-2 text-sm leading-6 text-ink/70">
          {message}
        </p>
      )}
    </div>
  );
}
