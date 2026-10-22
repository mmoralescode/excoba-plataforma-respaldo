import { requireRole } from "@/lib/authorization";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Guardia server-side real de autorización. El middleware sólo evita que
  // un visitante sin cookie llegue aquí; ESTA verificación de rol es la que
  // efectivamente protege el panel (ver Módulo 1, sección 10).
  await requireRole("SUPER_ADMIN", "EDITOR_ACADEMICO", "SOPORTE", "ANALISTA");

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-ink/10 bg-white px-6 py-4">
        <p className="font-display text-lg text-pizarron">Panel administrativo — EXCOBA</p>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-10">{children}</div>
    </div>
  );
}
