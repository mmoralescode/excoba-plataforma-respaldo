import Link from "next/link";

export function AdminAccessDenied() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <p className="font-display text-sm uppercase tracking-widest text-acento">
        Plataforma EXCOBA
      </p>
      <h1 className="mt-2 font-display text-3xl text-pizarron">Acceso restringido</h1>
      <p className="mt-4 text-sm leading-6 text-ink/75">
        Tu cuenta no tiene permisos para esta sección administrativa. El buzón administrativo solo
        puede consultarlo el equipo de administración y soporte o las cuentas autorizadas para
        revisarlo.
      </p>
      <p className="mt-3 text-sm leading-6 text-ink/75">
        Para enviar una sugerencia o reportar un error no necesitas entrar al panel: utiliza el
        buzón de tu perfil. Tu sesión sigue abierta.
      </p>
      <Link
        href="/perfil#buzon"
        className="mt-6 inline-flex min-h-11 items-center rounded-md bg-pizarron px-4 py-2 text-sm text-white"
      >
        Ir al buzón de mi perfil
      </Link>
    </main>
  );
}
