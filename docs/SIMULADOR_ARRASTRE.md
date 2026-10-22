# Simulador ampliado

- Modalidades de 60 preguntas/60 minutos y 180 preguntas/180 minutos. El modo completo aplica cuotas 40/80/60 por carrera; son tiempos de práctica. Intentos anteriores conservan su configuración.
- Formatos mixtos: opción múltiple por defecto, arrastre en Historia y Biología y hasta dos preguntas de Geometría y dos de Física por intento. Se reserva variedad mientras existan preguntas nuevas de esas áreas; no se repiten reactivos para cubrir una cuota.
- El formato se guarda en `Attempt.config.answerModes` y se recupera sin alterarlo al recargar.
- Sin repeticiones por alumno: se excluyen todos los IDs asignados en sus simuladores anteriores, incluyendo incompletos y expirados. Las prácticas no consumen este banco de examen. Se consulta también el historial anterior a este cambio.
- La asignación usa transacción y bloqueo de la fila del usuario para evitar repeticiones entre solicitudes simultáneas. No se borra historial ni se reinicia el banco automáticamente. La disponibilidad del modo completo depende de tener veinte preguntas nuevas por asignatura.
- Banco: 372 preguntas originales para 209 temas. Detalle y límites en [mejoras de aprendizaje](MEJORAS_APRENDIZAJE_2026_09.md).
- Cada pregunta nueva referencia un apartado real del temario. `demoId` vacío indica que no se atribuye a un reactivo del demo oficial.
- Arrastre de una opción a un recuadro mediante eventos de puntero (ratón, pantalla táctil o lápiz). Alternativa con toque, clic o Tab + Enter/Espacio. Permite reemplazar y quitar la elección.
- Incorpora además ocho reactivos semiconstruidos: clasificación múltiple con arrastre/selectores, esquema SVG seleccionable, selección múltiple y escritura numérica/algebraica lineal. Los formatos de varios elementos otorgan crédito parcial. No se afirma reproducir toda la interfaz oficial.
- Una pregunta por pantalla, navegación libre, conteo de respondidas y autoguardado serializado. Al entregar se espera a las escrituras pendientes. La API comprueba usuario, pertenencia del reactivo y opción, y califica en el servidor.
- Formulario plegable con fórmulas, condiciones y unidades; no importa el banco de preguntas ni revela respuestas. Consultarlo no pausa el tiempo.
- Formulario organizado con selector de materia, una materia visible a la vez y notación MathML nativa: fracciones apiladas, raíces, potencias, subíndices y sumatorias. Conserva los 18 grupos de fórmulas y sus condiciones; no añade librerías, imágenes ni peticiones a terceros. Referencia técnica: [elemento math de MDN](https://developer.mozilla.org/en-US/docs/Web/MathML/Reference/Element/math).
- Migración aditiva `20260913190000_add_structured_responses`: respuesta JSON y crédito por pregunta. La importación agrega IDs nuevos de forma idempotente, sin modificar preguntas o respuestas anteriores, folios ni usuarios.

## Referencia

El [instructivo oficial UAQ 2026-2](https://dsa.uaq.mx/convocatorias/Convocatoria-2026/Instructivo_EXCOBA-UAQ-Licenciatura_2026-2.pdf), páginas impresas 2–3, describe arrastre de elementos, selección y escritura; además menciona el formulario del demo. Esta plataforma implementa un apoyo propio, no una reproducción exacta del demo o del examen.

## Comprobación

Ejecutar `npm test`, `npm run typecheck` y `npm run build`. Probar arrastrar al recuadro, soltar fuera, cambiar/quitar selección, responder con teclado y pantalla táctil, navegar/recargar, abrir formulario y entregar. El formulario y simulador siguen dentro del área autenticada.
