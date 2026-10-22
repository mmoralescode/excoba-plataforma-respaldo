import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { AlumnoNav } from "@/components/alumno-nav";
import { PrivacyNoticeDialog } from "@/components/privacy-notice-dialog";
import { PRIVACY_NOTICE_VERSION } from "@/content/privacy-notice-version";
import { getLicenseAccess } from "@/lib/license-career-access";
import { LicenseAccessProvider, LicenseAccessBanner } from "@/components/license-access-provider";

export default async function AlumnoLayout({ children }: { children: React.ReactNode }) {
  // Guardia server-side real: el middleware sólo revisa que exista una
  // cookie con forma válida; esta llamada es la que efectivamente valida
  // la sesión contra la base de datos (ver Módulo 1, sección 10).
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const needsPrivacyNotice =
    !user.privacyNoticeAcceptedAt || user.privacyNoticeVersion !== PRIVACY_NOTICE_VERSION;

  return (
    <LicenseAccessProvider initialAccess={getLicenseAccess(user)}>
      <div className="min-h-screen bg-paper">
        <AlumnoNav />
        <LicenseAccessBanner />
        {children}
        {needsPrivacyNotice && <PrivacyNoticeDialog />}
      </div>
    </LicenseAccessProvider>
  );
}
