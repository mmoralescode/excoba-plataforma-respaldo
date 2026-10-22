import { HomeStart } from "@/components/home-start";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-12 sm:py-20">
      <p className="font-display text-sm uppercase tracking-widest text-acento">
        Plataforma EXCOBA
      </p>
      <h1 className="font-display text-4xl leading-tight text-pizarron sm:text-5xl">
        Tu carrera marca el inicio.
      </h1>
      <p className="max-w-xl text-lg leading-7 text-ink/75">
        Prepara tu ingreso a la UAQ: elige tu carrera, decide por dónde empezar y practica a tu
        ritmo.
      </p>
      <HomeStart />
    </main>
  );
}
