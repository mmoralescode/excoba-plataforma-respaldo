# Actualización académica UAQ 2026-2

Se incorpora el catálogo de 209 temas finales numerados del instructivo, distribuido en 14 materias por nivel. Se conserva el código, descripción, página impresa y correspondencia con los reactivos del demo. Fuente: `Instructivo_EXCOBA-UAQ-Licenciatura_2026-2.pdf`, SHA-256 `3056ba510f67dc0d9899189ef80b22f4a28b5527066714ded412bae4c364bff9`.

El banco incluye **118 ejercicios originales**, con cuatro opciones, una respuesta correcta y explicación: 70 ejercicios de autoría individual y 48 ejercicios parametrizados de ocho familias de cálculo. Hay práctica en los **71 temas con evidencia parcial en el demo**, incluyendo las 14 materias y todas las especialidades. Los otros **138 temas** aparecen como pendientes de ejercicios. Estas cifras no significan cobertura exhaustiva de las competencias de cada tema ni equivalencia con el examen real.

Las preguntas son nuevas adaptaciones de habilidades a opción múltiple. No son una transcripción de los 70 reactivos originales, ni incluyen sus capturas, gráficos o código propietario. `demoId` identifica la referencia temática, no una reproducción. Los ejercicios de comprensión transversal, civilizaciones antiguas y Edad Media sin correspondencia directa se conservan en la trazabilidad del catálogo, pero no se presentan como temas obligatorios adicionales.

## Uso

- `/estudio`: búsqueda sin sensibilidad a acentos, filtros por materia y disponibilidad, descripción oficial y enlaces a práctica por tema. Las lecciones ya existentes siguen visibles y ahora se puede desplegar su contenido como texto.
- `/banco`: práctica formativa de 5, 10, 20 o 50 preguntas, limitada al número disponible; selección aleatoria, respuestas explicadas y repetición de errores y omitidas. Funciona con el contenido versionado, sin importar datos. Requiere la sesión de alumno existente. Las respuestas forman parte del material de autoestudio; el resultado es local, no se guarda como intento ni acredita un resultado de examen.
- `/practica`: conserva el flujo registrado y ofrece acceso al nuevo banco.

## Importación a la base existente

Para utilizar también el banco en la práctica registrada y el simulador, configurar `DATABASE_URL` y, opcionalmente, `CONTENT_AUTHOR_EMAIL` con el correo de un editor académico o superadministrador activo ya existente, y ejecutar:

```sh
npm run content:import
```

No necesita cambios al esquema Prisma. Importa convocatoria, áreas, materias, temas y preguntas dentro de una transacción. Usa identificadores propios y versionados; al repetir no crea duplicados ni modifica respuestas usadas por intentos previos. No crea usuarios, licencias ni contraseñas. Archiva únicamente los siete enunciados exactos de ejemplo del seed anterior, preservando su historial. No sustituye preguntas ni materias creadas por otros editores. Para corregir un reactivo ya importado, publicar una nueva versión con nuevo ID y archivar la anterior mediante el flujo académico.

Si `CONTENT_AUTHOR_EMAIL` no está definido, el importador selecciona el primer editor académico o superadministrador activo. El build de Vercel ejecuta automáticamente `prisma migrate deploy`, `content:import` y `next build`, por lo que el simulador registrado usa las preguntas reales y archiva los placeholders del seed. El seed antiguo es exclusivamente de desarrollo; no ejecutar `db:seed` en producción para cargar este contenido.

## Validación y límites

Pruebas automáticas de integridad del catálogo, correspondencias, unicidad, opciones, filtros, barajado y calificación formativa (incluidas omitidas). Los 48 cálculos parametrizados se verifican con operaciones independientes, sustitución o identidades equivalentes. Los ejercicios conceptuales y los cálculos individuales se revisaron durante la autoría. No se trata de una certificación pedagógica externa.

La ampliación no añade lecciones completas a los 209 temas ni reproduce las interacciones de arrastrar, ordenar o capturar números del demo. El nuevo banco contiene 118 ejercicios originales con explicación, distribuidos en 71 temas con evidencia parcial.

## Fuentes de contraste académico

Además del instructivo y de las correspondencias verificadas con el demo local, se consultaron:

- [UNAM: metabolismo celular](https://www.objetos.unam.mx/biologia/metabolismoCelular/), para la localización de la glucólisis.
- [CCH UNAM: división temporal de Mesoamérica](https://e1.portalacademico.cch.unam.mx/alumno/historiademexico1/unidad2/areasculturales/divisiontemporal), para el orden de horizontes.
- [UNAM: Teoría social I](https://www.trabajosocial.unam.mx/plan96/ensenanza/Sua1semestre/teoriasocialI.pdf), para la sociología comprensiva.
- [Gobierno de México: Tratado de La Mesilla](https://www.gob.mx/agricultura%7Cdgsiap/articulos/tratado-de-la-mesilla), para fecha y gobierno.
- [Archivo General de la Nación: Porfirio Díaz y el Plan de Tuxtepec](https://www.gob.mx/agn/articulos/el-camino-de-porfirio-diaz-al-poder-a-traves-de-las-pistas-documentales-del-agn?idiom=es).
- [SRE: reconocimiento del sufragio femenino](https://www.gob.mx/sre/es/articulos/63-aniversario-del-sufragio-femenino-en-mexico), para la reforma de 1953.
- [Gaceta UNAM: final de la Guerra Fría](https://www.gaceta.unam.mx/gorbachov-figura-crucial-para-el-final-de-la-guerra-fria/).
- [CCH UNAM: la Reforma](https://portalacademico.cch.unam.mx/historiauniversal1/origen-mentalidad-moderna/la-reforma), para Lutero y su contexto.

Los documentos locales de la guía piden comprobaciones de LaTeX que no existen en este repositorio web; aquí corresponden `npm test`, `npm run typecheck`, `npm run lint` y `npm run build`.

Resultados de esta actualización: **15 pruebas aprobadas**, TypeScript y ESLint sin errores, y compilación de producción con salida 0. Persiste el aviso previo de `/api/subjects` al intentar prerenderizar una ruta que usa cookies; Next la genera como dinámica. El build se verificó con una URL PostgreSQL ficticia de entorno, sin ejecutar una importación ni conectarse a producción.

Se comprobaron los componentes reales en Chrome mediante un arnés local: búsqueda, filtro de 71 temas, inicio, selección, calificación, nueve omitidas y reintento; sin errores JavaScript ni desbordamiento horizontal a 390 px. Se revisaron capturas de escritorio y móvil. Esto no sustituye una prueba integral con autenticación, servidor Next y PostgreSQL. Evidencias locales en `../auditoria_2026/preview-contenido/` y `../auditoria_2026/build-contenido.log`.
