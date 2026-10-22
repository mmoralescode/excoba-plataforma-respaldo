import { requireUser } from "@/lib/authorization";
import Link from "next/link";
import { subjectNames } from "@/content/subject-catalog";
import { db } from "@/db/client";
import { getStudyRecommendations } from "@/server/use-cases/study-priority";
import { formatLicenseDate, licenseExpiryLabel } from "@/components/license-validity";
import { RecoveryCodeSettings } from "@/components/recovery-code-settings";
import { FeedbackBox } from "@/components/feedback-box";
import { canReviewFeedback } from "@/lib/feedback-permissions";
import { getLicenseAccess } from "@/lib/license-career-access";

const PRIORITY_LABEL: Record<string, string> = {
  ALTA: "Prioridad alta",
  MEDIA: "Prioridad media",
  BAJA: "Prioridad baja",
};

const PRIORITY_COLOR: Record<string, string> = {
  ALTA: "text-alerta",
  MEDIA: "text-acento",
  BAJA: "text-aprobado",
};

export default async function PerfilPage() {
  const user = await requireUser();
  const access = getLicenseAccess(user);
  const singleCareer = access.careerScope === "SINGLE_CAREER";

  const license = await db.license.findUnique({
    where: { userId: user.id },
    include: { product: { select: { name: true } } },
  });

  const recommendations = await getStudyRecommendations(user.id, access);
  const history =
    singleCareer && !access.selectedCareerId
      ? []
      : await db.attempt.findMany({
          where: {
            userId: user.id,
            status: { in: ["ENTREGADO", "EXPIRADO"] },
            ...(singleCareer
              ? { config: { path: ["careerId"], equals: access.selectedCareerId! } }
              : {}),
          },
          orderBy: { startedAt: "desc" },
          take: 30,
          include: { results: true },
        });

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-display text-3xl text-pizarron">Hola, {user.name}</h1>
      <p className="mt-1 text-sm text-ink/60">{user.email}</p>

      <section className="mt-8 rounded-md border border-ink/10 bg-white p-4">
        <h2 className="font-display text-lg text-pizarron">Tu licencia</h2>
        {license ? (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-ink/60">Producto</dt>
            <dd>{license.product.name}</dd>
            <dt className="text-ink/60">Estado</dt>
            <dd>{license.status}</dd>
            {license.validityMonths && (
              <>
                <dt className="text-ink/60">Duración</dt>
                <dd>{license.validityMonths} meses naturales desde la activación</dd>
              </>
            )}
            <dt className="text-ink/60">Inicio</dt>
            <dd>
              {license.startsAt || license.activatedAt
                ? formatLicenseDate((license.startsAt ?? license.activatedAt)!)
                : license.validityMonths
                  ? "Pendiente de activación"
                  : "—"}
            </dd>
            <dt className="text-ink/60">Vence</dt>
            <dd>{licenseExpiryLabel(license)}</dd>
            <dt className="text-ink/60">Carreras incluidas</dt>
            <dd>
              {license.careerScope === "SINGLE_CAREER"
                ? "Una sola carrera (primera elección confirmada)"
                : "Todas las carreras"}
            </dd>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-ink/60">No se encontró una licencia asociada.</p>
        )}
        <Link
          href="/mi-acceso"
          className="mt-3 inline-flex min-h-11 items-center text-sm text-pizarron underline"
        >
          Ver duración, vencimiento y carrera de mi acceso
        </Link>
      </section>

      <RecoveryCodeSettings />
      <FeedbackBox />
      {canReviewFeedback(user) && (
        <Link
          href="/admin/feedback"
          className="mt-3 inline-flex min-h-11 items-center text-sm text-pizarron underline"
        >
          Revisar mensajes del buzón
        </Link>
      )}

      <section className="mt-8">
        <h2 className="font-display text-lg text-pizarron">Qué estudiar hoy</h2>
        <p className="mt-1 text-sm text-ink/60">
          Calculada a partir de tu precisión, tus errores recientes y cuánto llevas sin practicar
          cada tema.
        </p>

        {recommendations.length === 0 ? (
          <p className="mt-4 text-sm text-ink/50">
            Todavía no tienes práctica registrada — empieza en{" "}
            <a href="/practica" className="text-pizarron underline">
              Práctica
            </a>
            .
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-ink/10 rounded-md border border-ink/10 bg-white">
            {recommendations.slice(0, 5).map((item) => (
              <li key={item.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-ink">{item.topic.name}</p>
                  <p className="text-ink/50">{item.topic.subject.name}</p>
                  <Link
                    className="inline-flex min-h-11 items-center text-pizarron underline"
                    href={`/practica?subject=${encodeURIComponent(item.topic.subjectId)}&topic=${encodeURIComponent(item.topicId)}&scope=official`}
                  >
                    ▶ Repasar
                  </Link>
                </div>
                <span className={`font-medium ${PRIORITY_COLOR[item.priority]}`}>
                  {PRIORITY_LABEL[item.priority]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-8">
        <h2 className="font-display text-lg text-pizarron">Tu evolución</h2>
        <p className="mt-1 text-sm text-ink/60">
          Últimos 30 intentos. Los porcentajes corresponden a ejercicios de práctica, no predicen tu
          admisión.
        </p>
        {!history.length && (
          <p className="mt-4 text-sm">Al entregar tu primer intento aparecerá aquí.</p>
        )}
        <ol className="mt-4 space-y-3">
          {history.map((attempt) => (
            <li key={attempt.id} className="rounded-md border border-ink/10 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p>
                  {attempt.type === "SIMULADOR" ? "Simulador" : "Práctica"} ·{" "}
                  {attempt.startedAt.toLocaleDateString("es-MX", {
                    timeZone: "America/Mexico_City",
                  })}
                </p>
                <p>
                  {attempt.status === "EXPIRADO"
                    ? "Tiempo agotado"
                    : `${Math.round(attempt.score ?? 0)}%`}
                </p>
              </div>
              {attempt.results.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer">Resultado por asignatura</summary>
                  <ul className="mt-3 space-y-3">
                    {attempt.results.map((result) => (
                      <li key={result.id}>
                        <div className="flex flex-wrap justify-between gap-2">
                          <span>
                            {subjectNames[result.subjectId.replace("uaq-2026-2-subject-", "")] ??
                              "Asignatura"}
                          </span>
                          <span>{Math.round(result.score)}%</span>
                        </div>
                        <progress
                          className="h-2 w-full accent-pizarron"
                          aria-label="Resultado por asignatura"
                          value={result.score}
                          max={100}
                        />
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {attempt.status === "ENTREGADO" && (
                <Link
                  className="inline-flex min-h-11 items-center text-sm text-pizarron underline"
                  href={`/resultados/${attempt.id}`}
                >
                  Revisar respuestas y explicaciones
                </Link>
              )}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
