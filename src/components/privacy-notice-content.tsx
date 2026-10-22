"use client";

import {
  PRIVACY_NOTICE_UPDATED_AT,
  PRIVACY_NOTICE_VERSION,
} from "@/content/privacy-notice-version";

export function PrivacyNoticeContent() {
  return (
    <div className="space-y-6 text-sm leading-6 text-ink/75">
      <section className="space-y-2">
        <h2 className="font-display text-xl text-pizarron">Sobre tus datos</h2>
        <p>
          Este mensaje explica cómo utiliza tus datos la Plataforma EXCOBA para ofrecerte acceso y
          acompañar tu estudio. Aceptarlo registra que lo leíste; no implica renunciar a tus
          derechos de protección de datos.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl text-pizarron">Datos que tratamos</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Identidad y contacto: nombre completo y correo electrónico.</li>
          <li>
            Acceso: contraseña y código de recuperación en formato hash, fechas de generación y uso
            del código, sesiones y agente de navegador. No conservamos tu código de recuperación en
            texto legible.
          </li>
          <li>Licencia: hash del folio, últimos cuatro caracteres, estado y vigencia.</li>
          <li>
            Buzón opcional: sugerencias o reportes que envías, sección indicada y fechas de envío y
            revisión. Se vinculan a tu cuenta y solo administración, soporte y las personas
            autorizadas para revisar el buzón pueden consultarlos. No incluyas contraseñas, folios,
            códigos de recuperación ni datos sensibles.
          </li>
          <li>
            Uso académico: carrera seleccionada, ejercicios contestados, resultados, avance y
            recomendaciones de estudio.
          </li>
          <li>
            Seguridad: datos técnicos necesarios para prevenir intentos automatizados y proteger el
            acceso.
          </li>
        </ul>
        <p>No solicitamos datos personales sensibles.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl text-pizarron">Finalidades necesarias</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Crear y administrar tu cuenta, licencia y autenticación.</li>
          <li>Proporcionar el instructivo, prácticas, simuladores y seguimiento de avance.</li>
          <li>Calcular recomendaciones de estudio a partir de tu desempeño.</li>
          <li>Atender recuperación de contraseña, soporte y comunicaciones operativas.</li>
          <li>Recibir sugerencias y reportes de errores para mejorar la plataforma.</li>
          <li>Prevenir fraude, abuso, accesos no autorizados e incidentes de seguridad.</li>
          <li>Cumplir obligaciones legales y conservar evidencia de operaciones relevantes.</li>
        </ul>
        <p>La plataforma no incorpora funciones de publicidad ni seguimiento publicitario.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl text-pizarron">Encargados y transferencias</h2>
        <p>
          Utilizamos proveedores que tratan datos por nuestra cuenta para operar la plataforma:
          Vercel, Inc. para alojamiento y seguridad; Neon, Inc. para la base de datos; y Resend,
          Inc. cuando se habilitan correos transaccionales.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl text-pizarron">Conservación y seguridad</h2>
        <p>
          Tu cuenta conserva el historial de prácticas y avance. La plataforma aplica controles de
          acceso, cifrado en tránsito, contraseñas con hash y sesiones revocables. El vencimiento
          del folio no elimina automáticamente los registros de tu cuenta.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl text-pizarron">Cookies y preferencias</h2>
        <p>
          Utilizamos una cookie para mantener tu sesión y otra para recordar la carrera elegida en
          este navegador. Puedes eliminarlas desde la configuración del navegador; al hacerlo
          tendrás que iniciar sesión o seleccionar tu carrera nuevamente. La aceptación de este
          mensaje queda guardada en tu cuenta, aunque cambies de dispositivo.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl text-pizarron">Cambios al aviso</h2>
        <p>
          Publicaremos cualquier cambio en este apartado y, si es sustancial, mostraremos la nueva
          versión al iniciar sesión para que puedas revisarla. Versión {PRIVACY_NOTICE_VERSION},
          última actualización: {PRIVACY_NOTICE_UPDATED_AT}.
        </p>
      </section>
    </div>
  );
}
