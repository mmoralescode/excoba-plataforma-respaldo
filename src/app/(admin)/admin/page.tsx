import { db } from "@/db/client";
import { requirePageRole } from "@/lib/page-authorization";
import { AdminAccessDenied } from "@/components/admin-access-denied";

export default async function AdminHomePage() {
  // Layouts and pages may render in parallel; authorize before querying metrics.
  const user = await requirePageRole("SUPER_ADMIN", "EDITOR_ACADEMICO", "SOPORTE", "ANALISTA");
  if (!user) return <AdminAccessDenied />;
  const [totalAlumnos, licenciasActivas, preguntasPublicadas, simuladoresHoy] = await Promise.all([
    db.user.count({ where: { roles: { some: { role: { name: "ALUMNO" } } } } }),
    db.license.count({ where: { status: "ACTIVADA" } }),
    db.question.count({ where: { status: "PUBLICADO", deletedAt: null } }),
    db.attempt.count({
      where: { type: "SIMULADOR", startedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
  ]);

  const metrics = [
    { label: "Alumnos registrados", value: totalAlumnos },
    { label: "Licencias activas", value: licenciasActivas },
    { label: "Preguntas publicadas", value: preguntasPublicadas },
    { label: "Simuladores iniciados hoy", value: simuladoresHoy },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl text-pizarron">Resumen</h1>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-md border border-ink/10 bg-white p-4">
            <p className="text-2xl font-semibold text-pizarron">{m.value}</p>
            <p className="text-sm text-ink/60">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
