# Estado del proyecto

## Completado
- Los 11 módulos originales (diseño, init, base de datos, auth, licencias,
  contenido académico, práctica, simulador, admin, seguridad, despliegue).
- Las 6 pantallas de alumno: login, activar folio + registro, recuperar
  contraseña, práctica, simulador, perfil.
- **Desplegado y funcionando en producción**: https://excoba-plataforma.vercel.app
- Base de datos real en Neon (PostgreSQL), con las 22 tablas creadas y
  datos de arranque cargados (roles, admin, producto, 7 materias con tema
  y pregunta de ejemplo).
- Envío real de correo (recuperación de contraseña, folios asignados) vía
  Resend — requiere `EMAIL_PROVIDER=resend` y `RESEND_API_KEY` en las
  variables de entorno (ver README).

## Decisiones/cambios importantes tomados DESPUÉS del diseño original
Estos ajustes surgieron al depurar el despliegue real en Vercel y son
importantes si vuelves a desplegar desde cero:

1. **`next.config.mjs`, no `next.config.ts`** — Next.js 14.x no soporta
   configuración en TypeScript (eso llegó hasta Next 15).
2. **Node.js fijado a `20.x`** en `package.json` (`engines.node`) — se
   dejó abierto originalmente (`>=20.0.0`) y Vercel resolvió a una
   versión demasiado nueva sin binarios nativos disponibles para algunas
   dependencias.
3. **Hashing de contraseñas con `hash-wasm` (Argon2id en WebAssembly),
   NO con el paquete `argon2`** — el paquete `argon2` (binding nativo)
   sufría fallos intermitentes e impredecibles en el empaquetado
   por-ruta de Vercel (algunas rutas serverless incluían el binario
   nativo correctamente, otras no, de forma inconsistente). WASM no
   tiene este problema porque es un archivo de datos normal, no un
   binario específico de plataforma. Los parámetros de seguridad
   (memoria=64MB, iteraciones=3, paralelismo=4) son idénticos, así que
   cualquier hash generado antes con el paquete `argon2` sigue siendo
   válido.
4. **CSP basada en nonce, no `script-src 'self'` a secas** — Next.js
   necesita ejecutar scripts en línea propios para hidratar React en el
   navegador; sin nonce, la CSP los bloqueaba y la app se veía bien pero
   ningún formulario/botón funcionaba (recaía a envío nativo de HTML).
   Ver `src/middleware.ts` y `src/app/layout.tsx` (éste último fuerza
   renderizado dinámico leyendo `headers()`, necesario para que el nonce
   nunca quede "congelado" en una página estática).
5. **`vercel.json` con `"framework": "nextjs"` explícito** — el proyecto
   en Vercel se había creado antes de que existiera código real, y quedó
   sin detectar el framework correctamente.
6. **Sin carpeta `prisma/migrations/` todavía** — la base de datos de
   producción en Neon se creó ejecutando el DDL equivalente a mano (sin
   acceso a los binarios de Prisma en el entorno donde se desarrolló
   esto). Si vas a trabajar localmente con una base de datos nueva, la
   primera vez tendrás que correr `npx prisma migrate dev --name init`
   tú mismo para generar esa carpeta — el `schema.prisma` sí está
   completo y es la fuente de verdad.

## Pendiente / próximos pasos naturales
- Verificar un dominio propio en Resend (mientras tanto, sólo puede
  enviar correos a la dirección con la que se registró la cuenta de
  Resend — limitación de su modo sandbox).
- Automatizar la generación/entrega de folios al comprar la guía (en
  definición: nivel de automatización y método de pago).
- UI de administración para crear licencias desde el panel (hoy sólo
  existe el endpoint `POST /api/admin/licenses` y la vista de sólo
  lectura `/admin/licenses`).
- Cargar el banco de preguntas real de la guía (hoy sólo hay una
  pregunta de ejemplo por materia).
- Workflow de CI (`.github/workflows/ci.yml`) — existe en el historial
  pero no se pudo subir a GitHub por permisos del token usado; se puede
  agregar manualmente desde la interfaz web de GitHub cuando se quiera.
- Fase 4 completa (pagos, cupones, facturación) y Fase 5 (repetición
  espaciada, rachas, PWA).

## Credenciales de prueba en producción
- Admin: `admin@excoba.local` / `CambiaEstaPassword123!` (cámbiala).
- Panel admin: `/admin`.

## Variables de entorno configuradas en Vercel (producción)
`DATABASE_URL`, `SESSION_SECRET`, `APP_URL`, `EMAIL_PROVIDER`,
`RESEND_API_KEY` (las dos últimas, agregarlas si aún no se hizo — ver
README, sección "Correo transaccional").
