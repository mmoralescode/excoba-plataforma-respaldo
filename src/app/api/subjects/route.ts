import { NextResponse } from "next/server";
import { getStudySubjects } from "@/server/use-cases/study-subjects";
import { requireUser, UnauthorizedError } from "@/lib/authorization";

export const dynamic = "force-dynamic";
import { getLicenseAccess } from "@/lib/license-career-access";

export async function GET() {
  try {
    const user = await requireUser();
    const subjects = await getStudySubjects(user.id, getLicenseAccess(user));
    return NextResponse.json({ subjects: subjects.map(({ topics, ...subject }) => subject) });
  } catch (error) {
    if (error instanceof UnauthorizedError)
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    console.error("Error listando materias:", error);
    return NextResponse.json({ error: "No se pudieron cargar las asignaturas." }, { status: 500 });
  }
}
