export type GuideTopic = { stage: string; area: string; coverage: string };

// Síntesis por tópico: conserva todas las áreas y asignaturas de la guía oficial,
// sin reproducir el texto extenso de sus subtemas.
export const OFFICIAL_EXCOBA_TOPICS: GuideTopic[] = [
  { stage: "Primaria", area: "Español", coverage: "Recuento, reportaje, textos científicos y populares, cuestionarios, ortografía, sintaxis, léxico, cuento, instructivos y organización de información." },
  { stage: "Primaria", area: "Matemáticas", coverage: "Naturales, fracciones, decimales, geometría plana y espacial, magnitudes, proporcionalidad, probabilidad y estadística." },
  { stage: "Secundaria", area: "Español", coverage: "Medios, textos informativos, entrevista, descripción técnica, literatura y documentos administrativos, legales y técnicos." },
  { stage: "Secundaria", area: "Matemáticas", coverage: "Reales y álgebra, sucesiones, polinomios, ecuaciones y sistemas, funciones, geometría, trigonometría, proporcionalidad, conteo y estadística." },
  { stage: "Secundaria", area: "Ciencias naturales", coverage: "Biología: evolución, nutrición, respiración, reproducción y herencia. Física: movimiento, fuerzas, energía, calor y electromagnetismo. Química: materia, mezclas, estructura, enlace y reacciones." },
  { stage: "Secundaria", area: "Ciencias sociales", coverage: "Geografía física, población, economía y cultura; Historia mundial, México prehispánico, colonia e independencia; formación cívica, derechos, Estado y convivencia." },
  { stage: "Bachillerato", area: "Matemáticas para estadística", coverage: "Matemáticas I, II y IV: álgebra, ecuaciones, funciones, estadística descriptiva, probabilidad y modelos." },
  { stage: "Bachillerato", area: "Matemáticas para cálculo", coverage: "Matemáticas I a IV: álgebra, ecuaciones, funciones, geometría analítica, trigonometría, límites, derivadas e integrales." },
  { stage: "Bachillerato", area: "Física", coverage: "Física I y II: medición y vectores, movimiento, dinámica, gravitación, trabajo y energía, fluidos, calor y termodinámica." },
  { stage: "Bachillerato", area: "Biología", coverage: "Biología I y II, y Ecología: biomoléculas, célula, metabolismo, biodiversidad, reproducción, genética, evolución, organismos y ecosistemas." },
  { stage: "Bachillerato", area: "Lenguaje", coverage: "Taller de lectura y redacción I y II, Literatura I y II: comunicación, escritura, léxico, textos, literatura, géneros lírico y dramático." },
  { stage: "Bachillerato", area: "Química", coverage: "Química I y II: materia y energía, átomo, tabla periódica, enlaces, nomenclatura, reacciones, mol, disoluciones, ácidos, carbono y polímeros." },
  { stage: "Bachillerato", area: "Ciencias sociales", coverage: "Introducción a las sociales, Historia de México I y II e Historia Universal Contemporánea." },
  { stage: "Bachillerato", area: "Humanidades", coverage: "Ética y valores I y II, Filosofía y Metodología de la investigación." },
];
