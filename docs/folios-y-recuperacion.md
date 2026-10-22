# Folios semestrales y recuperación de contraseña

> Histórico: el plan de seis meses fue retirado el 30 de septiembre de 2026. No emitir ni reactivar estos folios. Los planes nuevos son de cuatro meses/todas las carreras y dos meses/primera carrera confirmada. Ver [planes y operación vigente](planes-de-acceso.md). El script antiguo solo admite verificación histórica.

## Reglas

- Los nuevos folios tienen 16 caracteres criptográficos, además del prefijo y separadores. La base almacena únicamente SHA-256 y los últimos cuatro caracteres; su índice único impide duplicados.
- El lote solicitado contiene exactamente 30 licencias de seis meses naturales, calculados en UTC desde el registro completado. La fecha se ajusta al último día de meses cortos. Emitir o validar un folio no inicia su vigencia.
- Un folio solo se vincula a una cuenta: la reclamación exige el secreto, no solo el identificador, y una actualización condicional dentro de la misma transacción que crea al alumno. Una carrera entre registros tiene un ganador; el perdedor no deja usuario ni rol huérfano.
- Login y cada consulta de sesión comprueban licencia activa y vencimiento. Los roles administrativos conservan sus permisos; cuentas suspendidas/eliminadas no reciben acceso. Las licencias antiguas conservan sus fechas y reglas anteriores.
- Recuperación usa enlaces de 30 minutos, de un solo uso, y revoca sesiones y enlaces anteriores al cambiar la contraseña. El login se serializa con la recuperación para impedir que una contraseña anterior cree una sesión después del cambio.

## Migración y despliegue

La única ampliación funcional de esquema es `License.validityMonths Int?`, sin valor por defecto ni actualización retroactiva. El repositorio incluye un baseline del esquema real anterior y la migración aditiva. La base existente carecía de historial de Prisma; el baseline se debe **marcar aplicado, no ejecutar su SQL de creación sobre las tablas existentes**. El script `scripts/license-migrate.cjs` comprueba igualdad del esquema antes de hacerlo y aborta ante diferencias. Nunca usar `migrate reset`, `db push --accept-data-loss` ni ejecutar el seed para esta tarea.

La inspección previa encontró diferencias históricas entre el repositorio y PostgreSQL: reglas `NoAction` en claves foráneas, valores por defecto en `updatedAt` y `Question.tags`, ausencia del índice redundante `User_email_idx` y una columna anterior `License.validityDays`. El baseline describe esos hechos sin modificar relaciones ni datos. `validityDays` se conserva, ignorada por el cliente; los folios nuevos usan `validityMonths`. No se ejecuta el SQL de diferencias que proponía recrear claves foráneas.

Después de esa inicialización controlada, los despliegues normales ejecutan `prisma migrate deploy`. No generan lotes automáticamente.

## Operación del lote

`scripts/license-batch.ts` es una herramienta de operador, no una ruta web.

1. `prepare --file RUTA_PRIVADA --product ID_PRODUCTO --admin ID_ADMIN` genera el respaldo privado JSON y el CSV **fuera del repositorio**, antes de tocar la base. También genera un manifiesto `.hashes.json` sin folios en claro. El directorio privado debe tener ACL restringida en Windows; `mode: 0600` por sí solo no configura esas ACL.
2. `apply --file MANIFIESTO_HASHES` comprueba producto/administrador y crea las 30 licencias, eventos y auditoría en una transacción. El identificador de lote y el bloqueo de PostgreSQL permiten reintentar el **mismo** manifiesto sin crear otro lote. Un estado parcial o alterado provoca un error.
3. `verify --file MANIFIESTO_HASHES` confirma los 30 registros, sus hashes, vinculación, duración y fechas. No activa ningún folio.

No entregar el CSV hasta confirmar `verify`. No subir JSON privado, CSV, credenciales o enlaces de recuperación a GitHub, Vercel público ni registros. El manifiesto `operations/folios-30-2026-09-10.hashes.json` contiene únicamente identificadores y hashes; no permite recuperar los folios.

El 10 de septiembre de 2026 se comprobó igualdad del baseline con PostgreSQL, se registró ese baseline y se aplicó la columna nullable. El lote `45a86690-9857-4819-8762-1eee70a7fd08` creó 30 licencias; el segundo `apply` creó 0 y `verify` confirmó 30 pendientes de activación. La operación se ejecutó dentro de Vercel con su conexión protegida, sin descargar la credencial. Los builds exclusivos de diagnóstico/mantenimiento se detienen intencionalmente antes de publicar; el despliegue normal de la aplicación es independiente.

## Archivos/componentes principales

- Datos: `prisma/schema.prisma`, baseline y migraciones; `operations/folios-30-2026-09-10.hashes.json`.
- Operación: `scripts/license-batch.ts`, `scripts/license-db-preflight.ts`, `scripts/license-migrate.cjs`, `vercel.json`.
- Licencias: `src/lib/license-validity.ts`, `src/lib/license-access.ts`, `src/lib/security/tokens.ts`; casos de uso `create-license.ts`, `validate-license-folio.ts`, `register-user.ts`.
- Autenticación: `src/lib/session.ts`, `src/lib/security/auth-request.ts`, `src/lib/email/mailer.ts`, `src/db/client.ts`; casos de uso `login.ts`, `password-reset.ts`.
- API: licencias de administrador/activación y autenticación de login, registro, solicitud y confirmación de recuperación.
- Pantallas: activación, login, recuperación, confirmación, administración de licencias y perfil; `src/components/license-validity.ts`.
- Configuración/documentación: `.env.example`, `.gitignore`, `docs/email-setup.md` y este documento.
- Pruebas: folios, reglas de vigencia/acceso, registro concurrente, creación, correo, recuperación/rutas, login y sesiones.

## Correo pendiente de configuración

Ver [configuración de correo](email-setup.md). Hacen falta un dominio verificado, `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` y `EMAIL_FROM`. Sin esa configuración la recuperación devuelve 503 de forma explícita; no afirma haber enviado un correo. Las pruebas con proveedor simulado no sustituyen una comprobación real de entrega.
