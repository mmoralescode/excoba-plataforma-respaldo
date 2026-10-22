import { requireRole } from "@/lib/authorization";
import { db } from "@/db/client";

export default async function AdminLicensesPage() {
  await requireRole("SUPER_ADMIN", "SOPORTE");

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

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ink/10 text-ink/60">
            <th className="py-2">Producto</th>
            <th className="py-2">Folio (últimos 4)</th>
            <th className="py-2">Estado</th>
            <th className="py-2">Alumno</th>
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
                {license.expiresAt ? license.expiresAt.toLocaleDateString("es-MX") : "Sin vencimiento"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
