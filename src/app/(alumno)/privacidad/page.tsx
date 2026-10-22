import { PrivacyNoticeContent } from "@/components/privacy-notice-content";

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <p className="font-display text-sm uppercase tracking-widest text-acento">
        Plataforma EXCOBA
      </p>
      <h1 className="mt-2 font-display text-3xl text-pizarron">Aviso de privacidad</h1>
      <p className="mt-3 text-sm leading-6 text-ink/70">
        Mensaje informativo sobre el uso de tus datos en la plataforma.
      </p>
      <div className="mt-8 rounded-xl border border-ink/10 bg-white p-5 sm:p-6">
        <PrivacyNoticeContent />
      </div>
    </main>
  );
}
