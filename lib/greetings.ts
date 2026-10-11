/**
 * Salutations de l'accueil selon le moment de la journée + phrase de motivation du jour.
 *
 * Tout est déterministe pour une date donnée : la phrase ne change pas à chaque rendu,
 * elle change chaque jour (et la salutation change selon la période : matin, après-midi,
 * soirée, nuit). L'heure utilisée est celle de l'appareil de l'utilisateur.
 */

type Locale = "fr" | "en";
type Period = "morning" | "afternoon" | "evening" | "night";

export function getPeriod(date: Date): Period {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

// {name} est remplacé par le prénom.
const GREETINGS: Record<Locale, Record<Period, string[]>> = {
  fr: {
    morning: [
      "Bonjour {name} ☀️",
      "Hey {name}, belle matinée à toi !",
      "Quelle belle matinée, {name} !",
      "Bien réveillé {name} ? On y va !",
    ],
    afternoon: [
      "Bon après-midi {name} 👋",
      "Hey {name}, bon après-midi !",
      "Oh, quelle belle journée, {name} !",
      "Salut {name}, ça avance bien aujourd'hui ?",
    ],
    evening: [
      "Bonsoir {name} 🌙",
      "Quelle belle soirée, {name} !",
      "Hey {name}, bonne soirée !",
      "Bonsoir {name}, on fait le point de la journée ?",
    ],
    night: [
      "Bonsoir {name} 🌙",
      "Hey {name}, tu travailles tard !",
      "Encore debout {name} ? Respect 💪",
      "Belle nuit de travail, {name} !",
    ],
  },
  en: {
    morning: [
      "Good morning {name} ☀️",
      "Hey {name}, have a great morning!",
      "What a beautiful morning, {name}!",
      "Rise and shine {name}, let's go!",
    ],
    afternoon: [
      "Good afternoon {name} 👋",
      "Hey {name}, happy afternoon!",
      "Oh, what a beautiful day, {name}!",
      "Hi {name}, how's the day going?",
    ],
    evening: [
      "Good evening {name} 🌙",
      "What a lovely evening, {name}!",
      "Hey {name}, have a great evening!",
      "Good evening {name}, shall we review the day?",
    ],
    night: [
      "Good evening {name} 🌙",
      "Hey {name}, working late!",
      "Still up {name}? Respect 💪",
      "Enjoy the late-night work, {name}!",
    ],
  },
};

const QUOTES: Record<Locale, string[]> = {
  fr: [
    "Chaque vente a commencé par une première personne qui a dit oui.",
    "Une petite action aujourd'hui vaut mieux qu'un grand plan demain.",
    "La régularité bat le talent quand le talent n'est pas régulier.",
    "Ton produit résout un vrai problème : il suffit de le faire savoir.",
    "Les résultats arrivent à ceux qui continuent après le premier test raté.",
    "Teste, mesure, améliore. Recommence.",
    "Une pub qui ne marche pas t'apprend plus qu'une pub jamais lancée.",
    "Ne compare pas ton début au milieu des autres.",
    "Aujourd'hui, une seule chose bien faite suffit.",
    "Les clients achètent la confiance avant d'acheter le produit.",
    "Chaque jour, tu te rapproches de ta première grosse journée de ventes.",
    "Le meilleur moment pour lancer, c'est quand tu es prêt à apprendre en chemin.",
    "Un petit budget bien testé vaut mieux qu'un gros budget au hasard.",
    "La discipline, c'est faire ce qu'il faut même les jours sans motivation.",
    "Ton audience est là, elle attend la bonne offre.",
    "Progresser de 1 % par jour, c'est déjà gagner.",
    "Les grandes marques ont toutes eu zéro vente un jour.",
    "Un bon visuel arrête le pouce, une bonne offre le convainc.",
    "Ne lâche pas : la courbe monte souvent juste après le moment de doute.",
    "Fais simple, fais clair, fais maintenant.",
    "Tu construis quelque chose que personne ne peut te reprendre.",
    "Les petits gains réguliers deviennent de grands résultats.",
    "Chaque campagne est une expérience, pas un verdict.",
    "Concentre-toi sur ce que tu contrôles : ton offre, ton message, ta régularité.",
    "Le succès est souvent juste une idée testée une fois de plus.",
    "Respire, avance, ajuste. Tu es sur la bonne voie.",
    "Ce que tu fais aujourd'hui, ton toi de demain te dira merci.",
    "Un bon départ vaut mieux qu'un départ parfait.",
    "Plus tu partages ton offre, plus elle trouve ses clients.",
    "Aujourd'hui est un bon jour pour lancer une pub.",
  ],
  en: [
    "Every sale started with one person saying yes.",
    "A small action today beats a big plan tomorrow.",
    "Consistency beats talent when talent isn't consistent.",
    "Your product solves a real problem: you just need to let people know.",
    "Results come to those who keep going after the first failed test.",
    "Test, measure, improve. Repeat.",
    "An ad that fails teaches you more than an ad never launched.",
    "Don't compare your beginning to someone else's middle.",
    "Today, one thing done well is enough.",
    "Customers buy trust before they buy the product.",
    "Every day brings you closer to your first big sales day.",
    "The best time to launch is when you're ready to learn along the way.",
    "A small, well-tested budget beats a big random one.",
    "Discipline is doing what's needed even on low-motivation days.",
    "Your audience is out there, waiting for the right offer.",
    "Improving by 1% a day is already winning.",
    "Every big brand once had zero sales.",
    "A good visual stops the scroll, a good offer convinces.",
    "Don't quit: the curve often rises right after the moment of doubt.",
    "Keep it simple, keep it clear, do it now.",
    "You're building something nobody can take away from you.",
    "Small steady gains become big results.",
    "Every campaign is an experiment, not a verdict.",
    "Focus on what you control: your offer, your message, your consistency.",
    "Success is often just one more tested idea.",
    "Breathe, move forward, adjust. You're on the right track.",
    "Tomorrow's you will thank today's you.",
    "A good start beats a perfect start.",
    "The more you share your offer, the more it finds its customers.",
    "Today is a good day to launch an ad.",
  ],
};

// Nombre de jours écoulés depuis l'epoch, en date locale (change à minuit chez l'utilisateur).
function dayNumber(date: Date): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);
}

export function getGreeting(name: string, locale: Locale, date: Date): string {
  const options = GREETINGS[locale][getPeriod(date)];
  const template = options[dayNumber(date) % options.length];
  return template.replace("{name}", name).replace("  ", " ");
}

export function getDailyQuote(locale: Locale, date: Date): string {
  const quotes = QUOTES[locale];
  return quotes[dayNumber(date) % quotes.length];
}
