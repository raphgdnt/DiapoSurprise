// Logique d'une partie, sans réseau : un salon, ses joueurs, ses phases.
// Le serveur appelle ces fonctions puis diffuse `vue(salon, joueur)` à chacun.
//
// Deux formats :
// - « relais » (par défaut) : un sujet commun, chacun écrit UNE diapo pour un autre, la conférence
//   se donne en relais, on vote pour le meilleur moment, et on enchaîne trois manches ;
// - « long » : chacun écrit trois diapos pour un autre, qui donne un exposé complet.
// Dans les deux cas un « exposé » est le passage d'un présentateur (1 diapo en relais, 3 en long).

import { randomBytes } from "node:crypto";
import { PACKS, PIEGES, GABARITS, CONSIGNES } from "./content.js";

const RAPIDE = process.env.DS_RAPIDE === "1"; // durées raccourcies pour les tests
const s = (normal, rapide) => (RAPIDE ? rapide : normal) * 1000;

export const DUREES = {
  intro: s(6, 0.15),
  slide: s(15, 0.15),
  slideRelais: s(18, 0.15),
  slideFinale: s(12, 0.15),
  auteur: s(3, 0.1), // révélation de qui a écrit, après chaque passage
  sortie: s(4, 0.15),
  vote: s(60, 2),
  voteRelais: s(30, 2),
};
export const REGLAGES = {
  mode: ["relais", "long"],
  pack: Object.keys(PACKS),
  ecritureSecondes: [90, 120, 180],
  ecritureRelaisSecondes: [45, 60, 90],
};
export const MAX_JOUEURS = 8;
export const MIN_JOUEURS = 2;
export const MANCHES_RELAIS = 3;
export const REACTIONS_COMPTEES = 5; // par spectateur et par passage
const POINTS_REACTION = 10;
const POINTS_GOMMETTE = 100;
const GABARITS_LONG = ["titre", "chiffre", "citation"];
const GABARITS_RELAIS = ["chiffre", "graphique", "liste"];
const LETTRES = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sans I ni O, trop ambigus à dicter

