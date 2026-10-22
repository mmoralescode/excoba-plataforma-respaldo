import Link from "next/link";
import { db } from "@/db/client";
import { requireUser } from "@/lib/authorization";

export default async function EstudioPage() {
  const user = await requireUser();
  const subjects = await db.subject.findMany({
    orderBy: { order: "asc" },
    include: { topics: { select: { id: true, progress: { where: { userId: user.id }, select: { totalAttempts: true } } } } },
  });

  return <main className="mx-auto max-w-3xl px-6 py-16">
    <p className="font-display text-sm uppercase tracking-widest text-acento">Tu avance</p>
    <h1 className="mt-2 font-display text-3xl text-pizarron">Progreso por asignatura</h1>
    <p className="mt-2 text-ink/70">Elige ▶ para practicar. Tu avance se actualiza al completar reactivos.</p>
    <div className="mt-8 space-y-3">
      {subjects.map((subject) => {
        const total = subject.topics.length;
        const completed = subject.topics.filter((topic) => topic.progress.some((progress) => progress.totalAttempts > 0)).length;
        const percent = total ? Math.round((completed / total) * 100) : 0;
        return <section key={subject.id} className="rounded-lg border border-ink/10 bg-white p-4"><div className="flex items-center justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><h2 className="font-medium text-ink">{subject.name}</h2><span className="text-sm text-ink/60">{percent}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-acento" style={{ width: `${percent}%` }} /></div></div><Link href={`/practica?subject=${subject.id}`} aria-label={`Practicar ${subject.name}`} className="grid h-9 w-9 place-items-center rounded-full bg-pizarron text-sm text-white hover:bg-pizarron/90">▶</Link></div></section>;
      })}
    </div>
  </main>;
}
