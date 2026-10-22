# Planes de acceso — septiembre de 2026

## Reglas vigentes

- Cuatro meses naturales desde completar el registro: todas las carreras del catálogo, con cambios de carrera permitidos.
- Dos meses naturales desde completar el registro: únicamente la primera carrera confirmada. La selección se almacena en PostgreSQL, es independiente del navegador y es irreversible para el alumno. Incluye primaria, secundaria y las tres áreas oficiales de esa carrera.
- Crear o validar un folio no inicia la vigencia. Elegir carrera no reinicia el plazo. Cada folio se vincula a una sola cuenta.
- Las pantallas Activar, Mi acceso y Perfil explican la duración y el alcance; un aviso aparece en el área del alumno. El selector requiere confirmación explícita para la elección única.
- El servidor aplica la restricción en materias, temario, recomendaciones, práctica, simulación y resultados. Cambiar cookies, URL o parámetros no concede acceso a otra carrera. La carrera se asigna con compare-and-set dentro de una transacción; dos pestañas no pueden elegir carreras diferentes.
- La API de creación acepta solamente 2 o 4 meses y deriva el alcance del plan. Los permisos administrativos y las licencias anteriores no semestrales se conservan.

## Migración

`20260930120000_add_license_career_plans` añade `LicenseCareerScope`, `License.careerScope`, `selectedCareerId` y `careerSelectedAt`. Es aditiva y no altera cuentas, contenido, historial ni licencias previas. Las licencias antiguas conservan alcance completo hasta que una operación explícita las revoque.

## Lote y retiro de seis meses

El operador `scripts/license-plan-batch.ts` genera exactamente 10 folios de cada plan. No es una API ni se ejecuta automáticamente al publicar:

1. `prepare --file RUTA_PRIVADA --product ID --admin ID` guarda JSON y texto de entrega fuera del repositorio, antes de emitir nada. El directorio debe tener ACL restringida: usuario propietario, administradores del equipo y SYSTEM. `mode: 0600` solo no configura ACL de Windows.
2. El manifiesto público contiene únicamente hashes e identificadores, nunca los folios. El lote de esta entrega es `8aff3556-af67-46d4-8a48-38fe24806695`, manifiesto `operations/license-plans-2026-09-30.hashes.json`.
3. La inspección previa identificó exactamente 70 licencias semestrales: 30 con `validityMonths=6` y 40 antiguas con `validityMonths IS NULL AND validityDays=180`. Dos estaban activadas. La operación aborta si cambian estos conteos.
4. `apply --file MANIFIESTO` revoca las 70 y sus sesiones, y crea los 20 nuevos folios en una sola transacción serializable. Conserva usuarios, progreso, preguntas y registros históricos; la auditoría guarda el estado anterior de las licencias retiradas. La revocación es lógica: ningún folio retirado puede volver a activarse o dar acceso, pero sus registros permanecen para trazabilidad.
5. `verify --file MANIFIESTO` confirma los 20, los alcances, fechas y la revocación. Repetir el mismo manifiesto no crea duplicados. No entregar el archivo privado antes de verificar.

La herramienta anterior `scripts/license-batch.ts` no permite `prepare` ni `apply`; conserva su verificación histórica. Los usuarios vinculados a códigos revocados conservan su información, pero ya no pueden acceder con esos códigos. No se convierten licencias ni se reasignan cuentas automáticamente.

## Publicación y mantenimiento seguro

Se utiliza Node.js 22 en Vercel por el retiro de Node 20. `scripts/vercel-build.cjs` ejecuta migraciones, importación idempotente y build en publicaciones normales. Solo con `EXCOBA_LICENSE_OPERATION=inspect|apply|verify` realiza mantenimiento explícito y termina con código 1 antes de publicar: ese error final es intencional y preserva la web anterior. Nunca persistir esa variable como configuración de proyecto.

No subir `.env`, archivos de folios en claro, copias de base de datos o cuentas de prueba. `.vercelignore` excluye datos privados, pruebas y el proyecto Yokohama anidado. La base de producción sigue usando su conexión protegida configurada en Vercel; el mantenimiento no descarga ni registra esa credencial.
