"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

const LINKS = [
  { href: "/instructivo", label: "Instructivo" },
  { href: "/estudio", label: "Estudio" },
  { href: "/practica", label: "Práctica" },
  { href: "/simulador", label: "Simulador" },
  { href: "/perfil", label: "Perfil" },
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
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <p className="font-display text-lg text-pizarron">EXCOBA</p>
        <div className="flex items-center gap-6 text-sm">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-ink/70 hover:text-pizarron">
              {link.label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="text-ink/50 hover:text-alerta"
            type="button"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </nav>
  );
}
