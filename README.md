# Plataforma EXCOBA

Plataforma web independiente de preparación para el examen de admisión
EXCOBA de la UAQ, basada en la Guía EXCOBA. Monolito modular en
Next.js + TypeScript + PostgreSQL + Prisma, sin dependencia de servicios
de IA en producción. Puede ejecutarse, mantenerse y desplegarse sin
acceso a la conversación en la que fue generada.

Repositorio: https://github.com/mmoralescode/EXCOBA-PLATAFORMA-

Plataforma: https://excoba-plataforma.vercel.app

Planes actuales: **4 meses / todas las carreras** y **2 meses / primera carrera confirmada**. La vigencia comienza al completar la activación. Ver [operación, permisos y retiro de folios semestrales](docs/planes-de-acceso.md).

El inicio permite elegir entre las 49 carreras del Anexo I UAQ 2026-1.
El instructivo presenta los 209 temas oficiales y la práctica prioriza las
tres áreas de bachillerato de la carrera. El avance por asignatura se guarda
con los intentos de la cuenta; el banco contiene 118 ejercicios propios para
71 temas. El catálogo completo no implica ejercicios para todos los temas.
Consulta [las reglas y la verificación de cobertura](docs/INSTRUCTIVO_CARRERAS.md).

La vista estática (`npm run preview:build`) muestra únicamente el instructivo
y enlaza a la plataforma para practicar. La aplicación Next.js requiere
PostgreSQL y conserva sus rutas de cuentas, folios y simulador.

## Estado del proyecto

Ver [`docs/PROJECT_STATUS.md`](./docs/PROJECT_STATUS.md) — incluye,
además del avance por módulo, una lista de ajustes importantes que se
descubrieron al depurar el despliegue real (versión de Node, forma de
hashear contraseñas, cabecera CSP) que **no son opcionales** si vas a
desplegar esto en otro lugar: revísala antes de empezar.

## Requisitos

