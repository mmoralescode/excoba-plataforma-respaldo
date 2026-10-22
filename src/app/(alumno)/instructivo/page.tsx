import { ProtectedCurriculumPage } from "@/components/protected-curriculum-page";

export default async function InstructivoPage() {
  return <ProtectedCurriculumPage returnPath="/instructivo" />;
}
