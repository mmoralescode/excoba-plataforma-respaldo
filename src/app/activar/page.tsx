"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RecoveryCodeDisplay } from "@/components/recovery-code-display";

export default function ActivarPage() {
  const router = useRouter();
  const [step, setStep] = useState<"folio" | "registro" | "recovery">("folio");
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [folio, setFolio] = useState("");
  const [licenseId, setLicenseId] = useState<string | null>(null);
  const [validityMonths, setValidityMonths] = useState<number | null>(null);
  const [careerScope, setCareerScope] = useState<"ALL_CAREERS" | "SINGLE_CAREER">("ALL_CAREERS");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const clearSecrets = () => {
      setRecoveryCode(null);
      setPassword("");
    };
    window.addEventListener("pagehide", clearSecrets);
    return () => window.removeEventListener("pagehide", clearSecrets);
  }, []);

  async function handleValidateFolio(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/licenses/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folio: folio.trim().toUpperCase() }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "El folio no es válido.");
        return;
      }

      setLicenseId(data.licenseId);
      setValidityMonths(typeof data.validityMonths === "number" ? data.validityMonths : null);
      setCareerScope(data.careerScope === "SINGLE_CAREER" ? "SINGLE_CAREER" : "ALL_CAREERS");
      setExpiresAt(typeof data.expiresAt === "string" ? data.expiresAt : null);
      setStep("registro");
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    if (loading || !licenseId) return;
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          licenseId,
          folio: folio.trim().toUpperCase(),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "No fue posible completar el registro.");
        return;
      }

      const data = await response.json().catch(() => ({}));
      setPassword("");
      setFolio("");
      setRecoveryCode(
        typeof data.recoveryCode === "string" && data.recoveryCode ? data.recoveryCode : null,
      );
      // Registration does not start a session. First let the student save the one-time secret.
      // A successful registration must not be retried if its response is incomplete.
      setStep("recovery");
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <p className="font-display text-sm uppercase tracking-widest text-acento">
        Plataforma EXCOBA
      </p>
      <h1 className="mt-2 font-display text-3xl text-pizarron">
        {step === "folio"
          ? "Activa tu folio"
          : step === "registro"
            ? "Crea tu cuenta"
            : "Tu cuenta está lista"}
      </h1>
      <p className="mt-2 text-sm text-ink/60">
        {step === "folio"
          ? "Ingresa el folio que recibiste para comenzar."
          : step === "registro"
            ? "Tu folio es válido. Completa tus datos para terminar."
            : "Guarda tu código de recuperación antes de iniciar sesión."}
      </p>

      {step === "folio" && (
        <p className="mt-3 text-sm leading-6 text-ink/70">
          Hay dos planes: 4 meses con todas las carreras, o 2 meses con una sola carrera. El plazo
          comienza cuando creas tu cuenta, no cuando recibes el folio. Antes de registrarte verás el
          plan de tu folio.
        </p>
      )}
      {step === "registro" && (validityMonths === 2 || validityMonths === 4) && (
        <div className="mt-4 space-y-2 rounded-md border border-ink/10 bg-white p-3 text-sm leading-6 text-ink/75">
          <p className="font-medium text-pizarron">
            Tu plan: {validityMonths} meses ·{" "}
            {careerScope === "SINGLE_CAREER" ? "Una sola carrera" : "Todas las carreras"}
          </p>
          <p>
            Tu acceso dura {validityMonths} meses naturales desde la activación. El plazo comienza
            al completar este registro; tu fecha exacta de vencimiento aparecerá en Mi acceso.
          </p>
          {careerScope === "SINGLE_CAREER" && (
            <p>
              La primera carrera que confirmes será la única incluida en tu plan. No podrás
              cambiarla después. Elegirla no reinicia la vigencia.
            </p>
          )}
        </div>
      )}
      {step === "registro" &&
        validityMonths !== 2 &&
        validityMonths !== 4 &&
        expiresAt &&
        !Number.isNaN(Date.parse(expiresAt)) && (
          <p className="mt-4 text-sm leading-6 text-ink/70">
            Este folio conserva su vigencia hasta el{" "}
            {new Date(expiresAt).toLocaleDateString("es-MX", {
              dateStyle: "long",
              timeZone: "America/Mexico_City",
            })}
            .
          </p>
        )}

      {step !== "folio" && (
        <aside
          id="account-security-note"
          role="note"
          aria-labelledby="account-security-title"
          className="mt-4 space-y-2 rounded-md border border-acento/30 bg-white p-4 text-sm leading-6 text-ink/80"
        >
          <h2 id="account-security-title" className="font-medium text-pizarron">
            Importante: protege el acceso a tu cuenta
          </h2>
          <p>
            Es de suma importancia que recuerdes tu contraseña. Sigue estos pasos para no perder el
            acceso:
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Guarda tu contraseña en un gestor de contraseñas o en un lugar privado. No la
              compartas.
            </li>
            <li>
              {step === "registro"
                ? "Al crear tu cuenta, copia y guarda el código de recuperación que aparecerá en pantalla."
                : recoveryCode
                  ? "Copia y guarda el código de recuperación que aparece abajo antes de continuar."
                  : "Si el código no aparece, inicia sesión con la contraseña que elegiste y genera uno nuevo desde Perfil."}{" "}
              Solo se muestra una vez. Es distinto del folio y cada código se puede usar una sola
              vez. No lo compartas.
            </li>
            <li>
              Si olvidas tu contraseña, entra a Iniciar sesión → Olvidé mi contraseña. Escribe el
              correo de tu cuenta y el código de recuperación; elige y confirma una nueva
              contraseña. El código utilizado dejará de funcionar.
            </li>
            <li>
              Después, inicia sesión con tu nueva contraseña y genera otro código en Perfil →
              Protege el acceso a tu cuenta → Generar código de recuperación. Confirma tu contraseña
              actual y guarda el nuevo código para una futura recuperación.
            </li>
          </ol>
          <p>
            Puedes recuperar tu cuenta nuevamente con un código nuevo y válido. Si vuelves a olvidar
            la contraseña sin haber guardado un código nuevo y válido, no podrás recuperarla
            mediante este método.
          </p>
        </aside>
      )}

      {step === "folio" && (
        <form
          onSubmit={handleValidateFolio}
          aria-busy={loading}
          className="mt-8 flex flex-col gap-4"
        >
          <label className="flex flex-col gap-1 text-sm text-ink/70">
            Folio
            <input
              type="text"
              required
              minLength={10}
              maxLength={32}
              disabled={loading}
              autoComplete="off"
              placeholder="EXCOBA-XXXX-XXXX"
              value={folio}
              onChange={(e) => setFolio(e.target.value)}
              className="rounded-md border border-ink/20 px-3 py-2 font-mono text-ink outline-none focus:border-pizarron"
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-alerta">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-md bg-pizarron px-4 py-2 text-white transition hover:bg-pizarron/90 disabled:opacity-50"
          >
            {loading ? "Validando…" : "Continuar"}
          </button>
        </form>
      )}

      {step === "registro" && (
        <form onSubmit={handleRegister} aria-busy={loading} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-ink/70">
            Nombre completo
            <input
              type="text"
              required
              disabled={loading}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-ink/20 px-3 py-2 text-ink outline-none focus:border-pizarron"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-ink/70">
            Correo
            <input
              type="email"
              required
              maxLength={254}
              disabled={loading}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmail(email.trim())}
              className="rounded-md border border-ink/20 px-3 py-2 text-ink outline-none focus:border-pizarron"
              autoComplete="email"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-ink/70">
            Contraseña (de 10 a 128 caracteres)
            <input
              type="password"
              required
              minLength={10}
              maxLength={128}
              disabled={loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-ink/20 px-3 py-2 text-ink outline-none focus:border-pizarron"
              autoComplete="new-password"
              aria-describedby="account-security-note"
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-alerta">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-md bg-pizarron px-4 py-2 text-white transition hover:bg-pizarron/90 disabled:opacity-50"
          >
            {loading
              ? "Creando cuenta…"
              : validityMonths === 2 || validityMonths === 4
                ? "Crear cuenta y activar acceso"
                : "Crear cuenta"}
          </button>
        </form>
      )}

      {step === "recovery" ? (
        <div className="mt-6">
          {recoveryCode ? (
            <RecoveryCodeDisplay
              code={recoveryCode}
              onSaved={() => {
                setRecoveryCode(null);
                router.push("/login");
              }}
            />
          ) : (
            <div className="space-y-4 text-sm leading-6 text-ink/70">
              <p role="status">
                Tu cuenta ya se creó. El código no está disponible en esta pantalla; inicia sesión
                con la contraseña que elegiste y genera uno nuevo desde tu perfil.
              </p>
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center rounded-md bg-pizarron px-4 py-2 text-white"
              >
                Iniciar sesión
              </Link>
            </div>
          )}
        </div>
      ) : (
        <Link href="/login" className="mt-6 text-sm text-ink/60 hover:text-pizarron">
          Ya tengo cuenta — iniciar sesión
        </Link>
      )}
    </main>
  );
}
