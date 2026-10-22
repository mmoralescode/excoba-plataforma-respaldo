import type { Config } from "tailwindcss";

/**
 * Tokens de diseño iniciales de la plataforma EXCOBA.
 * Estos valores se refinarán en el Módulo 9 (Panel administrativo) y en el
 * trabajo de UI de estudio/simulador, pero se fijan aquí para tener
 * consistencia desde el primer commit.
 */
const config: Config = {
  content: [
    "./src/preview/**/*.{ts,tsx}",
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/modules/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1C2321",
        paper: "#F7F5F0",
        pizarron: "#233D4D",
        acento: "#B4654A",
        aprobado: "#3A7D44",
        alerta: "#B4654A",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
      },
    },
  },
  plugins: [],
};

export default config;
