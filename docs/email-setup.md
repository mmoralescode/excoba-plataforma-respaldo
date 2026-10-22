# Correo transaccional y recuperación de contraseña

El código usa la API HTTP de Resend, sin SDK adicional. No existe fallback que imprima correos: una configuración ausente o inválida produce un error tipado. Nunca se deben imprimir direcciones, credenciales, folios, contraseñas ni enlaces de recuperación en los registros.

## Configuración necesaria

Configurar las siguientes variables del servidor en cada entorno de despliegue que deba enviar correos:

| Variable         | Valor requerido                                                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMAIL_PROVIDER` | `resend`                                                                                                                                                                      |
| `RESEND_API_KEY` | Clave privada de Resend con permiso de envío para el dominio elegido. Nunca usar `NEXT_PUBLIC_`.                                                                              |
| `EMAIL_FROM`     | Dirección de un dominio verificado en Resend, por ejemplo `EXCOBA <acceso@correo.tudominio.mx>`. `onboarding@resend.dev` y otros remitentes sandbox se rechazan.              |
| `APP_URL`        | Origen público HTTPS de esta aplicación, sin rutas, credenciales, query ni fragmentos; por ejemplo `https://excoba-plataforma.vercel.app`. No se infiere de encabezados HTTP. |

Agregar el dominio propio en Resend, publicar los registros DNS SPF/DKIM indicados por el proveedor y comprobar su estado verificado. La aplicación valida la forma del remitente; Resend valida la titularidad/verificación efectiva y rechaza dominios no autorizados. En desarrollo únicamente se permite `http://localhost:3000` (también las IP loopback) como origen HTTP; sigue haciendo falta configuración explícita de correo para un envío real. Las pruebas automatizadas sustituyen `fetch` y no envían mensajes.

Fuentes oficiales: [verificación de dominios](https://resend.com/docs/dashboard/domains/introduction), [remitentes de un dominio verificado](https://resend.com/docs/knowledge-base/how-do-I-create-an-email-address-or-sender-in-resend), [API de envío](https://resend.com/docs/api-reference/emails/send-email), [errores del proveedor](https://resend.com/docs/api-reference/errors).

## Comportamiento y seguridad

- Solicitud: `POST /api/auth/forgot-password`, cuerpo `{ "email": "alumno@dominio.mx" }`. El correo se normaliza antes de buscar o limitar.
- La respuesta 200 es condicional: «Si el correo corresponde a una cuenta habilitada y el servicio está disponible, recibirás un enlace…». No confirma existencia ni entrega. Cuentas suspendidas/eliminadas no reciben enlaces. Un fallo global de configuración devuelve el mismo 503 antes de consultar cualquier cuenta. Los rechazos por destinatario y fallos de emisión específicos de una cuenta mantienen la respuesta genérica y generan un evento técnico redactado.
- En Resend, aceptación por la API no equivale a entrega en bandeja. Revisar eventos de entrega/rebote del proveedor en su panel. No copiar contenido sensible de dichos eventos a registros de la aplicación.
- Tokens criptográficos aleatorios de 32 bytes, codificados en base64url (43 caracteres), almacenados solo como SHA-256. Validez de 30 minutos; se rechaza también el instante exacto de vencimiento. El enlace nuevo usa `#token=…`, que no se transmite al servidor en la navegación. La pantalla conserva compatibilidad con enlaces anteriores por query.
- Confirmación: `POST /api/auth/reset-password`, cuerpo `{ "token": "…", "newPassword": "…" }`. Contraseña de 10 a 128 caracteres; cuerpo HTTP máximo 4 KiB comprobado durante la lectura del stream. GET no cambia contraseñas ni consume enlaces.
- Una transacción con comparación y actualización condicional del usuario y token cambia la contraseña, consume el enlace, invalida todos los demás enlaces del usuario y revoca todas sus sesiones. Dos solicitudes concurrentes (incluso con enlaces diferentes) no pueden actualizar desde el mismo hash previo. Una cuenta suspendida/eliminada no puede usar recuperación para reactivarse. No se modifica su licencia, roles ni progreso.
- Solicitud: 60 intentos/hora por IP compartida y 3 por correo normalizado en memoria. Adicionalmente, 3 tokens/hora por cuenta en PostgreSQL; un bloqueo de fila serializa la cuota entre instancias. Incluye tokens usados y envíos fallidos. No purgar registros creados durante la última hora, porque forman parte de esta cuota. No se necesita migración.
- Confirmación: 60 intentos/15 minutos por IP compartida y 5/15 minutos por token, en memoria, antes del hash de contraseña. Los límites en memoria **no son distribuidos** ni sobreviven a reinicios; mantener el proxy confiable que sobrescribe encabezados de IP y complementar con controles de plataforma si se requiere protección distribuida contra abuso de IP. No se afirma que `RATE_LIMIT_BACKEND=redis` esté implementado.
- La solicitud espera al menos 3 segundos y el envío tiene timeout de 2,5 segundos para reducir diferencias temporales entre cuentas. Es una mitigación de mejor esfuerzo, no una garantía bajo latencia extrema de la base de datos; una cola de envío duradera sería la mejora para mayor escala.

Estas decisiones siguen [OWASP: recuperación de contraseña](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). Las pruebas de concurrencia actuales son unitarias con dobles de base de datos; comprobar también la transacción en PostgreSQL de staging antes de producción.

La extracción de IP prioriza `x-vercel-forwarded-for` según la [documentación de encabezados de Vercel](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for). En alojamiento distinto, no aceptar esos encabezados de clientes directos sin un proxy que los sobrescriba.

El inicio de sesión comparte el bloqueo de fila del usuario con la recuperación: exige que siga coincidiendo el hash de contraseña previamente verificado, vuelve a comprobar roles/licencia y revoca/crea la sesión en una transacción. Así, un login con una contraseña anterior no puede crear sesión después del reset; dos logins simultáneos se serializan. Esto se apoya en la reevaluación de `WHERE` tras esperar un bloqueo en [PostgreSQL, aislamiento Read Committed](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED). Las pruebas unitarias simulan esa serialización, pero no reemplazan la comprobación contra PostgreSQL.

## Verificación de despliegue

1. Verificar dominio y variables sin publicar valores secretos. Volver a desplegar para aplicar cambios de entorno.
2. En staging, con autorización explícita para correo real, solicitar recuperación de una cuenta de prueba y comprobar aceptación/entrega en Resend. No se realizó este envío real durante la implementación.
3. Comprobar que una cuenta inexistente devuelve el mismo mensaje/status; con configuración ausente ambas deben devolver 503.
4. Usar el enlace, comprobar login con contraseña nueva, rechazo de la anterior y revocación de sesiones previas. Repetir el mismo enlace y un enlace anterior: ambos deben rechazarse.
5. Probar expiración y concurrencia contra PostgreSQL. Comprobar que cuentas suspendidas/eliminadas siguen sin acceso y que el folio/progreso no cambió.

Sin acceso a las variables de Vercel y al dominio/API key de Resend, el envío real queda pendiente de configuración y verificación. No sustituir esta comprobación por un mensaje «correo enviado» ni por imprimir el enlace.
