// « Inspire-moi » : des bouts de diapos volontairement passe-partout, qui marchent avec n'importe quel sujet.
// Le bouton complète les champs vides ; si tout est déjà rempli, il propose une nouvelle idée complète.

const IDEES = {
  titre: {
    titre: [
      "Tout a commencé un mardi",
      "Ce qu'on ne vous dit pas",
      "Les faits, rien que les faits",
      "Une découverte qui dérange",
      "Le problème dont personne ne parle",
      "Avant de commencer, mes excuses",
      "Pourquoi maintenant ?",
      "Il faut qu'on parle",
      "Personne n'était prêt",
      "Une histoire vraie, hélas",
    ],
    sousTitre: [
      "Et franchement, on aurait dû se méfier",
      "Une enquête de trois minutes",
      "Sources : moi",
      "Âmes sensibles s'abstenir",
      "Résumé pour ceux qui n'écoutent pas",
      "Toute ressemblance avec quelqu'un ici est voulue",
      "Je n'ai pas dormi pour préparer ça",
      "Conférence déconseillée par mon avocat",
    ],
  },
  chiffre: {
    nombre: ["87 %", "3 sur 4", "0", "1 seul", "12 000", "x 40", "-200 %", "9 fois", "42", "1 sur 2", "600 €"],
    legende: [
      "des experts interrogés ont refusé de répondre",
      "des personnes concernées l'ignorent encore",
      "c'est le nombre de fois où ça a marché",
      "d'après une étude que j'ai perdue",
      "et ça augmente chaque année",
      "de mes proches m'ont demandé d'arrêter",
      "c'est beaucoup trop, vous en conviendrez",
      "le chiffre que le gouvernement vous cache",
      "et je pèse mes mots",
    ],
  },
  citation: {
    phrase: [
      "Je ne dis pas que c'est vrai. Je dis que c'est sur ma diapo.",
      "On m'avait prévenu. Je n'ai pas écouté.",
      "Si j'avais su, je serais resté couché.",
      "C'est exactement ce qu'ils veulent vous faire croire.",
      "Faites-moi confiance, j'ai lu le début d'un article.",
      "Au début j'ai ri. Maintenant j'ai peur.",
      "Ce n'est pas illégal si personne ne regarde.",
      "J'ai tout vu. Je ne dirai rien. Sauf maintenant.",
    ],
    auteur: [
      "Ton tonton, à Noël",
      "Un expert qui passait par là",
      "Ma voisine du dessus",
      "Un témoin, en chaussettes",
      "Napoléon, probablement",
      "Le stagiaire",
      "Moi, hier soir",
      "Un inconnu dans le bus",
    ],
  },
  graphique: {
    titre: [
      "Niveau de confiance au fil du temps",
      "Qui est responsable, selon moi",
      "Mon enthousiasme pendant cette présentation",
      "Ce qu'on avait prévu, et la suite",
      "Évolution de la situation",
      "Résultats de mon enquête",
    ],
    libelles: [
      ["Avant", "Pendant", "Après"],
      ["Moi", "Vous", "Les autres"],
      ["Lundi", "Mercredi", "Vendredi"],
      ["Prévu", "Réel", "Avoué"],
      ["Théorie", "Pratique", "Catastrophe"],
      ["Espoir", "Doute", "Regret"],
    ],
  },
  liste: {
    titre: ["Le plan en trois étapes", "Trois raisons d'y croire", "Ce qu'il faut retenir", "Les signes qui ne trompent pas", "Comment réagir", "Les leçons de cette affaire"],
    points: [
      ["Nier", "Accuser le voisin", "Partir en vacances"],
      ["Rester calme", "Paniquer quand même", "Appeler sa mère"],
      ["On ne sait pas", "On ne saura jamais", "Mais on a des soupçons"],
      ["C'est grave", "C'est très grave", "Bon appétit"],
      ["Observer", "Prendre des notes", "Ne rien dire à personne"],
      ["Ça coûte cher", "Ça ne sert à rien", "J'en veux un"],
    ],
  },
};

const auHasard = (liste, sauf) => {
  const choix = liste.filter((x) => JSON.stringify(x) !== JSON.stringify(sauf));
  return choix[Math.floor(Math.random() * choix.length)];
};

// Modifie `slide.champs` sur place.
export function inspirer(slide) {
  const idees = IDEES[slide.gabarit];
  const c = slide.champs;
  const cles = Object.keys(idees);
  const vide = (cle) => (Array.isArray(c[cle]) ? c[cle].every((x) => !x) : !c[cle]);
  const toutRemplir = !cles.some(vide);
  for (const cle of cles) {
    if (!toutRemplir && !vide(cle)) continue;
    c[cle] = Array.isArray(c[cle]) ? [...auHasard(idees[cle], c[cle])] : auHasard(idees[cle], c[cle]);
  }
  if (slide.gabarit === "graphique" && toutRemplir) c.valeurs = [0, 1, 2].map(() => 10 + Math.round(Math.random() * 85));
}
