// Une diapositive : son rendu projeté, et sa version éditable sur la table lumineuse.
// Les deux partagent les mêmes classes pour que l'auteur voie exactement ce qui sera projeté.

export const GABARITS = [
  { id: "titre", nom: "Titre" },
  { id: "chiffre", nom: "Chiffre choc" },
  { id: "citation", nom: "Citation" },
  { id: "graphique", nom: "Graphique" },
  { id: "liste", nom: "Liste" },
];

export const champsVides = (gabarit) =>
  ({
    titre: { titre: "", sousTitre: "" },
    chiffre: { nombre: "", legende: "" },
    citation: { phrase: "", auteur: "" },
    graphique: { titre: "", libelles: ["", "", ""], valeurs: [30, 60, 90] },
    liste: { titre: "", points: ["", "", ""] },
  })[gabarit];

export function h(balise, attributs = {}, ...enfants) {
  const el = document.createElement(balise);
  for (const [cle, valeur] of Object.entries(attributs)) {
    if (valeur === false || valeur == null) continue;
    if (cle === "class") el.className = valeur;
    else if (cle === "style") el.style.cssText = valeur;
    else if (cle.startsWith("on")) el.addEventListener(cle.slice(2), valeur);
    else el.setAttribute(cle, valeur === true ? "" : valeur);
  }
  el.append(...enfants.flat().filter((e) => e != null && e !== false));
  return el;
}

// Un texte court s'affiche plus gros : la diapo reste pleine sans jamais déborder.
const taille = (texte) => (texte.length <= 16 ? "court" : texte.length <= 42 ? "moyen" : "long");

export function rendreDiapo(slide) {
  const c = slide.champs;
  const corps = {
    titre: () => [
      h("p", { class: "d-titre", "data-taille": taille(c.titre) }, c.titre),
      c.sousTitre && h("p", { class: "d-sous" }, c.sousTitre),
    ],
    chiffre: () => [
      h("p", { class: "d-nombre", "data-taille": c.nombre.length <= 4 ? "court" : "long" }, c.nombre || "?"),
      c.legende && h("p", { class: "d-legende" }, c.legende),
    ],
    citation: () => [
      h("p", { class: "d-phrase", "data-taille": taille(c.phrase) }, c.phrase),
      c.auteur && h("p", { class: "d-auteur" }, c.auteur),
    ],
    graphique: () => [
      c.titre && h("p", { class: "d-titre-graphique" }, c.titre),
      h(
        "div",
        { class: "d-barres" },
        c.valeurs.map((v, i) =>
          h("div", { class: "d-barre", style: `--v:${v}` }, h("span", { class: "d-colonne" }), h("span", { class: "d-libelle" }, c.libelles[i]))
        )
      ),
    ],
    liste: () => [
      c.titre && h("p", { class: "d-titre-liste" }, c.titre),
      h("ul", { class: "d-points" }, c.points.filter(Boolean).map((p) => h("li", {}, p))),
    ],
  }[slide.gabarit]();
  return h("div", { class: `diapo diapo--${slide.gabarit}` }, corps);
}

// Zone de saisie qui grandit avec son texte et refuse les retours à la ligne.
function saisie({ classe, valeur, indice, max, nom, surSaisie, tailleAuto }) {
  const el = h("textarea", { class: `${classe} d-saisie`, rows: 1, maxlength: max, placeholder: indice, "aria-label": nom, spellcheck: "false" });
  el.value = valeur;
  const ajuster = () => {
    if (tailleAuto) el.dataset.taille = tailleAuto(el.value);
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  el.addEventListener("keydown", (e) => e.key === "Enter" && e.preventDefault());
  el.addEventListener("input", () => {
    el.value = el.value.replace(/\n/g, " ");
    ajuster();
    surSaisie(el.value);
  });
  requestAnimationFrame(ajuster);
  new ResizeObserver(ajuster).observe(el);
  return el;
}

export function rendreEditeur(slide, surChangement) {
  const c = slide.champs;
  const champ = (cle, options) => saisie({ valeur: c[cle], surSaisie: (v) => ((c[cle] = v), surChangement()), ...options });
  const champListe = (cle, i, options) => saisie({ valeur: c[cle][i], surSaisie: (v) => ((c[cle][i] = v), surChangement()), ...options });

  const corps = {
    titre: () => [
      champ("titre", { classe: "d-titre", indice: "Un grand titre", max: 70, nom: "Titre de la diapo", tailleAuto: taille }),
      champ("sousTitre", { classe: "d-sous", indice: "Un sous-titre, si tu veux", max: 90, nom: "Sous-titre" }),
    ],
    chiffre: () => [
      champ("nombre", { classe: "d-nombre", indice: "87 %", max: 9, nom: "Chiffre", tailleAuto: (v) => (v.length <= 4 ? "court" : "long") }),
      champ("legende", { classe: "d-legende", indice: "Ce que ce chiffre prouve", max: 90, nom: "Légende du chiffre" }),
    ],
    citation: () => [
      champ("phrase", { classe: "d-phrase", indice: "Une phrase que personne n'a dite", max: 140, nom: "Citation", tailleAuto: taille }),
      champ("auteur", { classe: "d-auteur", indice: "Son prétendu auteur", max: 40, nom: "Auteur de la citation" }),
    ],
    graphique: () => [
      champ("titre", { classe: "d-titre-graphique", indice: "Ce que montre ce graphique", max: 60, nom: "Titre du graphique" }),
      h(
        "div",
        { class: "d-barres" },
        [0, 1, 2].map((i) => {
          const barre = h("div", { class: "d-barre", style: `--v:${c.valeurs[i]}` }, h("span", { class: "d-colonne" }));
          const curseur = h("input", { class: "d-curseur", type: "range", min: 4, max: 100, value: c.valeurs[i], "aria-label": `Hauteur de la barre ${i + 1}` });
          curseur.addEventListener("input", () => {
            c.valeurs[i] = Number(curseur.value);
            barre.style.setProperty("--v", curseur.value);
            surChangement();
          });
          barre.append(curseur, champListe("libelles", i, { classe: "d-libelle", indice: `Barre ${i + 1}`, max: 22, nom: `Nom de la barre ${i + 1}` }));
          return barre;
        })
      ),
    ],
    liste: () => [
      champ("titre", { classe: "d-titre-liste", indice: "Titre de la liste", max: 60, nom: "Titre de la liste" }),
      h(
        "ul",
        { class: "d-points" },
        [0, 1, 2].map((i) => h("li", {}, champListe("points", i, { classe: "d-point", indice: ["Premier point", "Deuxième point", "Troisième point"][i], max: 60, nom: `Point ${i + 1}` })))
      ),
    ],
  }[slide.gabarit]();
  return h("div", { class: `diapo diapo--${slide.gabarit} diapo--edition` }, corps);
}

export const diapoVide = (slide) =>
  Object.entries(slide.champs).every(([cle, v]) => cle === "valeurs" || (Array.isArray(v) ? v.every((x) => !x) : !v));
