// L'image souvenir : la diapo de la soirée redessinée sur un canvas, avec qui parlait et qui écrivait,
// pour qu'on puisse la poster. Le dessin reprend les cinq gabarits de style.css, en plus simple.

const L = 1200; // largeur de l'image
const H = 800; // hauteur de la diapo (3:2)
const BANDE = 120; // bandeau du bas
const C = { jaune: "#f5b301", rouge: "#c42e19", bleu: "#1c3fa8", vert: "#0e6b4d", noir: "#151210", lumiere: "#fbf7ec", encre: "#1b1714", salle: "#12100e" };
const TITRE = '"Caprasimo", Georgia, serif';
const TEXTE = '"Archivo", Arial, sans-serif';

// Coupe un texte en lignes qui tiennent dans `largeur` avec la police courante du contexte.
function lignes(ctx, texte, largeur) {
  const resultat = [];
  let ligne = "";
  for (const mot of texte.split(" ")) {
    const essai = ligne ? `${ligne} ${mot}` : mot;
    if (ligne && ctx.measureText(essai).width > largeur) {
      resultat.push(ligne);
      ligne = mot;
    } else ligne = essai;
  }
  if (ligne) resultat.push(ligne);
  return resultat;
}

// Écrit un bloc de texte et renvoie l'ordonnée sous sa dernière ligne.
function bloc(ctx, texte, { x, y, largeur, police, taille, couleur, interligne = 1.12, alignement = "left" }) {
  ctx.font = `${police.replace("TAILLE", `${taille}px`)}`;
  ctx.fillStyle = couleur;
  ctx.textAlign = alignement;
  ctx.textBaseline = "top";
  for (const ligne of lignes(ctx, texte, largeur)) {
    ctx.fillText(ligne, x, y);
    y += taille * interligne;
  }
  return y;
}

const hauteurBloc = (ctx, texte, largeur, police, taille, interligne = 1.12) => {
  ctx.font = police.replace("TAILLE", `${taille}px`);
  return lignes(ctx, texte, largeur).length * taille * interligne;
};

const selonLongueur = (texte, court, moyen, long) => (texte.length <= 16 ? court : texte.length <= 42 ? moyen : long);
const GRAS = `800 TAILLE ${TEXTE}`;
const DEMI = `600 TAILLE ${TEXTE}`;
const GROS = `TAILLE ${TITRE}`;

