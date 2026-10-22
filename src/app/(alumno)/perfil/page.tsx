import { requireUser } from "@/lib/authorization";
import { db } from "@/db/client";
import { getStudyRecommendations } from "@/server/use-cases/study-priority";

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

  const license = await db.license.findUnique({
    where: { userId: user.id },
    include: { product: { select: { name: true } } },
  });

  const recommendations = await getStudyRecommendations(user.id);

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
            <dt className="text-ink/60">Vence</dt>
            <dd>
              {license.expiresAt
                ? license.expiresAt.toLocaleDateString("es-MX")
                : "Sin vencimiento"}
            </dd>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-ink/60">No se encontró una licencia asociada.</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg text-pizarron">Recomendación de estudio</h2>
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
            {recommendations.map((item) => (
              <li key={item.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-ink">{item.topic.name}</p>
                  <p className="text-ink/50">{item.topic.subject.name}</p>
                </div>
                <span className={`font-medium ${PRIORITY_COLOR[item.priority]}`}>
                  {PRIORITY_LABEL[item.priority]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