const id = () => randomBytes(6).toString("hex");
const melange = (liste) => {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const texte = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function nouveauCode(existe) {
  for (;;) {
    let code = "";
    for (let i = 0; i < 4; i++) code += LETTRES[Math.floor(Math.random() * LETTRES.length)];
    if (!existe(code)) return code;
  }
}

export function creerSalon(code) {
  return {
    code,
    phase: "salon", // salon | ecriture | presentation | vote | resultats
    joueurs: [],
    hoteId: null,
    mode: "relais",
    pack: "absurde",
    ecritureSecondes: 120, // version longue
    ecritureRelaisSecondes: 45,
    manche: 0,
    exposes: [], // { presentateurId, auteurId, titre, titres, role, slides, pret, pieges }
    historique: [], // manches terminées : { titre, exposes }
    imprevu: null, // { type: "consigne", texte } ou { type: "finale" } : ce qui change dans la manche en cours
    dernier: null, // gagnant de la manche précédente, annoncé au début de la suivante
    courant: null, // { index, etape: intro|slide|sortie, slide }
    votes: {}, // joueurId -> { orateur, slides } ou { moment }
    titresVus: new Set(),
    finA: 0,
    minuteur: null,
  };
}

export function ajouterJoueur(salon, nom) {
  const libres = [0, 1, 2, 3, 4, 5, 6, 7].filter((n) => !salon.joueurs.some((j) => j.place === n));
  if (!libres.length) return null;
  const joueur = {
    id: id(),
    jeton: id() + id(),
    nom: texte(nom, 16) || "Anonyme",
    place: libres[0],
    connecte: true,
    enJeu: false,
    spectateur: false, // regarde, réagit, piège et vote, mais n'écrit pas et ne parle pas
    score: 0,
    piegeChoix: [],
    piegeUtilise: false,
  };
  salon.joueurs.push(joueur);
  if (!salon.hoteId) salon.hoteId = joueur.id;
  return joueur;
}

export function retirerJoueur(salon, joueur) {
  // En pleine partie on garde le joueur (il peut revenir) ; au salon on libère sa place.
  if (salon.phase === "salon" || !joueur.enJeu) {
    salon.joueurs = salon.joueurs.filter((j) => j !== joueur);
  }
  if (salon.hoteId === joueur.id) {
    const suivant = salon.joueurs.find((j) => j.connecte);
    salon.hoteId = suivant ? suivant.id : null;
  }
}

export function regler(salon, cle, valeur) {
  if (salon.phase !== "salon" || !REGLAGES[cle]?.includes(valeur)) return false;
  salon[cle] = valeur;
  return true;
}

const trouver = (salon, joueurId) => salon.joueurs.find((j) => j.id === joueurId);
const actifs = (salon) => salon.joueurs.filter((j) => j.enJeu && j.connecte);
const relais = (salon) => salon.mode === "relais";

function programmer(salon, duree, suite, diffuser) {
  clearTimeout(salon.minuteur);
  salon.finA = Date.now() + duree;
  salon.minuteur = setTimeout(() => {
    suite();
    diffuser();
  }, duree);
}

// Tire des sujets du pack choisi, sans répétition tant que le pack n'est pas épuisé.
function tirerTitres(salon, nombre) {
  const pack = PACKS[salon.pack];
  let frais = pack.filter((t) => !salon.titresVus.has(t));
  if (frais.length < nombre) {
    salon.titresVus.clear();
    frais = pack;
  }
  const pris = melange(frais).slice(0, nombre);
  pris.forEach((t) => salon.titresVus.add(t));
  return pris;
}

export function nettoyerSlide(brut) {
  const g = GABARITS.includes(brut?.gabarit) ? brut.gabarit : "titre";
  const c = brut?.champs ?? {};
  const liste3 = (v, max) => [0, 1, 2].map((i) => texte(Array.isArray(v) ? v[i] : "", max));
  const champs = {
    titre: { titre: texte(c.titre, 70), sousTitre: texte(c.sousTitre, 90) },
    chiffre: { nombre: texte(c.nombre, 9), legende: texte(c.legende, 90) },
    citation: { phrase: texte(c.phrase, 140), auteur: texte(c.auteur, 40) },
    graphique: {
      titre: texte(c.titre, 60),
      libelles: liste3(c.libelles, 22),
      valeurs: [0, 1, 2].map((i) => {
        const n = Number(Array.isArray(c.valeurs) ? c.valeurs[i] : 50);
        return Number.isFinite(n) ? Math.max(4, Math.min(100, Math.round(n))) : 50;
      }),
    },
    liste: { titre: texte(c.titre, 60), points: liste3(c.points, 60) },
  }[g];
  return { gabarit: g, champs };
}

const slideVide = (slide) =>
  Object.values(slide.champs).every((v) =>
    Array.isArray(v) ? v.every((x) => typeof x !== "string" || x === "") : v === ""
  );

export function demarrer(salon, diffuser) {
  const presents = salon.joueurs.filter((j) => j.connecte);
  if (salon.phase !== "salon" && salon.phase !== "resultats") return "La partie est déjà lancée.";
  if (presents.filter((j) => !j.spectateur).length < MIN_JOUEURS) return `Il faut au moins ${MIN_JOUEURS} joueurs.`;
  salon.joueurs = presents;
  for (const j of presents) {
    j.enJeu = true;
    j.score = 0;
  }
  salon.manche = 0;
  salon.historique = [];
  salon.dernier = null;
  lancerManche(salon, diffuser);
  return null;
}

function lancerManche(salon, diffuser) {
  salon.manche++;
  // Ceux qui sont arrivés pendant la manche précédente entrent en jeu maintenant, sans attendre la partie suivante.
  for (const j of salon.joueurs) {
    if (j.connecte && !j.enJeu) Object.assign(j, { enJeu: true, score: 0 });
    // Un petit mot piège par manche.
    j.piegeChoix = melange(PIEGES).slice(0, 3);
    j.piegeUtilise = false;
  }
  // Chacun écrit pour le suivant dans un ordre tiré au sort, qui est aussi l'ordre de passage.
  const ordre = melange(actifs(salon).filter((j) => !j.spectateur));
  const n = ordre.length;
  // Imprévus du relais : une consigne commune en manche 2, puis une finale plus rapide où tout compte double.
  salon.imprevu =
    !relais(salon) || salon.manche === 1 ? null : salon.manche === MANCHES_RELAIS ? { type: "finale" } : { type: "consigne", texte: melange(CONSIGNES)[0] };
  const auteur = (i) => ordre[(i - 1 + n) % n].id;
  if (relais(salon)) {
    const [titre] = tirerTitres(salon, 1);
    salon.exposes = ordre.map((presentateur, i) => ({
      presentateurId: presentateur.id,
      auteurId: auteur(i),
      titres: [titre],
      titre,
      role: i === 0 ? "ouverture" : i === n - 1 ? "conclusion" : "suite",
      slides: [nettoyerSlide({ gabarit: i === 0 ? "titre" : i === n - 1 ? "citation" : GABARITS_RELAIS[(i - 1) % 3] })],
      pret: false,
      pieges: [],
      reactions: {},
    }));
  } else {
    // L'auteur choisit le sujet parmi trois propositions (ou écrit le sien) ; chaque diapo a un gabarit
    // de départ qui suit son rôle : planter le décor, apporter la preuve, conclure.
    const titres = tirerTitres(salon, n * 3);
    salon.exposes = ordre.map((presentateur, i) => ({
      presentateurId: presentateur.id,
      auteurId: auteur(i),
      titres: titres.slice(i * 3, i * 3 + 3),
      titre: titres[i * 3],
      role: null,
      slides: GABARITS_LONG.map((gabarit) => nettoyerSlide({ gabarit })),
      pret: false,
      pieges: [],
      reactions: {},
    }));
  }
  salon.votes = {};
  salon.courant = null;
  salon.phase = "ecriture";
  const duree = (relais(salon) ? salon.ecritureRelaisSecondes : salon.ecritureSecondes) * (RAPIDE ? 20 : 1000);
  programmer(salon, duree, () => lancerPresentations(salon, diffuser), diffuser);
}

const exposeEcritPar = (salon, joueurId) => salon.exposes.find((e) => e.auteurId === joueurId);

export function brouillon(salon, joueur, slides, titre) {
  if (salon.phase !== "ecriture") return;
  const expose = exposeEcritPar(salon, joueur.id);
  if (!expose) return;
  if (!relais(salon) && texte(titre, 70)) expose.titre = texte(titre, 70);
  if (!Array.isArray(slides)) return;
  expose.slides = expose.slides.map((_, i) => nettoyerSlide(slides[i]));
}

export function marquerPret(salon, joueur, pret, diffuser) {
  if (salon.phase !== "ecriture") return;
  const expose = exposeEcritPar(salon, joueur.id);
  if (!expose) return;
  expose.pret = !!pret;
  const attendus = salon.exposes.filter((e) => trouver(salon, e.auteurId)?.connecte);
  if (attendus.length && attendus.every((e) => e.pret)) lancerPresentations(salon, diffuser);
}

function lancerPresentations(salon, diffuser) {
  if (salon.phase !== "ecriture") return;
  for (const e of salon.exposes) {
    const auteur = trouver(salon, e.auteurId)?.nom ?? "quelqu'un";
    e.slides = e.slides.map((sl) =>
      slideVide(sl) ? nettoyerSlide({ gabarit: "titre", champs: { titre: "Diapo laissée vide", sousTitre: `${auteur} n'a rien écrit. Improvise.` } }) : sl
    );
  }
  salon.phase = "presentation";
  ouvrirExpose(salon, 0, diffuser);
}

// Premier présentateur encore connecté à partir de `index` (on saute ceux qui sont partis).
function prochain(salon, index) {
  while (index < salon.exposes.length && !trouver(salon, salon.exposes[index].presentateurId)?.connecte) index++;
  return index;
}

function ouvrirExpose(salon, index, diffuser) {
  index = prochain(salon, index);
  if (index >= salon.exposes.length) return ouvrirVote(salon, diffuser);
  salon.courant = { index, etape: "intro", slide: 0 };
  programmer(salon, DUREES.intro, () => avancer(salon, diffuser), diffuser);
}

export function avancer(salon, diffuser) {
  if (salon.phase !== "presentation" || !salon.courant) return;
  const c = salon.courant;
  const suite = () => avancer(salon, diffuser);
  const dureeSlide = salon.imprevu?.type === "finale" ? DUREES.slideFinale : relais(salon) ? DUREES.slideRelais : DUREES.slide;
  if (c.etape === "intro") {
    c.etape = "slide";
    c.slide = 0;
    programmer(salon, dureeSlide, suite, diffuser);
  } else if (c.etape === "slide" && c.slide < salon.exposes[c.index].slides.length - 1) {
    c.slide++;
    programmer(salon, dureeSlide, suite, diffuser);
  } else if (c.etape === "slide") {
    // Le passage est fini : on révèle qui avait écrit, la diapo reste à l'écran.
    c.etape = "auteur";
    programmer(salon, DUREES.auteur, suite, diffuser);
  } else if (c.etape === "auteur" && relais(salon) && prochain(salon, c.index + 1) < salon.exposes.length) {
    // En relais on passe directement la parole au suivant, sans carton intermédiaire.
    salon.courant = { index: prochain(salon, c.index + 1), etape: "slide", slide: 0 };
    programmer(salon, dureeSlide, suite, diffuser);
  } else if (c.etape === "auteur") {
    c.etape = "sortie";
    programmer(salon, DUREES.sortie, suite, diffuser);
  } else if (relais(salon)) {
    ouvrirVote(salon, diffuser);
  } else {
    ouvrirExpose(salon, c.index + 1, diffuser);
  }
}

// L'hôte peut toujours passer ; celui qui parle peut passer sa propre diapo quand il a fini.
export function peutPasser(salon, joueur) {
  if (salon.phase !== "presentation" || !salon.courant) return false;
  if (salon.hoteId === joueur.id) return true;
  return salon.courant.etape === "slide" && salon.exposes[salon.courant.index].presentateurId === joueur.id;
}

export function tendrePiege(salon, joueur, choix) {
  if (salon.phase !== "presentation" || salon.courant?.etape !== "slide") return false;
  const expose = salon.exposes[salon.courant.index];
  if (!joueur.enJeu || joueur.piegeUtilise || expose.presentateurId === joueur.id) return false;
  const piege = joueur.piegeChoix[choix];
  if (!piege) return false;
  joueur.piegeUtilise = true;
  expose.pieges.push({ texte: piege, deId: joueur.id, slide: salon.courant.slide });
  return true;
}

// L'applaudimètre : chaque réaction du public rapporte des points à celui qui parle et à celui qui a écrit.
// On ne compte ni les réactions de ces deux-là, ni plus de quelques-unes par spectateur et par passage.
const applaudi = (expose) => Object.values(expose.reactions).reduce((n, x) => n + Math.min(x, REACTIONS_COMPTEES), 0);

export function reagir(salon, joueur) {
  if (salon.phase !== "presentation" || !salon.courant) return null;
  const expose = salon.exposes[salon.courant.index];
  if (salon.courant.etape === "slide" && joueur.enJeu && joueur.id !== expose.presentateurId && joueur.id !== expose.auteurId) {
    expose.reactions[joueur.id] = (expose.reactions[joueur.id] ?? 0) + 1;
  }
  return applaudi(expose);
}

export function regarder(salon, joueur, oui) {
  if (salon.phase !== "salon") return false;
  joueur.spectateur = !!oui;
  return true;
}

/* ---------- Vote ---------- */

const CATEGORIES = { relais: ["moment"], long: ["orateur", "slides"] };
const interdit = (expose, joueur, categorie) =>
  (categorie !== "slides" && expose.presentateurId === joueur.id) || (categorie !== "orateur" && expose.auteurId === joueur.id);

// Un joueur a fini de voter quand chaque catégorie est remplie, ou qu'il n'a aucun choix autorisé.
const aFiniDeVoter = (salon, joueur) =>
  CATEGORIES[salon.mode].every(
    (cat) => salon.votes[joueur.id]?.[cat] !== undefined || salon.exposes.every((e) => interdit(e, joueur, cat))
  );

function ouvrirVote(salon, diffuser) {
  salon.phase = "vote";
  salon.courant = null;
  salon.votes = {};
  programmer(salon, relais(salon) ? DUREES.voteRelais : DUREES.vote, () => cloreVote(salon, diffuser), diffuser);
  if (actifs(salon).every((j) => aFiniDeVoter(salon, j))) cloreVote(salon, diffuser); // à deux en relais, personne ne peut voter
}

export function voter(salon, joueur, categorie, index, diffuser) {
  if (salon.phase !== "vote" || !joueur.enJeu) return;
  const expose = salon.exposes[index];
  if (!expose || !CATEGORIES[salon.mode].includes(categorie) || interdit(expose, joueur, categorie)) return;
  (salon.votes[joueur.id] ??= {})[categorie] = index;
  if (actifs(salon).every((j) => aFiniDeVoter(salon, j))) cloreVote(salon, diffuser);
}

function cloreVote(salon, diffuser) {
  if (salon.phase !== "vote") return;
  clearTimeout(salon.minuteur);
  salon.finA = 0;
  for (const e of salon.exposes) Object.assign(e, { voixOrateur: 0, voixSlides: 0, voix: 0 });
  for (const v of Object.values(salon.votes)) {
    if (v.orateur !== undefined) salon.exposes[v.orateur].voixOrateur++;
    if (v.slides !== undefined) salon.exposes[v.slides].voixSlides++;
    if (v.moment !== undefined) salon.exposes[v.moment].voix++;
  }
  // Une gommette vaut 100 points, une réaction du public 10. En relais, la gommette récompense à la fois
  // celui qui parle et celui qui a écrit. En finale, tout compte double.
  const facteur = salon.imprevu?.type === "finale" ? 2 : 1;
  for (const e of salon.exposes) {
    e.applaudi = applaudi(e);
    const p = trouver(salon, e.presentateurId);
    const a = trouver(salon, e.auteurId);
    if (p) p.score += ((e.voixOrateur + e.voix) * POINTS_GOMMETTE + e.applaudi * POINTS_REACTION) * facteur;
    if (a) a.score += ((e.voixSlides + e.voix) * POINTS_GOMMETTE + e.applaudi * POINTS_REACTION) * facteur;
  }
  salon.historique.push({ titre: salon.exposes[0]?.titre ?? "", exposes: salon.exposes });
  const poids = (e) => (e.voix + e.voixOrateur + e.voixSlides) * POINTS_GOMMETTE + e.applaudi * POINTS_REACTION;
  const meilleur = [...salon.exposes].sort((x, y) => poids(y) - poids(x))[0];
  salon.dernier = meilleur && poids(meilleur) ? { presentateurId: meilleur.presentateurId, auteurId: meilleur.auteurId, manche: salon.manche } : null;

  if (relais(salon) && salon.manche < MANCHES_RELAIS && actifs(salon).filter((j) => !j.spectateur).length >= MIN_JOUEURS) {
    lancerManche(salon, diffuser);
  } else {
    salon.phase = "resultats";
  }
}

export function retourSalon(salon) {
  clearTimeout(salon.minuteur);
  salon.phase = "salon";
  salon.exposes = [];
  salon.historique = [];
  salon.dernier = null;
  salon.imprevu = null;
  salon.courant = null;
  salon.votes = {};
  salon.manche = 0;
  salon.finA = 0;
  salon.joueurs = salon.joueurs.filter((j) => j.connecte);
  for (const j of salon.joueurs) j.enJeu = false;
  if (!salon.joueurs.some((j) => j.id === salon.hoteId)) salon.hoteId = salon.joueurs[0]?.id ?? null;
}

/* ---------- Ce qu'un joueur donné a le droit de voir à cet instant ---------- */

export function vue(salon, moi) {
  const v = {
    t: "etat",
    code: salon.code,
    phase: salon.phase,
    maintenant: Date.now(),
    finA: salon.finA,
    hoteId: salon.hoteId,
    mode: salon.mode,
    pack: salon.pack,
    ecritureSecondes: salon.ecritureSecondes,
    ecritureRelaisSecondes: salon.ecritureRelaisSecondes,
    manche: salon.manche,
    manches: relais(salon) ? MANCHES_RELAIS : 1,
    imprevu: salon.imprevu,
    moi: { id: moi.id, nom: moi.nom, enJeu: moi.enJeu, spectateur: moi.spectateur, piegeChoix: moi.piegeUtilise ? [] : moi.piegeChoix },
    joueurs: salon.joueurs.map((j) => ({
      id: j.id,
      nom: j.nom,
      place: j.place,
      connecte: j.connecte,
      enJeu: j.enJeu,
      spectateur: j.spectateur,
      score: j.score,
    })),
  };

  if (salon.phase === "ecriture") {
    const mien = exposeEcritPar(salon, moi.id);
    v.prets = salon.exposes.filter((e) => e.pret).map((e) => e.auteurId);
    v.dernier = salon.dernier;
    if (mien) {
      v.ecriture = {
        titre: mien.titre,
        titres: mien.titres,
        pourId: mien.presentateurId,
        slides: mien.slides,
        pret: mien.pret,
        role: mien.role,
        passage: salon.exposes.indexOf(mien) + 1,
        total: salon.exposes.length,
      };
    }
  }

  if (salon.phase === "presentation" && salon.courant) {
    const c = salon.courant;
    const e = salon.exposes[c.index];
    v.presentation = {
      index: c.index,
      total: salon.exposes.length,
      etape: c.etape,
      numeroSlide: c.slide,
      nbSlides: e.slides.length,
      presentateurId: e.presentateurId,
      suivantId: salon.exposes[prochain(salon, c.index + 1)]?.presentateurId ?? null,
      titre: e.titre,
      slide: c.etape === "slide" || c.etape === "auteur" ? e.slides[c.slide] : null,
      auteurId: c.etape === "auteur" ? e.auteurId : null,
      pieges: e.pieges.filter((p) => c.etape === "slide" && p.slide === c.slide).map((p) => ({ texte: p.texte, deId: p.deId })),
      peutPieger: c.etape === "slide" && moi.enJeu && !moi.piegeUtilise && e.presentateurId !== moi.id,
      peutPasser: peutPasser(salon, moi),
      applaudi: applaudi(e),
      applaudiMax: Math.max(1, salon.joueurs.filter((j) => j.enJeu && j.connecte && j.id !== e.presentateurId && j.id !== e.auteurId).length * REACTIONS_COMPTEES),
    };
  }

  if (salon.phase === "vote") {
    v.vote = {
      exposes: salon.exposes.map((e, index) => ({
        index,
        titre: e.titre,
        presentateurId: e.presentateurId,
        slides: e.slides,
        interditOrateur: interdit(e, moi, "orateur"),
        interditSlides: interdit(e, moi, "slides"),
        interditMoment: interdit(e, moi, "moment"),
        estPresentateur: e.presentateurId === moi.id,
      })),
      mesVotes: salon.votes[moi.id] ?? {},
      ontVote: salon.joueurs.filter((j) => aFiniDeVoter(salon, j)).map((j) => j.id),
    };
  }

  if (salon.phase === "resultats") {
    const detail = (e) => ({
      titre: e.titre,
      presentateurId: e.presentateurId,
      auteurId: e.auteurId,
      slides: e.slides,
      voixOrateur: e.voixOrateur ?? 0,
      voixSlides: e.voixSlides ?? 0,
      voix: e.voix ?? 0,
      applaudi: e.applaudi ?? 0,
    });
    v.resultats = { manches: salon.historique.map((m) => ({ titre: m.titre, exposes: m.exposes.map(detail) })) };
  }
  return v;
}
