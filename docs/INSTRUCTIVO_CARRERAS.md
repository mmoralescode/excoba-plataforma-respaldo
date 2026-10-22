# Instructivo y práctica por carrera

Fuente: Instructivo EXCOBA-UAQ-Licenciatura.pdf, SHA-256
`8b42cf9d7da651810ddc87f8bb7b866368a737750f15c64c56e23d68f03d3652`.
La guía temática (páginas impresas 4–16) contiene los mismos 209 códigos y
descripciones del catálogo existente. No se renumeran los registros de 2026-2:
conservar sus IDs preserva intentos, respuestas, lecciones y progreso.
La elección de carreras sí procede exclusivamente del Anexo I **2026-1**,
páginas 17–18 (el índice conserva un rótulo 2025-1).

## Comportamiento

- Inicio: carrera → práctica (con autenticación existente) → área o todos.
- Instructivo y /temario: 209 títulos agrupados en 14 asignaturas, buscables,
  sin el volcado de párrafos ni la sección de ejercicios nuevos.
- 49 carreras en careers.json. Las celdas combinadas del Anexo I forman
  cinco grupos: 3, 8, 4, 20 y 14 carreras, con tres áreas por grupo.
- Una única práctica calificada en el servidor. Se elimina /banco y su
  componente; las 118 preguntas originales se conservan en la importación
  existente y en los intentos de la base.
- Prioridad: temas oficiales de las tres áreas de bachillerato de la
  carrera; resto oficial; temas propios fuera del catálogo. El origen del
  **tema** no se confunde con la autoría de una pregunta: las preguntas de
  entrenamiento son propias aunque ejerciten un tema oficial.
- La clasificación usa los IDs exactos de catálogo, no coincidencias de
  nombre ni un valor por defecto OFICIAL. Los temas desconocidos son extra.
- Progreso: temas con una respuesta no omitida en intentos ENTREGADOS del
  usuario / total de temas de la asignatura. No representa dominio ni
  porcentaje de respuestas correctas. No aumenta con intentos vacíos,
  omitidas o repeticiones del mismo tema.
- La carrera se guarda por navegador en una cookie de preferencia de un año.
  No es credencial, no concede acceso y el servidor valida su ID.
- Lecciones publicadas siguen disponibles bajo cada asignatura.
- Catálogo completo no implica práctica completa: el banco tiene ejercicios
  para 71 temas y usa opción múltiple, no todos los formatos oficiales.

## Base de datos y publicación

No hay cambios de Prisma ni migraciones en esta versión. Los cambios previos
en la copia antigua del directorio padre no forman parte de esta publicación.
Folios, licencias, roles y guardias de autorización se mantienen.
La configuración existente de Vercel importa el banco de forma idempotente y
compila Next.js. Se preserva ese proceso, sin ejecutar seeds de desarrollo.

## Verificación

`node scripts/verify-official-guide.mjs "<ruta al PDF>"` exige Poppler.
Las pruebas de study-plan verifican cinco grupos, fronteras entre carreras,
Matemáticas para Estadística vs Cálculo, niveles escolares y orden de extras.
Las pruebas de práctica verifican selección, validación de carrera y sesiones
vacías. Ejecutar además `npm test`, `npm run lint`, `npm run typecheck` y
`npm run build`.

## Archivos principales

- src/content/careers.json, study-plan.ts y study-types.ts: catálogo y reglas.
- src/components/career-selector.tsx y home-start.tsx: elección de carrera.
- src/components/curriculum-browser.tsx: instructivo completo por títulos.
- src/components/study-dashboard.tsx: barras y lecciones.
- src/app/page.tsx, instructivo/page.tsx, temario/page.tsx: páginas públicas.
- src/app/(alumno)/estudio/page.tsx y practica/page.tsx: flujo del alumno.
- src/server/use-cases/study-subjects.ts y start-practice.ts: progreso y selección.
- src/server/use-cases/submit-attempt.ts: comprobación de preguntas asignadas.
- src/app/api/subjects/route.ts, components/alumno-nav.tsx, app/login/page.tsx,
  app/globals.css y preview/index.tsx: integración y navegación.
- Se eliminan components/question-bank.tsx y app/(alumno)/banco/page.tsx;
  se retiran utilidades de calificación cliente no utilizadas de content/bank.ts.
