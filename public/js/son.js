// Tous les sons du jeu, synthétisés dans le navigateur : aucun fichier audio à charger.
// Le contexte audio n'est créé qu'au premier geste du joueur, comme l'exigent les navigateurs.

let ctx = null;
let actif = localStorage.getItem("diapo-surprise:son") !== "non";
let derniereReaction = 0;

const reveiller = () => {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
};
addEventListener("pointerdown", reveiller);
addEventListener("keydown", reveiller);

export const sonActif = () => actif;
export function basculerSon() {
  actif = !actif;
  localStorage.setItem("diapo-surprise:son", actif ? "oui" : "non");
  return actif;
}
const pret = () => actif && ctx?.state === "running";

// Un souffle de bruit filtré : clics, claquements de mains, roulement.
function bruit(quand, duree, { frequence = 1200, volume = 0.3, type = "bandpass" } = {}) {
  const tampon = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duree), ctx.sampleRate);
  const donnees = tampon.getChannelData(0);
  for (let i = 0; i < donnees.length; i++) donnees[i] = (Math.random() * 2 - 1) * (1 - i / donnees.length) ** 3;
  const source = ctx.createBufferSource();
  source.buffer = tampon;
  const filtre = ctx.createBiquadFilter();
  filtre.type = type;
  filtre.frequency.value = frequence;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(filtre).connect(gain).connect(ctx.destination);
  source.start(ctx.currentTime + quand);
}

// Une note avec une attaque nette et une extinction douce ; `vers` la fait glisser vers une autre hauteur.
function note(quand, frequence, duree, { forme = "triangle", volume = 0.12, vers = null } = {}) {
  const t = ctx.currentTime + quand;
  const osc = ctx.createOscillator();
  osc.type = forme;
  osc.frequency.setValueAtTime(frequence, t);
  if (vers) osc.frequency.exponentialRampToValueAtTime(vers, t + duree);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duree + 0.02);
}

const REACTIONS = {
  // Trois « ha » qui descendent.
  rire: () => [0, 0.11, 0.22].forEach((t, i) => note(t, 620 - i * 70, 0.09, { volume: 0.1 })),
  // Deux claquements de mains.
  bravo: () => [0, 0.13].forEach((t) => bruit(t, 0.05, { frequence: 1900, volume: 0.32 })),
  // Un trombone triste.
  malaise: () => note(0, 300, 0.45, { forme: "sawtooth", volume: 0.05, vers: 150 }),
  // Une interrogation qui monte.
  quoi: () => note(0, 330, 0.22, { volume: 0.1, vers: 560 }),
};

export const sons = {
  clicClac() {
    if (!pret()) return;
    bruit(0, 0.05, { frequence: 900, volume: 0.5 });
    bruit(0.11, 0.05, { frequence: 1700, volume: 0.35 });
  },
  // Les cinq dernières secondes : un tic de plus en plus aigu.
  tic(reste) {
    if (!pret()) return;
    note(0, reste <= 1 ? 1320 : 990 - reste * 40, 0.07, { forme: "square", volume: 0.035 });
  },
  reaction(genre) {
    if (!pret() || performance.now() - derniereReaction < 110) return;
    derniereReaction = performance.now();
    REACTIONS[genre]?.();
  },
  applaudissements(duree = 1.8) {
    if (!pret()) return;
    for (let i = 0; i < 46; i++) {
      const t = Math.random() * duree;
      bruit(t, 0.05, { frequence: 1500 + Math.random() * 900, volume: 0.1 * (1 - t / duree) + 0.03 });
    }
  },
  // Le roulement de tambour avant le classement.
  roulement(duree = 1.6) {
    if (!pret()) return;
    for (let t = 0; t < duree; t += 0.045) bruit(t, 0.05, { frequence: 220, volume: 0.1 + 0.22 * (t / duree), type: "lowpass" });
  },
  fanfare(quand = 0) {
    if (!pret()) return;
    [523, 659, 784].forEach((f, i) => note(quand + i * 0.11, f, 0.16, { forme: "square", volume: 0.05 }));
    note(quand + 0.33, 1047, 0.7, { forme: "square", volume: 0.06 });
    note(quand + 0.33, 523, 0.7, { volume: 0.1 });
  },
  // Deux notes pour une annonce (nouvelle manche, vote).
  annonce() {
    if (!pret()) return;
    note(0, 392, 0.14, { volume: 0.1 });
    note(0.13, 587, 0.3, { volume: 0.1 });
  },
  // La révélation de l'auteur.
  pop() {
    if (!pret()) return;
    note(0, 520, 0.16, { volume: 0.12, vers: 1040 });
    bruit(0.02, 0.04, { frequence: 2400, volume: 0.12 });
  },
};
