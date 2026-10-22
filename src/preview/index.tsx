import { createRoot } from "react-dom/client";
import { CurriculumBrowser } from "../components/curriculum-browser";
import { officialSubjects, officialTopics } from "../content/study-plan";

createRoot(document.getElementById("root")!).render(
  <main className="mx-auto max-w-3xl px-6 py-12">
    <p className="text-sm text-acento">Plataforma EXCOBA</p>
    <h1 className="mt-2 font-display text-3xl text-pizarron">Instructivo por temas</h1>
    <p className="mt-3 text-ink/70">Consulta todos los temas del instructivo oficial EXCOBA.</p>
    <a
      href="https://excoba-plataforma.vercel.app"
      className="mt-3 inline-block text-pizarron underline"
    >
      Entrar a la plataforma
    </a>
    <CurriculumBrowser subjects={officialSubjects} topics={officialTopics} />
  </main>,
);
