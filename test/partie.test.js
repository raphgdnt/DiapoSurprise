// Joue deux parties complètes à trois clients contre un vrai serveur, en durées raccourcies :
// une en version longue (trois diapos chacun), une en relais (une diapo chacun, trois manches).
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import WebSocket from "ws";

const PORT = 3917;
const serveur = spawn(process.execPath, ["server/server.js"], {
  env: { ...process.env, PORT, DS_RAPIDE: "1" },
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise((ok) => serveur.stdout.once("data", ok));

function client(nom) {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const c = { nom, ws, etat: null, id: null, reactions: 0, erreurs: [] };
  ws.on("message", (brut) => {
    const m = JSON.parse(brut);
    if (m.t === "bienvenue") Object.assign(c, { id: m.id, code: m.code });
    if (m.t === "etat") c.etat = m;
    if (m.t === "reaction") c.reactions++;
    if (m.t === "erreur") c.erreurs.push(m.texte);
  });
  c.dire = (m) => ws.send(JSON.stringify(m));
  c.ouvert = new Promise((ok) => ws.once("open", ok));
  return c;
}
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
const attendre = async (condition, quoi, max = 5000) => {
  const debut = Date.now();
  while (!condition()) {
    if (Date.now() - debut > max) throw new Error(`Délai dépassé : ${quoi}`);
    await pause(5);
  }
};
const somme = (liste, f) => liste.reduce((n, x) => n + f(x), 0);

try {
  const [a, b, c] = ["Alice", "Bob", "Chloé"].map(client);
  const tous = [a, b, c];
  await Promise.all(tous.map((x) => x.ouvert));

  a.dire({ t: "creer", nom: a.nom });
  await attendre(() => a.code, "création du salon");
  b.dire({ t: "rejoindre", code: a.code.toLowerCase(), nom: b.nom });
  c.dire({ t: "rejoindre", code: a.code, nom: c.nom });
  await attendre(() => a.etat?.joueurs.length === 3, "trois joueurs au salon");
  assert.equal(a.etat.hoteId, a.id);
  assert.equal(a.etat.mode, "relais", "le relais est le format par défaut");

  /* ----- Réglages ----- */
  b.dire({ t: "reglage", cle: "pack", valeur: "noir" }); // seul l'hôte règle
  b.dire({ t: "lancer" }); // et seul l'hôte lance
  a.dire({ t: "reglage", cle: "pack", valeur: "inconnu" });
  await pause(50);
  assert.equal(a.etat.pack, "absurde");
  assert.equal(a.etat.phase, "salon");
  a.dire({ t: "reglage", cle: "mode", valeur: "long" });
  a.dire({ t: "reglage", cle: "pack", valeur: "noir" });
  await attendre(() => c.etat.mode === "long" && c.etat.pack === "noir", "réglages diffusés");

  /* ----- Version longue ----- */
  a.dire({ t: "lancer" });
  await attendre(() => tous.every((x) => x.etat.phase === "ecriture"), "phase d'écriture");
  for (const x of tous) {
    const e = x.etat.ecriture;
    assert.notEqual(e.pourId, x.id, "personne n'écrit pour soi-même");
    assert.equal(x.etat.moi.piegeChoix.length, 3);
    assert.equal(e.titres.length, 3, "trois sujets au choix");
    assert.equal(e.titre, e.titres[0]);
    assert.deepEqual(e.slides.map((s) => s.gabarit), ["titre", "chiffre", "citation"]);
  }
  assert.equal(new Set(tous.map((x) => x.etat.ecriture.pourId)).size, 3, "chacun a un destinataire différent");

  const slides = (nom) => [
    { gabarit: "chiffre", champs: { nombre: "87 %", legende: `écrit par ${nom}` } },
    { gabarit: "citation", champs: { phrase: "<b>pas de html</b>", auteur: "x".repeat(200) } },
    { gabarit: "inconnu", champs: {} },
  ];
  a.dire({ t: "pret", pret: true, slides: slides("Alice"), titre: "  Mon sujet   perso  " });
  b.dire({ t: "pret", pret: true, slides: slides("Bob"), titre: b.etat.ecriture.titres[2] });
  await pause(50);
  assert.equal(a.etat.phase, "ecriture", "on attend le dernier auteur");
  c.dire({ t: "pret", pret: true, slides: slides("Chloé") });

  await attendre(() => a.etat.phase === "presentation", "début des présentations");
  let piegeTendu = false;
  let slidesVues = 0;
  let dernier = "";
  while (a.etat.phase === "presentation") {
    const p = a.etat.presentation;
    const cle = `${p.index}-${p.etape}-${p.numeroSlide}`;
    if (cle !== dernier) {
      dernier = cle;
      if (p.etape === "slide") {
        slidesVues++;
        assert.ok(p.slide, "la slide courante est visible");
        const spectateur = tous.find((x) => x.id !== p.presentateurId);
        spectateur.dire({ t: "reaction", genre: "rire" });
        if (!piegeTendu && spectateur.etat.presentation?.peutPieger) {
          spectateur.dire({ t: "piege", choix: 0 });
          piegeTendu = true;
        }
      } else {
        assert.equal(p.slide, null, "pas de slide pendant l'intro ou la sortie");
      }
    }
    await pause(5);
  }
  assert.ok(slidesVues >= 7, `les slides ont défilé (${slidesVues} vues sur 9)`);
  assert.ok(a.reactions > 0, "les réactions sont diffusées");

  await attendre(() => tous.every((x) => x.etat.phase === "vote"), "phase de vote");
  for (const x of tous) {
    const libre = (champ) => x.etat.vote.exposes.find((e) => !e[champ]).index;
    const soi = x.etat.vote.exposes.find((e) => e.interditOrateur).index;
    x.dire({ t: "vote", categorie: "orateur", index: soi }); // voter pour soi est refusé
    x.dire({ t: "vote", categorie: "moment", index: libre("interditMoment") }); // catégorie d'un autre format
    x.dire({ t: "vote", categorie: "orateur", index: libre("interditOrateur") });
    x.dire({ t: "vote", categorie: "slides", index: libre("interditSlides") });
  }

  await attendre(() => tous.every((x) => x.etat.phase === "resultats"), "résultats");
  assert.equal(a.etat.resultats.manches.length, 1);
  const r = a.etat.resultats.manches[0].exposes;
  assert.equal(somme(r, (e) => e.voixOrateur), 3);
  assert.equal(somme(r, (e) => e.voixSlides), 3);
  const applaudi = somme(r, (e) => e.applaudi);
  assert.ok(applaudi > 0, "l'applaudimètre a compté des réactions");
  assert.ok(r.every((e) => e.applaudi <= 5), "au plus cinq réactions comptées par spectateur et par passage");
  assert.equal(somme(a.etat.joueurs, (j) => j.score), 600 + applaudi * 20, "100 par gommette, 10 par réaction pour l'orateur et pour l'auteur");
  assert.ok(r.some((e) => e.titre === "Mon sujet perso"), "un sujet écrit par l'auteur est retenu");
  assert.ok(r[0].slides[1].champs.auteur.length <= 40, "les champs sont tronqués");
  assert.equal(r[0].slides[2].gabarit, "titre", "une slide vide est remplacée");

  a.dire({ t: "rejouer" });
  await attendre(() => tous.every((x) => x.etat.phase === "salon"), "retour au salon");

  /* ----- Relais : une diapo chacun, trois manches ----- */
  // Un spectateur ne compte pas parmi les joueurs : à trois dont un qui regarde, on reste deux, c'est jouable ;
  // à trois dont deux qui regardent, la partie ne se lance pas.
  b.dire({ t: "regarder", oui: true });
  c.dire({ t: "regarder", oui: true });
  await attendre(() => a.etat.joueurs.filter((j) => j.spectateur).length === 2, "deux spectateurs");
  a.dire({ t: "lancer" });
  await attendre(() => a.erreurs.length === 1, "refus de lancer à un seul joueur");
  a.erreurs.length = 0;
  assert.equal(a.etat.phase, "salon");
  b.dire({ t: "regarder", oui: false });
  c.dire({ t: "regarder", oui: false });
  await attendre(() => a.etat.joueurs.every((j) => !j.spectateur), "retour des joueurs");
  a.dire({ t: "reglage", cle: "mode", valeur: "relais" });
  a.dire({ t: "reglage", cle: "pack", valeur: "genant" });
  await attendre(() => a.etat.mode === "relais", "passage en relais");
  a.dire({ t: "lancer" });
  const sujets = new Set();
  for (let manche = 1; manche <= 3; manche++) {
    await attendre(() => tous.every((x) => x.etat.phase === "ecriture" && x.etat.manche === manche), `écriture de la manche ${manche}`);
    assert.equal(new Set(tous.map((x) => x.etat.ecriture.titre)).size, 1, "un seul sujet pour toute la salle");
    assert.equal(a.etat.imprevu?.type ?? null, [null, "consigne", "finale"][manche - 1], "un imprévu en manche 2, la finale en manche 3");
    sujets.add(a.etat.ecriture.titre);
    assert.deepEqual(tous.map((x) => x.etat.ecriture.role).sort(), ["conclusion", "ouverture", "suite"]);
    for (const x of tous) {
      assert.equal(x.etat.ecriture.slides.length, 1, "une seule diapo à écrire");
      x.dire({ t: "pret", pret: true, slides: [{ gabarit: "liste", champs: { titre: x.nom, points: ["un", "deux", ""] } }], titre: "sujet ignoré en relais" });
    }
    await attendre(() => a.etat.phase === "presentation", "début du relais");
    assert.equal(a.etat.presentation.etape, "intro");
    const orateurs = new Set();
    while (a.etat.phase === "presentation") {
      const p = a.etat.presentation;
      if (p.etape === "slide") {
        orateurs.add(p.presentateurId);
        assert.equal(p.nbSlides, 1);
        const orateur = tous.find((x) => x.id === p.presentateurId);
        const autre = tous.find((x) => x.id !== p.presentateurId && x.id !== a.etat.hoteId);
        if (autre?.etat.presentation?.index === p.index) assert.equal(autre.etat.presentation.peutPasser, false, "un spectateur ne peut pas passer");
        if (manche === 2) orateur.dire({ t: "passer" }); // celui qui parle peut abréger
      }
      await pause(5);
    }
    assert.ok(orateurs.size >= 2, "la parole a tourné");
    await attendre(() => a.etat.phase === "vote" || a.etat.manche > manche || a.etat.phase === "resultats", "vote du relais");
    if (a.etat.phase === "vote") {
      // À trois, chaque diapo implique deux joueurs : chacun n'a qu'un seul choix possible.
      await attendre(() => tous.every((x) => x.etat.phase === "vote"), "vote chez tous");
      for (const x of tous) {
        const possibles = x.etat.vote.exposes.filter((e) => !e.interditMoment);
        assert.equal(possibles.length, 1);
        x.dire({ t: "vote", categorie: "moment", index: possibles[0].index });
      }
    }
  }
  await attendre(() => tous.every((x) => x.etat.phase === "resultats"), "résultats du relais");
  assert.equal(sujets.size, 3, "un sujet différent à chaque manche");
  assert.ok(!sujets.has("sujet ignoré en relais"));
  const manches = a.etat.resultats.manches;
  assert.equal(manches.length, 3);
  assert.equal(somme(manches, (m) => somme(m.exposes, (e) => e.voix)), 9, "trois votes par manche");
  assert.equal(somme(a.etat.joueurs, (j) => j.score), 2400, "100 à l'orateur et 100 à l'auteur par vote, doublés en finale");

  assert.deepEqual(tous.flatMap((x) => x.erreurs), []);
  console.log("OK : une partie longue et une partie en relais (trois manches) se sont déroulées correctement.");
} finally {
  serveur.kill();
}
process.exit(0);
