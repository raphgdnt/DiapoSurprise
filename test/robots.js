// Faux joueurs pour tester seul : node test/robots.js CODE [nombre] [port]
// Ils rejoignent le salon, écrivent des diapos, réagissent, tendent un piège et votent, dans les deux formats.
import WebSocket from "ws";

const [code, nombre = "2", port = "3000"] = process.argv.slice(2);
if (!code) {
  console.error("Usage : node test/robots.js CODE [nombre] [port]");
  process.exit(1);
}
const NOMS = ["Bob", "Chloé", "Mehdi", "Lucie", "Tom", "Inès", "Hugo"];
const DIAPOS = [
  { gabarit: "chiffre", champs: { nombre: "3 sur 4", legende: "des experts interrogés ont refusé de répondre" } },
  { gabarit: "titre", champs: { titre: "Tout a commencé un mardi", sousTitre: "Et franchement, on aurait dû se méfier" } },
  { gabarit: "citation", champs: { phrase: "Je ne dis pas que c'est vrai. Je dis que c'est sur ma diapo.", auteur: "Ton tonton, à Noël" } },
  { gabarit: "graphique", champs: { titre: "Niveau de confiance au fil du temps", libelles: ["Avant", "Pendant", "Après"], valeurs: [92, 41, 8] } },
  { gabarit: "liste", champs: { titre: "Le plan en trois étapes", points: ["Nier", "Accuser le voisin", "Partir en vacances"] } },
];

for (let n = 0; n < Number(nombre); n++) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const dire = (m) => ws.send(JSON.stringify(m));
  let moi = null;
  let vu = "";
  ws.on("open", () => dire({ t: "rejoindre", code, nom: NOMS[n % NOMS.length] }));
  ws.on("message", (brut) => {
    const m = JSON.parse(brut);
    if (m.t === "erreur") console.log(`${NOMS[n]} : ${m.texte}`);
    if (m.t === "bienvenue") moi = m.id;
    if (m.t !== "etat") return;
    const cle = `${m.phase}-${m.manche}-${m.presentation?.index}-${m.presentation?.etape}-${m.presentation?.numeroSlide}`;
    if (cle === vu) return;
    vu = cle;
    if (m.phase === "ecriture" && m.ecriture && !m.ecriture.pret) {
      const slides = m.ecriture.slides.map((_, i) => DIAPOS[(n * 2 + i + m.manche) % DIAPOS.length]);
      setTimeout(() => dire({ t: "pret", pret: true, slides }), 1500 + n * 800);
    }
    if (m.phase === "presentation" && m.presentation.etape === "slide" && m.presentation.presentateurId !== moi) {
      setTimeout(() => dire({ t: "reaction", genre: ["rire", "bravo", "malaise", "quoi"][Math.floor(Math.random() * 4)] }), 1500 + Math.random() * 3000);
      if (m.presentation.peutPieger && Math.random() < 0.4) setTimeout(() => dire({ t: "piege", choix: 0 }), 2500);
    }
    if (m.phase === "vote") {
      const libre = (interdit) => m.vote.exposes.find((e) => !e[interdit])?.index;
      setTimeout(() => {
        if (m.mode === "relais") return dire({ t: "vote", categorie: "moment", index: libre("interditMoment") });
        dire({ t: "vote", categorie: "orateur", index: libre("interditOrateur") });
        dire({ t: "vote", categorie: "slides", index: libre("interditSlides") });
      }, 3000 + n * 1500);
    }
  });
  ws.on("close", () => process.exit(0));
}
