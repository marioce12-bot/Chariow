export type DailyMotivation = {
  id: string;
  author: string;
  fr: string;
  en: string;
  work: string;
  source: string;
};

const lion = "https://fr.wikisource.org/wiki/Fables_de_La_Fontaine_(%C3%A9d._1874)/Le_Lion_et_le_Rat";
const tortoise = "https://fr.wikisource.org/wiki/Fables_de_La_Fontaine_(%C3%A9d._1874)/Le_Li%C3%A8vre_et_la_Tortue";
const boileau = "https://fr.wikisource.org/wiki/Boileau_-_%C5%92uvres_po%C3%A9tiques/L%E2%80%99Art_po%C3%A9tique/Chant_I";
const descartes = "https://fr.wikisource.org/wiki/Discours_de_la_m%C3%A9thode_(%C3%A9d._Cousin)/Premi%C3%A8re_partie";

// French excerpts verified against the original works; English is an app translation.
export const DAILY_MOTIVATIONS: readonly DailyMotivation[] = [
  { id: "patience", author: "Jean de La Fontaine", fr: "Patience et longueur de temps font plus que force ni que rage.", en: "Patience and time achieve more than force or anger.", work: "Le Lion et le Rat", source: lion },
  { id: "perseverance", author: "Nicolas Boileau", fr: "Hâtez-vous lentement ; et, sans perdre courage, vingt fois sur le métier remettez votre ouvrage.", en: "Make haste slowly; without losing heart, return to your work again and again.", work: "L’Art poétique, chant I", source: boileau },
  { id: "application", author: "René Descartes", fr: "Ce n’est pas assez d’avoir l’esprit bon, mais le principal est de l’appliquer bien.", en: "It is not enough to have a good mind; the main thing is to apply it well.", work: "Discours de la méthode, première partie", source: descartes },
  { id: "consistency", author: "Jean de La Fontaine", fr: "Rien ne sert de courir ; il faut partir à point.", en: "There is no point in running; you must start at the right time.", work: "Le Lièvre et la Tortue", source: tortoise },
  { id: "clarity", author: "Nicolas Boileau", fr: "Ce que l’on conçoit bien s’énonce clairement, et les mots pour le dire arrivent aisément.", en: "What is clearly understood can be clearly expressed, and the words come easily.", work: "L’Art poétique, chant I", source: boileau },
  { id: "cooperation", author: "Jean de La Fontaine", fr: "On a souvent besoin d’un plus petit que soi.", en: "We often need someone smaller than ourselves.", work: "Le Lion et le Rat", source: lion },
  { id: "learning", author: "Nicolas Boileau", fr: "Aimez qu’on vous conseille, et non pas qu’on vous loue.", en: "Welcome advice rather than praise.", work: "L’Art poétique, chant I", source: boileau },
];

export function getDailyMotivation(date: Date = new Date()): DailyMotivation {
  if (!Number.isFinite(date.getTime())) return DAILY_MOTIVATIONS[0];
  // Use the visitor's calendar day, not the UTC day or a random render-time value.
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  const index = ((day % DAILY_MOTIVATIONS.length) + DAILY_MOTIVATIONS.length) % DAILY_MOTIVATIONS.length;
  return DAILY_MOTIVATIONS[index];
}
