import Link from "next/link";
import { hasRole } from "@/lib/authorization";
import { requireAdminShellPage } from "@/lib/page-authorization";
import { canReviewFeedback } from "@/lib/feedback-permissions";
import { AdminAccessDenied } from "@/components/admin-access-denied";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The shell admits inbox reviewers; each page separately checks its own permission.
  const user = await requireAdminShellPage();
  if (!user) return <AdminAccessDenied />;
  const canReadFeedback = canReviewFeedback(user);
  const canReadSummary =
    hasRole(user, "SUPER_ADMIN") ||
    hasRole(user, "SOPORTE") ||
    hasRole(user, "EDITOR_ACADEMICO") ||
    hasRole(user, "ANALISTA");

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-ink/10 bg-white px-6 py-4">
        <p className="font-display text-lg text-pizarron">
          {canReadSummary ? "Panel administrativo — EXCOBA" : "Buzón — EXCOBA"}
        </p>
        <nav
          aria-label="Administración"
          className="mt-2 flex flex-wrap gap-x-6 text-sm text-pizarron"
        >
          {canReadSummary && (
            <Link href="/admin" className="inline-flex min-h-11 items-center underline">
              Resumen
            </Link>
          )}
          {canReadFeedback && (
            <Link href="/admin/feedback" className="inline-flex min-h-11 items-center underline">
              Buzón
            </Link>
          )}
          <Link href="/perfil" className="inline-flex min-h-11 items-center underline">
            Volver a la plataforma
          </Link>
        </nav>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-10">{children}</div>
    </div>
  );
}
