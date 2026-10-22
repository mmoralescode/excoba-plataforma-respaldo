import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plataforma EXCOBA",
  description:
    "Plataforma de estudio, práctica y simuladores para el examen EXCOBA de la UAQ.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Leer headers() aquí, en el layout raíz, obliga a Next.js a renderizar
  // toda la app dinámicamente (por solicitud) en vez de estáticamente en
  // tiempo de compilación. Es necesario para que el nonce de la CSP que
  // genera el middleware (distinto en cada solicitud) siempre coincida con
  // el nonce que Next.js inyecta en sus propios scripts — si alguna página
  // quedara congelada como estática, tendría un nonce viejo que ya no
  // coincide con la cabecera CSP de la respuesta actual, y el navegador
  // bloquearía la hidratación de React igual que antes de este fix.
  headers();

  return (
    <html lang="es">
      <body className="bg-paper text-ink font-body antialiased">
        {children}
      </body>
    </html>
  );
}
