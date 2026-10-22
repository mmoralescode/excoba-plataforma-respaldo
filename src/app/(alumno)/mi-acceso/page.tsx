import { LicenseAccessDetails } from "@/components/license-access-provider";

export default function MiAccesoPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-3xl text-pizarron">Mi acceso</h1>
      <p className="mt-2 text-sm leading-6 text-ink/65">
        Consulta la duración de tu plan, su vencimiento y las carreras que incluye.
      </p>
      <LicenseAccessDetails />
    </main>
  );
}
