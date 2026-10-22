export const subjectNames: Record<string, string> = {
  "1.1": "Primaria · Español",
  "1.2": "Primaria · Matemáticas",
  "2.1": "Secundaria · Español",
  "2.2": "Secundaria · Matemáticas",
  "2.3": "Secundaria · Ciencias naturales",
  "2.4": "Secundaria · Ciencias sociales",
  "3.1": "Especialidad · Matemáticas para estadística",
  "3.2": "Especialidad · Matemáticas para cálculo",
  "3.3": "Especialidad · Física",
  "3.4": "Especialidad · Biología",
  "3.5": "Especialidad · Lenguaje",
  "3.6": "Especialidad · Química",
  "3.7": "Especialidad · Ciencias sociales",
  "3.8": "Especialidad · Humanidades",
};

export function subjectName(subjectId: string) {
  return subjectNames[subjectId];
}
