import careerData from "@/content/uaq-careers.json";

export type Career = { name: string; requiredAreas: string[] };
export const UAQ_CAREERS_2026_1: Career[] = careerData.careers;
export const CAREER_STORAGE_KEY = "excoba.selected-career.2026-1";

export function subjectMatchesArea(subjectName: string, area: string) {
  const value = subjectName.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const normalizedArea = area.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return normalizedArea.startsWith("matematicas") ? value.startsWith("matematicas") : value === normalizedArea;
}
