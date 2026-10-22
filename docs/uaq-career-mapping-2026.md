# Catálogo de carreras UAQ y mapeo EXCOBA

Fecha de verificación: 10 de septiembre de 2026.

## Cobertura y alcance

El catálogo contiene **122 opciones de carrera, sede o modalidad**. Se agregaron 73 opciones a las 49 anteriores:

| Procedencia del mapeo utilizado                              | Opciones |
| ------------------------------------------------------------ | -------: |
| Anexo I UAQ 2026-2 completo                                  |      118 |
| Anexo I UAQ 2026-1, conservadas porque no aparecen en 2026-2 |        2 |
| Anexo I UAQ 2025-2, complemento de la oferta institucional   |        2 |
| Total                                                        |      122 |

Las opciones no equivalen a convocatorias abiertas. La oferta y la apertura de grupos pueden variar por ciclo. El catálogo no deduce asignaturas por afinidad con otra carrera: cada terna procede de una fila y su celda agrupada en un anexo oficial.

Se conservaron los **49 identificadores anteriores** `uaq-2026-1-01` a `uaq-2026-1-49`, incluidos los utilizados por las preferencias guardadas. Los 47 programas/sedes presentes en ambos anexos 2026 conservan exactamente sus tres asignaturas. No hubo cambios de mapeo entre esas coincidencias.

## Fuentes

