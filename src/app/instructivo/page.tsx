import Link from "next/link";
import { OFFICIAL_EXCOBA_TOPICS } from "@/content/excoba-guide";

export default function InstructivoPage() {
  const stages = [...new Set(OFFICIAL_EXCOBA_TOPICS.map((topic) => topic.stage))];
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="font-display text-sm uppercase tracking-widest text-acento">Guía de estudio</p>
      <h1 className="mt-2 font-display text-3xl text-pizarron">Instructivo EXCOBA</h1>
      <p className="mt-3 max-w-2xl text-ink/75">Esta plataforma incluye todos los temas del instructivo oficial EXCOBA: primaria, secundaria y las ocho áreas de bachillerato. Aquí tienes el mapa para orientarte, no una copia extensa de la guía.</p>
      <div className="mt-8 space-y-8">
        {stages.map((stage) => <section key={stage}>
          <h2 className="font-display text-xl text-pizarron">{stage}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {OFFICIAL_EXCOBA_TOPICS.filter((topic) => topic.stage === stage).map((topic) => <article key={topic.area} className="rounded-lg border border-ink/10 bg-white p-4">
              <h3 className="font-medium text-ink">{topic.area}</h3><p className="mt-2 text-sm leading-6 text-ink/70">{topic.coverage}</p>
            </article>)}
          </div>
        </section>)}
      </div>
      <aside className="mt-10 rounded-lg bg-pizarron p-5 text-white"><p className="font-medium">Formato de reactivos</p><p className="mt-1 text-sm text-white/80">Practica respuestas por arrastre, selección y escritura numérica o algebraica; algunas preguntas pueden requerir más de una respuesta.</p><Link href="/" className="mt-3 inline-block text-sm underline">Elegir carrera y comenzar</Link></aside>
    </main>
  );
}
