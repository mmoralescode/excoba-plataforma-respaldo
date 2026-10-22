# Recuperación de contraseña sin correo

## Flujo del alumno

1. En un registro nuevo, después de canjear el folio y crear la cuenta, se muestra el código de recuperación una sola vez. El alumno lo copia y confirma que lo guardó antes de ir a iniciar sesión.
2. Las cuentas existentes lo generan en **Perfil → Protege el acceso a tu cuenta**, confirmando la contraseña actual. Generar otro invalida inmediatamente el anterior.
3. Desde **Iniciar sesión → Olvidé mi contraseña** (`/recuperar-password`) se introduce correo de la cuenta, código y nueva contraseña con confirmación.
4. Al recuperarla, se consume el código, se invalidan los enlaces de recuperación pendientes y se revocan todas las sesiones. El alumno debe iniciar sesión normalmente y generar un nuevo código.

El código es distinto del folio. No modifica su propietario ni vigencia, roles o progreso académico. Recuperar una contraseña no reactiva una licencia vencida.

Al crear la cuenta y al mostrar el código tras el canje, se muestra un aviso destacado para guardar la contraseña y el código. Explica que cada código se usa una sola vez y que debe generarse un reemplazo en Perfil después de usarlo; **no** impone un límite de una recuperación por cuenta. El campo de contraseña queda asociado al aviso para lectores de pantalla. El aviso no cambia la generación, el consumo ni el reemplazo de códigos.

**Importante:** quien ya olvidó su contraseña y nunca generó/guardó un código no puede usar este método retroactivamente. No existe un restablecimiento público con el folio ni una puerta de acceso para soporte. Las cuentas anteriores no reciben códigos predecibles o publicados en lote: cada alumno debe generarlo mientras conserve acceso a su cuenta.

## Seguridad y límites

- Código de 32 símbolos aleatorios uniformes (160 bits), prefijo `REC`, presentado en ocho grupos. Se toleran minúsculas, espacios y guiones al pegarlo.
- Se almacena solamente SHA-256 con separación de dominio, con índice único. La copia legible aparece exclusivamente en la respuesta de emisión y en memoria de la pantalla; no se guarda en URL, cookies, almacenamiento web ni registros del servidor. Copiar al portapapeles requiere una acción explícita del alumno.
- No tiene caducidad temporal corta: es un respaldo que dura hasta usarlo, reemplazarlo o restablecer la contraseña. No comparte los seis meses de vigencia del folio ni los 30 minutos del enlace por correo.
- Generarlo requiere sesión vigente, permisos de acceso y contraseña actual; se revalidan después de los bloqueos de base de datos. Dos generaciones concurrentes sobre el mismo estado no sobrescriben silenciosamente sus resultados.
- Uso único mediante actualización condicional dentro de una transacción: contraseña, consumo, invalidación de tokens, revocación de sesiones y auditoría se confirman o revierten juntos. La condición incluye el hash anterior de contraseña y código para rechazar lecturas obsoletas.
- Recuperación pública con errores genéricos, límite de cuerpo de 4 KiB, JSON y comprobación de origen. Las respuestas de emisión y recuperación llevan `private, no-store` y `no-referrer`.
- Límites por proceso: emisión 5 por usuario cada 15 minutos; recuperación 60 por IP, 10 por correo y 5 por código cada 15 minutos. Las claves de esos contadores son hashes. Existe un tiempo mínimo de respuesta de tres segundos en la recuperación pública.
- **Los contadores en memoria no son distribuidos ni persistentes entre instancias Vercel.** Son una defensa complementaria: para mayor escala conviene un limitador compartido. No sustituyen la entropía del código ni las condiciones transaccionales.
- El flujo existente de tokens por correo permanece compatible si se configura un proveedor. También invalida cualquier código de recuperación anterior. Este nuevo método no requiere Resend ni otra configuración de correo.

Referencia de diseño: [OWASP, Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), especialmente identificadores de recuperación, códigos sin conexión, respuesta genérica e invalidación de sesiones.

## Archivos y despliegue

- UI: `src/app/activar/page.tsx`, `src/app/recuperar-password/page.tsx`, `src/app/recuperar-password/confirmar/page.tsx`, `src/app/(alumno)/perfil/page.tsx`, `src/components/recovery-code-display.tsx`, `src/components/recovery-code-settings.tsx`.
- API: `src/app/api/account/recovery-code/route.ts` (privada), `src/app/api/auth/recover-with-code/route.ts` (pública), respuesta explícita del registro en `src/app/api/auth/register/route.ts`; excepción pública exacta en `src/middleware.ts`.
- Seguridad y casos de uso: `src/lib/security/recovery-code.ts`, `src/lib/security/recovery-http.ts`, `src/server/use-cases/recovery-code.ts`, `src/server/use-cases/register-user.ts`, `src/server/use-cases/password-reset.ts`.
- Información sobre datos de seguridad: `src/components/privacy-notice-content.tsx`. No incorpora otra finalidad ni resuelve los datos legales pendientes del aviso integral.
- Prisma: tres columnas opcionales en `User` (`recoveryCodeHash`, `recoveryCodeCreatedAt`, `recoveryCodeUsedAt`), índice único y migración `20260913210000_add_recovery_code`. No se crea una tabla ni se alteran las licencias.
- Aplicar con el comando de despliegue existente `prisma migrate deploy` antes del build. No ejecutar `db push` ni reiniciar la base de datos.
- Pruebas: `tests/recovery-code.test.ts`, `tests/recovery-code-routes.test.ts`, `tests/recovery-code-ui.test.tsx`, más regresiones de registro, recuperación por correo y bloqueo de accesos. Las pruebas de UI usan manejadores y estado simulados; no son pruebas de navegador real.

No incluir códigos de alumnos en archivos del repositorio, capturas de soporte, chats o ejemplos. Guardarlos en un gestor de contraseñas o copia privada fuera de la plataforma.