- [Instructivo EXCOBA UAQ 2026-2](https://dsa.uaq.mx/convocatorias/Convocatoria-2026/Instructivo_EXCOBA-UAQ-Licenciatura_2026-2.pdf): Anexo I, páginas impresas 17-20, páginas PDF 19-22. SHA-256: `3056ba510f67dc0d9899189ef80b22f4a28b5527066714ded412bae4c364bff9`.
- Instructivo EXCOBA UAQ 2026-1 proporcionado con la solicitud, archivo `Instructivo EXCOBA-UAQ-Licenciatura.pdf`: Anexo I, páginas impresas 17-18, páginas PDF 19-20. SHA-256: `8b42cf9d7da651810ddc87f8bb7b866368a737750f15c64c56e23d68f03d3652`. No se atribuye una URL no verificada al archivo adjunto.
- [Instructivo EXCOBA UAQ 2025-2](https://dsa.uaq.mx/convocatorias/Convocatoria-2025-2/Instructivo-EXCOBA-UAQ-Licenciatura.pdf): páginas impresas 18 y 20, páginas PDF 20 y 22. SHA-256: `554c048e2185973e0394ce87da8f5577eb8175c051f70237086ebc492b7bb3c8`.
- [Oferta educativa institucional](https://www.uaq.mx/index.php/oferta-educativa/programas-educativos): referencia de nombres y existencia de programas, no fuente de sus asignaturas EXCOBA.

## Grupos verificados del Anexo I 2026-2

Se inspeccionaron visualmente las cuatro páginas completas, incluidas las celdas combinadas de asignaturas. Los grupos, en el orden del PDF, son:

| Grupo de asignaturas                                      | IDs del temario | Opciones 2026-2 |
| --------------------------------------------------------- | --------------- | --------------: |
| Matemáticas para estadística, Biología, Química           | 3.1, 3.4, 3.6   |               7 |
| Física, Biología, Química                                 | 3.3, 3.4, 3.6   |              12 |
| Matemáticas para cálculo, Física, Química                 | 3.2, 3.3, 3.6   |              16 |
| Matemáticas para cálculo, Física, Lenguaje                | 3.2, 3.3, 3.5   |              20 |
| Matemáticas para estadística, Lenguaje, Humanidades       | 3.1, 3.5, 3.8   |              62 |
| Matemáticas para estadística, Ciencias sociales, Lenguaje | 3.1, 3.7, 3.5   |               1 |
| Total                                                     |                 |             118 |

Distribución por página impresa: 17 = 35 filas, 18 = 39, 19 = 40, 20 = 4. Las filas cuentan únicamente carreras y se numeran desde 1 en cada página; no incluyen títulos ni encabezados.

## Trazabilidad por opción

`src/content/careers.json` conserva el contrato consumido por la aplicación: `{ id, name, subjectIds }` por opción. Su `sha256` superior corresponde al instructivo principal 2026-2; la procedencia completa de un catálogo compuesto está en el archivo de metadatos.

`src/content/career-sources.json` mantiene una entrada por identificador:

- `sourceId`: documento que acredita las tres asignaturas actualmente utilizadas.
- `page` y `row`: página impresa y posición de la carrera en esa página.
- `groupId`: grupo de tres asignaturas, definido en `groups`.
- `sourceName`: nombre literal de la fila; conserva abreviaturas o erratas para que pueda localizarse sin ambigüedad.
- `aliases`: nombres anteriores o literales alternativos para búsqueda, sin duplicar carreras.
- `nameSourceUrls`: evidencia oficial complementaria cuando se actualiza el nombre mostrado o se precisa la sede.
- `previousSource`: posición en el Anexo I 2026-1 para las 47 opciones ya existentes que también figuran en 2026-2.
- `note`: explica cuando el mapeo procede de un ciclo anterior.

`sources` conserva los títulos, enlaces verificados, hashes y páginas de cada documento. `pdfPageOffset: 2` permite pasar de página impresa a número de página PDF, ambos contados desde 1. El documento 2025-2 declara `usedOptionCount: 2`, porque se utiliza como complemento y no se afirma haber incorporado todo su anexo.

Los nuevos IDs de 2026-2 conservan el ordinal de la fila en el anexo completo: por ejemplo, `uaq-2026-2-020` es Actuaría. Los huecos numéricos corresponden a opciones que mantienen un ID de 2026-1.

## Normalizaciones y nombres anteriores

| Nombre literal/anterior                                                     | Nombre mostrado                                  | Evidencia                                                                                                                                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ACTUARIO (QUERÉTARO)                                                        | ACTUARÍA (QUERÉTARO)                             | [Resultados oficiales 2026-2](https://www.uaq.mx/docs/Admision_Licenciaturas_UAQ_2026-2.pdf)                                                                                            |
| HORTICULTURAL AMBIENTAL (QUERÉTARO)                                         | HORTICULTURA AMBIENTAL (QUERÉTARO)               | [Resultados oficiales 2026-2](https://www.uaq.mx/docs/Admision_Licenciaturas_UAQ_2026-2.pdf)                                                                                            |
| ODONTOLOGÍA                                                                 | MEDICINA ESTOMATOLÓGICA                          | [Consejo Universitario, 30 de octubre de 2025](https://www.uaq.mx/index.php/conocenos/h-consejo-universitario/acuerdos-consejo/acuerdos-de-consejo-2025/2236-ordinaria-30-octubre-2025) |
| DESARROLLO HUMANO PARA LA SUSTENTABILIDAD                                   | SOSTENIBILIDAD Y DESARROLLO HUMANO               | [Consejo Universitario, 25 de junio de 2026](https://www.uaq.mx/index.php/conocenos/h-consejo-universitario/acuerdos-consejo/acuerdos-de-consejo-2026/2264-ordinaria-25-junio-2026)     |
| INGENIERO EN AGROBIOTECNOLOGÍA / INGENIERÍA EN AGROBIOTECNOLOGÍA (ESCOBEDO) | INGENIERÍA EN AGROBIOTECNOLOGÍA (PEDRO ESCOBEDO) | [Campus Pedro Escobedo](https://campus.uaq.mx/index.php/conocenos-pedro-escobedo)                                                                                                       |

También se expanden QRO a Querétaro y TEQ a Tequisquiapan, y se corrige la errata SAN JUAN REL RÍO. Químico Farmacéutico Biólogo conserva la sede Querétaro del catálogo anterior, corroborada en los resultados oficiales 2026-2. Los nombres sin sede en la fuente, como Microbiología o Realización Cinematográfica, no reciben una sede inferida.

Los nombres actualizados conservan los alias de los anexos. Odontología y Medicina Estomatológica representan el mismo registro `uaq-2026-1-02`; el cambio de nombre no crea una carrera adicional ni altera sus materias.

## Programas de ciclos anteriores conservados o incorporados

| ID                                                 | Programa                                                  | Fuente y ubicación     | Asignaturas   |
| -------------------------------------------------- | --------------------------------------------------------- | ---------------------- | ------------- |
| uaq-2026-1-03                                      | TSU en Manejo de Alimentos y Cultura del Vino (Querétaro) | 2026-1, p. 17, fila 3  | 3.1, 3.4, 3.6 |
| uaq-2026-1-48                                      | Educación y Mediación Intercultural (Querétaro)           | 2026-1, p. 18, fila 13 | 3.1, 3.5, 3.8 |
| uaq-2025-2-construccion-sostenible-pinal-de-amoles | TSU en Construcción Sostenible (Pinal de Amoles)          | 2025-2, p. 18, fila 21 | 3.2, 3.3, 3.5 |
| uaq-2025-2-realizacion-cinematografica             | Realización Cinematográfica                               | 2025-2, p. 20, fila 1  | 3.1, 3.5, 3.8 |

Estas cuatro entradas no aparecen en el Anexo I 2026-2. Se identifica su documento original y no se presenta su terna como una confirmación de un nuevo ciclo de admisión.

## Comprobaciones realizadas

- 122 opciones y 122 entradas de procedencia; IDs únicos y nombres no duplicados.
- 118 filas de 2026-2 representadas exactamente una vez, con 35/39/40/4 filas por página.
- Las 49 opciones anteriores mantienen ID y terna de materias.
- Cada opción contiene tres IDs distintos de asignaturas de bachillerato existentes en `curriculum.json`.
- Cada terna coincide con el grupo documentado para su fila.
- Actuaría utiliza 3.2, 3.3 y 3.6; Sostenibilidad y Desarrollo Humano utiliza 3.1, 3.7 y 3.5.
- Inspección visual de las páginas relevantes de los tres PDFs y comprobación de sus hashes.

## Flujo de estudio y compatibilidad

La ruta predeterminada incluye las tres asignaturas de bachillerato de la carrera y las seis asignaturas comunes de primaria/secundaria. Las otras especialidades y el contenido propio se muestran cuando el alumno elige todos los temas. La API aplica el mismo filtro con `scope: "career"`; `scope: "all"` mantiene la elección de practicar todo.

Las preguntas no respondidas se seleccionan antes de repetir las ya contestadas, conservando el orden de prioridad dentro de cada sesión. Así, agotar las preguntas de especialidad no impide avanzar a las asignaturas comunes.

No se modificaron el schema de Prisma, folios, licencias, roles ni la persistencia del progreso. No se necesita migración: el catálogo y sus fuentes son archivos JSON. Los IDs de temas, preguntas y carreras anteriores permanecen estables.

La ampliación es del catálogo de carreras y sus rutas de estudio, no del banco de ejercicios. El temario contiene 209 apartados; no todos cuentan todavía con lecciones o preguntas publicadas.

## Verificación reproducible

Ejecutar `npm test`, `npm run typecheck`, `npm run lint` y `npm run build` con Node 20 y las dependencias instaladas. Las rutas autenticadas requieren la base de datos y configuración habituales para las pruebas integrales; las pruebas unitarias de esas rutas utilizan dobles de la base de datos.

Con Poppler instalado, ejecutar `node scripts/verify-official-guide.mjs <PDF-2026-2> <PDF-2026-1> <PDF-2025-2>`. El script comprueba los hashes, la página de cada nombre original, la cobertura de opciones, las ternas de materias y los 209 códigos/descripciones del temario principal. La ubicación en las celdas agrupadas se complementa con la revisión visual documentada arriba.
