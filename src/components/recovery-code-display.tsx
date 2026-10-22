"use client";

import { useId, useState } from "react";

type RecoveryCodeDisplayProps = {
  code: string;
  onSaved: () => void;
};

/** The secret stays in its owner's component state and is never persisted by this UI. */
export function RecoveryCodeDisplay({ code, onSaved }: RecoveryCodeDisplayProps) {
  const codeId = useId();
  const [saved, setSaved] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus("Código copiado. Guárdalo en un lugar privado antes de continuar.");
    } catch {
      setCopyStatus(
        "No se pudo copiar automáticamente. Selecciona el código y cópialo manualmente.",
      );
    }
  }

  return (
    <div className="space-y-4 rounded-md border border-pizarron/20 bg-white p-4">
      <p className="text-sm leading-6 text-ink/80">
        Este código secreto es diferente de tu folio y permite cambiar tu contraseña sin recibir un
        correo. Solo se puede usar una vez. No lo compartas con nadie.
      </p>
      <div>
        <p id={codeId} className="mb-2 text-sm font-medium text-pizarron">
          Tu código de recuperación
        </p>
        <output
          aria-labelledby={codeId}
          className="block select-all break-all rounded-md bg-pizarron/5 p-3 font-mono text-base tracking-wide text-pizarron"
        >
          {code}
        </output>
        <button
          type="button"
          onClick={copyCode}
          className="mt-2 inline-flex min-h-11 items-center text-sm text-pizarron underline"
        >
          Copiar código
        </button>
        {copyStatus && (
          <p role="status" className="text-sm leading-6 text-ink/70">
            {copyStatus}
          </p>
        )}
      </div>
      <p className="text-sm leading-6 text-ink/70">
        Solo lo mostramos ahora. Guárdalo en un gestor de contraseñas o en un lugar privado antes de
        salir o recargar esta página. Si lo pierdes, podrás reemplazarlo desde tu perfil mientras
        recuerdes tu contraseña.
      </p>
      <label className="flex min-h-11 items-center gap-3 text-sm text-ink/80">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
          className="h-4 w-4 shrink-0 accent-pizarron"
        />
        Guardé mi código en un lugar seguro.
      </label>
      <button
        type="button"
        disabled={!saved}
        onClick={() => {
          if (saved) onSaved();
        }}
        className="min-h-11 w-full rounded-md bg-pizarron px-4 py-2 text-sm text-white transition hover:bg-pizarron/90 disabled:opacity-50"
      >
        Ya lo guardé
      </button>
    </div>
  );
}
