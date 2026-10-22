import catalog from "./careers.json";

export const careers = catalog.careers;
export const CAREER_COOKIE = "excoba_career_2026_1";
export type Career = (typeof careers)[number];

export function getCareer(id: string | null | undefined) {
  return careers.find((career) => career.id === id) ?? null;
}
