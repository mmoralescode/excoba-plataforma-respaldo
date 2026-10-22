import Link from "next/link";

export function HomeStart() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Link
        href="/activar"
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-pizarron px-5 py-3 text-white"
      >
        Tengo un folio
      </Link>
      <Link
        href="/login?next=%2Festudio"
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-pizarron px-5 py-3 text-pizarron"
      >
        Iniciar sesión
      </Link>
    </div>
  );
}
