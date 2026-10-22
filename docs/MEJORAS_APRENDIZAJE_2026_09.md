# Aprendizaje, cobertura y simulador — septiembre de 2026

## Implementación

- Banco de 372 reactivos: 118 originales previos, ampliación de 40, cobertura de 126 temas antes vacíos, 8 reactivos interactivos y 80 de refuerzo. Los 209 identificadores del instructivo tienen al menos un ejercicio; cada asignatura tiene al menos 25. Esto mide presencia de ejercicios, no cobertura exhaustiva de cada destreza interna ni certificación de dominio.
- Los nuevos reactivos son de elaboración propia. No son preguntas oficiales filtradas ni copias del demo. Se preservan los 158 IDs anteriores y su contenido. IDs versionados nuevos, opciones distintas y explicaciones verificadas estructuralmente por pruebas.
- Modo corto: 60 preguntas / 60 minutos. Modo completo: 180 / 180 minutos, con 20 por cada una de las seis asignaturas comunes y 20 por cada especialidad de la carrera. Las duraciones son configuraciones propias de práctica.
- La distribución 40/80/60 y las clases de interacción toman como referencia el [instructivo UAQ 2026-2, páginas impresas 1–3](https://dsa.uaq.mx/convocatorias/Convocatoria-2026/Instructivo_EXCOBA-UAQ-Licenciatura_2026-2.pdf). No se afirma equivalencia psicométrica con el examen.
- Clasificación de varios elementos mediante puntero o selectores, selección múltiple, esquema geométrico SVG seleccionable y entrada numérica/algebraica lineal. Sin bibliotecas de UI nuevas.
- Claves de interacción en servidor; el cliente recibe solo consignas y opciones públicas. Se guardan respuestas estructuradas y crédito fraccionario. Cada elemento correcto aporta una parte del punto; seleccionar más elementos que los solicitados o repetir IDs no otorga crédito.
- Conservación de preguntas asignadas y respuestas al recargar. No se reutilizan IDs de simuladores previos, tampoco incompletos. Un banco finito se agota; la modalidad completa exige disponibilidad por asignatura, no solo un total de 180.
- Al expirar el tiempo se rechazan escrituras nuevas. Al entregar o volver al intento se califican exclusivamente respuestas ya guardadas; no se aceptan cambios tardíos del cliente.
- Revisión de errores, respuestas correctas y explicaciones después de entregar. Historial privado de los últimos 30 intentos, porcentajes por asignatura y acceso a repaso dirigido desde Perfil.
- Comparación de estado y bloqueo por estudiante para evitar doble progreso; autoguardado con bloqueo de intento para evitar que sobrescriba respuestas entregadas.
- La precisión histórica por tema conserva su definición de preguntas completamente acertadas; el porcentaje de examen y asignatura sí incluye puntos parciales.

## Archivos

- Datos: `src/content/{coverage-expansion,interactive-expansion,reinforcement-expansion}.json`, `bank.ts`, `interaction-types.ts`, `attempt-review-types.ts`.
- UI: `src/components/{attempt-feedback,structured-question-answer}.tsx`; páginas de Práctica, Simulador, Perfil y `resultados/[id]`.
- Servidor: `start-simulator.ts`, `simulator-blueprint.ts`, `simulator-formats.ts`, `simulator-state.ts`, `structured-responses.ts`, `submit-attempt.ts`, `attempt-review.ts`.
- Persistencia: `prisma/schema.prisma`, `prisma/import-content.ts`, migración `20260913190000_add_structured_responses`.
- Pruebas: cobertura, cuotas por carrera, entradas equivalentes, rechazo de payloads, crédito parcial, autorización de revisión, vencimiento y entrega duplicada, además de la batería previa de licencias/sesiones/recuperación.

## Migración y despliegue

Solo se añaden `AttemptAnswer.response JSONB` y `credit DOUBLE PRECISION` con restricción 0–1. No hay nuevas tablas, borrados, cambios de folios, roles o vigencia. Los registros anteriores conservan NULL y se interpretan según su calificación original.

El despliegue existente ejecuta migración, importación idempotente y compilación. No reescribir respuestas históricas. Las preguntas añadidas deben corregirse en una nueva versión si ya respaldan intentos; no cambiar sus claves in situ.

## Referencias académicas de apoyo

- [OpenStax, molaridad](https://openstax.org/books/chemistry-2e/pages/3-3-molarity): definición cantidad/volumen de disolución. Los enunciados y cantidades usados aquí son propios.
- [OpenStax, Biology 2e](https://openstax.org/books/biology-2e/pages/1-introduction) y [World History, volumen 2](https://openstax.org/books/world-history-volume-2/pages/1-introduction): referencias abiertas para revisión docente posterior. No se presenta una auditoría editorial exhaustiva de sus capítulos.

## Pendientes externos, no simulados

1. Correo real: configurar `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` de dominio verificado y `APP_URL`. Ver [configuración de correo](email-setup.md). Las pruebas sustituyen el proveedor y no prueban entrega en bandeja. Nunca colocar secretos en Git ni en el chat.
2. Aviso integral: falta identidad o razón social, domicilio y canal de privacidad del responsable, así como confirmar sus políticas operativas. Ver [borrador pendiente](PRIVACIDAD_PENDIENTE.md). No publicar una identidad inventada ni presentar el mensaje anónimo como cumplimiento completo.
3. Navegador y dispositivo real: no había navegador conectado en la sesión de implementación. Las pruebas de componentes y manejadores no equivalen a una prueba móvil real.

## Recorrido de aceptación pendiente en dispositivo

Verificación local: 310 pruebas automatizadas en 35 archivos, comprobación TypeScript y compilación Next aprobadas. La compilación local no tiene DATABASE_URL: emite las advertencias previas del panel administrativo y la ruta dinámica de materias; no constituye una prueba con PostgreSQL. Los manejadores de arrastre se comprobaron con punteros simulados mouse/touch/pen; no con un navegador real.

En staging, con cuenta autorizada de prueba y sin gastar folios de alumnos: activar/iniciar sesión, aceptar aviso una vez, elegir carrera, empezar corto/completo, responder cada formato con toque y teclado, cambiar de pregunta, recargar, simular desconexión, recuperar trabajo, entregar, revisar errores y volver al tema. Comprobar 320/375/768 px, zoom 200%, lector de pantalla y que otro alumno no abre la revisión. El envío real de recuperación requiere un destinatario de prueba autorizado.