function dessinerDiapo(ctx, slide) {
  const c = slide.champs;
  const marge = 84;
  const large = L - marge * 2;
  const fond = { titre: C.bleu, chiffre: C.rouge, citation: C.noir, graphique: C.jaune, liste: C.vert }[slide.gabarit];
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, L, H);

  if (slide.gabarit === "titre") {
    const t = selonLongueur(c.titre, 138, 96, 73);
    const total = hauteurBloc(ctx, c.titre, large, GRAS, t, 1.04) + (c.sousTitre ? 70 + hauteurBloc(ctx, c.sousTitre, large, `500 TAILLE ${TEXTE}`, 47) : 0);
    let y = bloc(ctx, c.titre, { x: marge, y: (H - total) / 2, largeur: large, police: GRAS, taille: t, couleur: C.jaune, interligne: 1.04 });
    if (c.sousTitre) {
      ctx.font = `500 47px ${TEXTE}`;
      const trait = Math.min(large, Math.max(...lignes(ctx, c.sousTitre, large).map((l) => ctx.measureText(l).width)));
      ctx.fillStyle = C.jaune;
      ctx.fillRect(marge, y + 26, trait, 7);
      bloc(ctx, c.sousTitre, { x: marge, y: y + 54, largeur: large, police: `500 TAILLE ${TEXTE}`, taille: 47, couleur: "#e3e9ff" });
    }
  } else if (slide.gabarit === "chiffre") {
    const nombre = c.nombre || "?";
    const t = nombre.length <= 4 ? 370 : 204;
    const total = t + (c.legende ? 20 + hauteurBloc(ctx, c.legende, large * 0.86, DEMI, 54) : 0);
    const y = bloc(ctx, nombre, { x: L / 2, y: (H - total) / 2, largeur: L, police: GROS, taille: t, couleur: C.lumiere, interligne: 1, alignement: "center" });
    if (c.legende) bloc(ctx, c.legende, { x: L / 2, y: y + 20, largeur: large * 0.86, police: DEMI, taille: 54, couleur: C.lumiere, alignement: "center" });
  } else if (slide.gabarit === "citation") {
    ctx.font = `180px ${TITRE}`;
    ctx.fillStyle = C.jaune;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("«", 78, 10);
    const t = selonLongueur(c.phrase, 100, 77, 56);
    const total = hauteurBloc(ctx, c.phrase, large, GROS, t, 1.1) + (c.auteur ? 72 : 0);
    const y = bloc(ctx, c.phrase, { x: marge, y: 160 + Math.max(0, (H - 160 - 64 - total) / 2), largeur: large, police: GROS, taille: t, couleur: C.lumiere, interligne: 1.1 });
    if (c.auteur) bloc(ctx, c.auteur.toUpperCase(), { x: marge, y: y + 30, largeur: large, police: DEMI, taille: 40, couleur: "#cfc5b3" });
  } else if (slide.gabarit === "graphique") {
    let y = 64;
    if (c.titre) y = bloc(ctx, c.titre, { x: marge, y, largeur: large, police: GRAS, taille: 67, couleur: C.encre, interligne: 1.05 }) + 24;
    const bas = H - 64 - 62;
    const ecart = 60;
    const largeurBarre = (large - ecart * 2) / 3;
    c.valeurs.forEach((v, i) => {
      const x = marge + i * (largeurBarre + ecart);
      const haut = ((bas - y) * v) / 100;
      ctx.fillStyle = C.encre;
      ctx.beginPath();
      ctx.roundRect(x, bas - haut, largeurBarre, haut, [10, 10, 0, 0]);
      ctx.fill();
      bloc(ctx, c.libelles[i] ?? "", { x: x + largeurBarre / 2, y: bas + 16, largeur: largeurBarre, police: `700 TAILLE ${TEXTE}`, taille: 42, couleur: C.encre, alignement: "center" });
    });
  } else {
    const points = c.points.filter(Boolean);
    const hauteurPoints = points.reduce((n, p) => n + hauteurBloc(ctx, p, large - 72, DEMI, 54) + 22, 0);
    const total = (c.titre ? hauteurBloc(ctx, c.titre, large, GRAS, 74, 1.05) + 40 : 0) + hauteurPoints;
    let y = (H - total) / 2;
    if (c.titre) y = bloc(ctx, c.titre, { x: marge, y, largeur: large, police: GRAS, taille: 74, couleur: C.jaune, interligne: 1.05 }) + 40;
    for (const p of points) {
      ctx.fillStyle = C.jaune;
      ctx.fillRect(marge, y + 16, 31, 31);
      y = bloc(ctx, p, { x: marge + 72, y, largeur: large - 72, police: DEMI, taille: 54, couleur: C.lumiere }) + 22;
    }
  }

  // Le vignettage du projecteur.
  const ombre = ctx.createRadialGradient(L / 2, H / 2, H * 0.45, L / 2, H / 2, L * 0.72);
  ombre.addColorStop(0, "rgba(0,0,0,0)");
  ombre.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = ombre;
  ctx.fillRect(0, 0, L, H);
}

export async function enregistrerSouvenir({ slide, titre, orateur, auteur }) {
  await Promise.all([document.fonts.load(`40px ${TITRE}`), document.fonts.load(`800 40px ${TEXTE}`), document.fonts.load(`600 40px ${TEXTE}`)]);
  const canvas = Object.assign(document.createElement("canvas"), { width: L, height: H + BANDE });
  const ctx = canvas.getContext("2d");
  dessinerDiapo(ctx, slide);

  ctx.fillStyle = C.salle;
  ctx.fillRect(0, H, L, BANDE);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = `44px ${TITRE}`;
  ctx.fillStyle = C.jaune;
  ctx.fillText("Diapo Surprise", 48, H + BANDE / 2 + 2);
  const gauche = 48 + ctx.measureText("Diapo Surprise").width + 48;
  ctx.textAlign = "right";
  ctx.fillStyle = "#f1ebdd";
  ctx.font = `700 30px ${TEXTE}`;
  ctx.fillText(`${orateur} présentait, ${auteur} avait écrit`, L - 48, H + 42);
  ctx.fillStyle = "#b9ae9a";
  ctx.font = `500 26px ${TEXTE}`;
  let sujet = `« ${titre} »`;
  while (ctx.measureText(sujet).width > L - 48 - gauche && sujet.length > 8) sujet = `${sujet.slice(0, -3).trimEnd()}…»`;
  ctx.fillText(sujet, L - 48, H + 82);

  const image = await new Promise((ok, echec) => canvas.toBlob((b) => (b ? ok(b) : echec(new Error("image vide"))), "image/png"));
  const lien = Object.assign(document.createElement("a"), { href: URL.createObjectURL(image), download: "diapo-surprise.png" });
  lien.click();
  setTimeout(() => URL.revokeObjectURL(lien.href), 5000);
}
