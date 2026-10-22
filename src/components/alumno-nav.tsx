"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

const LINKS = [
  { href: "/estudio", label: "Estudio" },
  { href: "/practica", label: "Práctica" },
  { href: "/instructivo", label: "Instructivo" },
  { href: "/simulador", label: "Simulador" },
  { href: "/mi-acceso", label: "Mi acceso" },
  { href: "/perfil", label: "Perfil" },
  { href: "/privacidad", label: "Privacidad" },
];

export function AlumnoNav() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="border-b border-ink/10 bg-white">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <Link href="/estudio" className="font-display text-lg text-pizarron">
          EXCOBA
        </Link>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-ink/70 hover:text-pizarron">
              {link.label}
            </Link>
          ))}
          <button onClick={handleLogout} className="text-ink/50 hover:text-alerta" type="button">
            Cerrar sesión
          </button>
        </div>
      </div>
    </nav>
  );
}
