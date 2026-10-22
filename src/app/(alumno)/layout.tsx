import { requireUser } from "@/lib/authorization";
import { AlumnoNav } from "@/components/alumno-nav";

export default async function AlumnoLayout({ children }: { children: React.ReactNode }) {
  // Guardia server-side real: el middleware sólo revisa que exista una
  // cookie con forma válida; esta llamada es la que efectivamente valida
  // la sesión contra la base de datos (ver Módulo 1, sección 10).
  await requireUser();

  return (
    <div className="min-h-screen bg-paper">
      <AlumnoNav />
      {children}
    </div>
  );
}