- Node.js **22.x**, actualizado por el retiro de Node 20 en Vercel. Las contraseñas usan `hash-wasm`, sin bindings nativos de Argon2.
- PostgreSQL 15 o superior (o Docker, ver más abajo) — en producción se
  usa [Neon](https://neon.tech) (Postgres serverless), pero cualquier
  PostgreSQL estándar funciona
- npm

## Instalación local (sin Docker)

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar variables de entorno y completar valores reales
cp .env.example .env
# Edita .env: DATABASE_URL, SESSION_SECRET (openssl rand -base64 48), etc.

# 3. Crear la base de datos en tu PostgreSQL local, ej.:

#    createdb excoba_dev

# 4. Generar el cliente de Prisma y aplicar migraciones
npm run prisma:generate
npm run prisma:migrate:dev

# 5. Cargar datos de desarrollo (roles, admin demo, materias, producto)
npm run db:seed

# 6. Levantar el servidor de desarrollo
npm run dev
```

La aplicación queda disponible en `http://localhost:3000`.
El seed crea un usuario `SUPER_ADMIN` de prueba:
`admin@excoba.local` / `CambiaEstaPassword123!` — **cámbialo antes de
usar datos reales**.

## Instalación con Docker (opcional)

```bash
docker compose up --build
```

Esto levanta PostgreSQL y la aplicación en modo producción, aplicando
migraciones automáticamente al iniciar el contenedor `app`
(`prisma migrate deploy`, ver `Dockerfile`).

## Migraciones y seed

```bash
npm run prisma:migrate:dev     # nueva migración en desarrollo
npm run prisma:migrate:deploy  # aplicar migraciones en producción
npm run prisma:studio          # explorador visual de la base de datos
npm run db:seed                # datos de desarrollo
```

## Pruebas

```bash
npm test          # ejecuta las pruebas una vez
npm run test:watch
```

Cobertura actual: hashing de contraseñas (Argon2id), generación/hash de
folios y tokens, y comportamiento del rate limiter. Las pruebas de
integración contra una base de datos de pruebas (Docker) para los flujos
completos de folio→registro, sesión única y calificación server-side del
simulador quedan documentadas como siguiente paso en
`docs/PROJECT_STATUS.md`.

## Build y ejecución en producción

```bash
npm run build
npm run start
```

## Despliegue

1. Aprovisiona un servidor/PaaS convencional (VPS, Railway, Render, un
   VM propio, etc.) y una instancia de PostgreSQL bajo tu control.
2. Configura las variables de `.env.example` como variables de entorno
   del servicio (nunca subas `.env` con valores reales al repositorio).
3. Ejecuta `npm run build` y `npm run prisma:migrate:deploy` como parte
   del pipeline de despliegue, luego `npm run start` (o usa la imagen de
   `Dockerfile`, que ya encadena ambos pasos).
4. Sirve la aplicación detrás de HTTPS (certificado gestionado por tu
   proveedor o Let's Encrypt vía un reverse proxy como Caddy o Nginx).

## Configurar dominio y HTTPS

- Apunta el registro A/AAAA de tu dominio al servidor o balanceador del
  proveedor elegido.
- Configura `APP_URL` en las variables de entorno con la URL final
  (https://tu-dominio.com) — se usa para construir enlaces en correos
  transaccionales (recuperación de contraseña, folios asignados).
- Habilita HTTPS obligatorio en el proxy/proveedor; el middleware ya
  envía cabeceras de seguridad (CSP, X-Frame-Options, etc.) pero no
  gestiona certificados TLS.

## Estrategia de respaldo

- Programa `pg_dump` diario de la base de datos hacia almacenamiento
  externo (bucket privado, disco separado del servidor de aplicación).
- Conserva al menos 7 respaldos diarios y 4 semanales.
- Prueba periódicamente la restauración en un entorno aislado
  (`pg_restore` contra una base temporal) — un respaldo nunca probado no
  es una estrategia de respaldo confiable.

## Monitoreo y logs

- Los errores de servidor se registran vía `console.error` en los
  Route Handlers; en producción, dirige la salida estándar del proceso
  a tu solución de logs centralizados (ej. journal del proveedor, o un
  agregador externo).
- `audit_logs` registra acciones sensibles (licencias, contenido
  editorial) y es consultable desde `npm run prisma:studio` o el panel
  administrativo.

## Checklist de seguridad

- [ ] `SESSION_SECRET` generado de forma aleatoria y distinto por entorno.
- [ ] `.env` con valores reales fuera del control de versiones.
- [ ] HTTPS obligatorio en producción.
- [ ] Backups automatizados y restauración probada.
- [ ] Usuario `SUPER_ADMIN` de seed reemplazado por uno propio.
- [ ] Rate limiting revisado/ajustado a tu volumen esperado de tráfico.
- [ ] Revisión de que ningún endpoint devuelve `answers.isCorrect` fuera
      de flujos de administración/revisión posterior autorizada.

## Checklist de despliegue

- [ ] `npm run build` sin errores.
- [ ] `npm run prisma:migrate:deploy` ejecutado contra la base de
      producción.
- [ ] Variables de entorno de producción configuradas.
- [ ] Dominio apuntando al servicio y HTTPS activo.
- [ ] Seed de producción (roles, producto, admin propio) ejecutado una
      sola vez, con contraseña de admin cambiada inmediatamente.

## Integración continua (CI)

El repositorio incluye `.github/workflows/ci.yml`: en cada push o pull
request a `main`, GitHub Actions instala dependencias, genera el
cliente de Prisma, corre `typecheck`, `lint`, aplica migraciones contra
un PostgreSQL efímero del propio workflow, ejecuta las pruebas y hace
el build de producción. Esto es intencional: la generación del cliente
de Prisma requiere descargar binarios desde la infraestructura de
Prisma, lo cual no siempre es posible en todos los entornos locales o
sandboxes restringidos — GitHub Actions sí tiene acceso completo a
internet, así que ahí obtienes la verificación real y automática del
proyecto en cada cambio.

## Subir el proyecto a GitHub

```bash
# 1. Dentro de la carpeta del proyecto
git init
git add .
git commit -m "Proyecto inicial: plataforma EXCOBA (módulos 1-11)"

# 2. Crea un repositorio privado vacío en GitHub (sin README/licencia,
#    para evitar conflictos), luego:
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPOSITORIO.git
git push -u origin main
```

Al hacer push, el workflow de CI se ejecutará automáticamente en la
pestaña "Actions" de tu repositorio y confirmará que todo compila,
tipa y pasa las pruebas.

### Primera migración de Prisma

Como este proyecto se generó sin acceso a un PostgreSQL en vivo, el
esquema (`prisma/schema.prisma`) existe pero aún no tiene una carpeta
`prisma/migrations/` con la migración inicial. La primera vez que
trabajes localmente con una base de datos real, genera y sube esa
migración:

```bash
npm run prisma:migrate:dev -- --name init
git add prisma/migrations
git commit -m "Migración inicial de base de datos"
git push
```

A partir de ahí, el job de CI (`prisma:migrate:deploy`) podrá aplicar
esa migración contra el PostgreSQL efímero del workflow en cada push.

```text
src/
  app/          Rutas (App Router): públicas, (alumno), (admin), api/
  lib/          Utilidades transversales (seguridad, sesión, email, auditoría)
  server/       Casos de uso (lógica de negocio pura)
  db/           Cliente de Prisma
prisma/         Esquema, migraciones y seed
docs/           Documentación técnica (incluye PROJECT_STATUS.md)
tests/          Pruebas (Vitest)
```

## Scripts disponibles

| Comando                      | Descripción                                    |
| ---------------------------- | ---------------------------------------------- |
| `npm run dev`                | Servidor de desarrollo                         |
| `npm run build`              | Build de producción                            |
| `npm run start`              | Servidor de producción (requiere build previo) |
| `npm run lint`               | Linter (ESLint)                                |
| `npm run typecheck`          | Verificación de tipos de TypeScript            |
| `npm test`                   | Pruebas (Vitest)                               |
| `npm run prisma:migrate:dev` | Nueva migración en desarrollo                  |
| `npm run db:seed`            | Datos de desarrollo                            |

## Licencia y propiedad

Proyecto privado. Todo el código, contenido y datos pertenecen a su
propietario; no se distribuye públicamente. La plataforma no se presenta
como oficial de la UAQ ni del EXCOBA salvo autorización expresa.
