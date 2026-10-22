import { requireUser } from "@/lib/authorization";
import { getStudySubjects } from "@/server/use-cases/study-subjects";
import { StudyDashboard } from "@/components/study-dashboard";
import { getLicenseAccess } from "@/lib/license-career-access";

export default async function EstudioPage() {
  const user = await requireUser();
  const subjects = await getStudySubjects(user.id, getLicenseAccess(user));
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-3xl text-pizarron">Tu progreso por asignatura</h1>
      <StudyDashboard subjects={subjects} />
    </main>
  );
}
