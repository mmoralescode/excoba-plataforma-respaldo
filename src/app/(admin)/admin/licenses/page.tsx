import { requirePageRole } from "@/lib/page-authorization";
import { AdminAccessDenied } from "@/components/admin-access-denied";
import { db } from "@/db/client";
import { formatLicenseDate, licenseExpiryLabel } from "@/components/license-validity";

export default async function AdminLicensesPage() {
  const user = await requirePageRole("SUPER_ADMIN", "SOPORTE");
  if (!user) return <AdminAccessDenied />;

  const licenses = await db.license.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { product: { select: { name: true } }, user: { select: { email: true } } },
  });

  return (
    <div>
      <h1 className="font-display text-2xl text-pizarron">Licencias</h1>
      <p className="mt-1 text-sm text-ink/60">
        El alta de nuevas licencias se realiza vía{" "}
        <code className="rounded bg-ink/5 px-1">POST /api/admin/licenses</code> (requiere rol
        SUPER_ADMIN o SOPORTE). El folio en texto plano sólo se muestra una vez en esa respuesta.
      </p>
      <p className="mt-3 text-sm leading-6 text-ink/70">
        Los nuevos folios son de 4 meses con todas las carreras, o de 2 meses con una sola carrera:
        la primera que el alumno confirme. Envía validityMonths: 4 o validityMonths: 2 al crear el
        folio; el alcance se asigna automáticamente. La vigencia comienza al crear la cuenta.
        Mientras no se activen, no tienen fecha de inicio ni de vencimiento.
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Las 50 licencias más recientes y su vigencia</caption>
          <thead>
            <tr className="border-b border-ink/10 text-ink/60">
              <th className="py-2">Producto</th>
              <th className="py-2">Folio (últimos 4)</th>
              <th className="py-2">Estado</th>
              <th className="py-2">Alumno</th>
              <th className="py-2">Duración</th>
              <th className="py-2">Acceso</th>
              <th className="py-2">Inicio</th>
              <th className="py-2">Vence</th>
            </tr>
          </thead>
          <tbody>
            {licenses.map((license) => (
              <tr key={license.id} className="border-b border-ink/5">
                <td className="py-2">{license.product.name}</td>
                <td className="py-2">···· {license.codeLastFour}</td>
                <td className="py-2">{license.status}</td>
                <td className="py-2">{license.user?.email ?? "—"}</td>
                <td className="py-2">
                  {license.validityMonths
                    ? `${license.validityMonths} meses naturales`
                    : "Vigencia anterior"}
                </td>
                <td className="py-2">
                  {license.careerScope === "SINGLE_CAREER"
                    ? "Una sola carrera"
                    : "Todas las carreras"}
                </td>
                <td className="py-2">
                  {license.startsAt || license.activatedAt
                    ? formatLicenseDate((license.startsAt ?? license.activatedAt)!)
                    : license.validityMonths
                      ? "Pendiente de activación"
                      : "—"}
                </td>
                <td className="py-2">{licenseExpiryLabel(license)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
