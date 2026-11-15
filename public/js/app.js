import { session, sur, dire, maintenant, creerSalon, rejoindreSalon, nomMemorise } from "./reseau.js";
import { h, GABARITS, champsVides, rendreDiapo, rendreEditeur, diapoVide } from "./diapo.js";
import { inspirer } from "./inspiration.js";
import { enregistrerSouvenir } from "./souvenir.js";
import { sons, sonActif, basculerSon } from "./son.js";

const scene = document.getElementById("scene");
const COULEURS = ["#e2412b", "#f08a1c", "#f5c518", "#3aa655", "#1fa3a3", "#3b6fe0", "#8a55d6", "#e85c9c"];
const MOIS = ["JANV", "FÉVR", "MARS", "AVR", "MAI", "JUIN", "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"];
const TAMPON = `${MOIS[new Date().getMonth()]} ${String(new Date().getFullYear()).slice(2)}`;

const joueur = (etat, id) => etat.joueurs.find((j) => j.id === id) ?? { nom: "Quelqu'un", place: 0 };
const couleur = (j) => COULEURS[j.place % COULEURS.length];
const copie = (x) => JSON.parse(JSON.stringify(x));

/* ---------- Son ---------- */

const clicClac = () => sons.clicClac();
const boutonSon = document.querySelector(".son");
boutonSon.setAttribute("aria-pressed", sonActif());
boutonSon.addEventListener("click", () => {
  boutonSon.setAttribute("aria-pressed", basculerSon());
  clicClac();
});

/* ---------- Petits mots : erreurs et informations ---------- */

const mots = document.querySelector(".mots");
function petitMot(texte, duree = 4500) {
  const el = h("p", { class: "mot" }, texte);
  mots.append(el);
  setTimeout(() => el.remove(), duree);
}
sur("erreur", (texte) => petitMot(texte));

// Une annonce qui traverse l'écran : nouvelle manche, ouverture du vote.
function annonce(titre, sous) {
  document.querySelector(".annonce")?.remove();
  const el = h("div", { class: "annonce", role: "status" }, h("p", { class: "annonce-titre" }, titre), sous && h("p", { class: "annonce-sous" }, sous));
  document.body.append(el);
  sons.annonce();
  setTimeout(() => el.remove(), 2300);
}
sur("lien", (ok) => (document.body.dataset.lien = ok ? "ok" : "perdu"));

/* ---------- Composants ---------- */

// Un cache de diapositive : carton blanc, fenêtre, étiquette au feutre, tampon, pastille.
function cache({ etiquette, contenu, pastille, numero, classe = "", balise = "div", ...attributs }) {
  return h(
    balise,
    { class: `cache ${classe}`, style: pastille ? `--pastille:${pastille}` : null, ...attributs },
    h("span", { class: "cache-etiquette" }, etiquette ?? ""),
    h("span", { class: "cache-fenetre" }, contenu),
    pastille && h("span", { class: "cache-pastille" }),
    h("span", { class: "cache-tampon" }, numero != null ? `${TAMPON} · ${numero}` : TAMPON)
  );
}

// La minuterie mécanique : un repère fait le tour du cadran, seconde par seconde.
function minuterie() {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("aria-hidden", "true");
  let traits = "";
  for (let i = 0; i < 60; i++) {
    const long = i % 5 === 0;
    traits += `<line x1="50" y1="${long ? 7 : 9}" x2="50" y2="13" transform="rotate(${i * 6} 50 50)" class="${long ? "trait-long" : "trait"}"/>`;
  }
  svg.innerHTML = `<circle cx="50" cy="50" r="48" class="cadran"/>${traits}<g class="aiguille"><path d="M50 3 L54.5 15 L45.5 15 Z"/></g><circle cx="50" cy="50" r="30" class="moyeu-cadran"/>`;
  const chiffres = h("span", { class: "minuterie-chiffres" }, "");
  const el = h("div", { class: "minuterie", role: "timer" }, svg, chiffres);
  const aiguille = svg.querySelector(".aiguille");
  let fin = 0;
  let total = 1;
  let affiche = -1;
  return {
    el,
    regler(finA) {
      if (finA === fin) return;
      fin = finA;
      total = Math.max(1000, Math.ceil((fin - maintenant()) / 1000) * 1000);
      affiche = -1;
    },
    tic() {
      const reste = Math.max(0, Math.ceil((fin - maintenant()) / 1000));
      if (reste === affiche) return;
      affiche = reste;
      chiffres.textContent = reste >= 60 ? `${Math.floor(reste / 60)}:${String(reste % 60).padStart(2, "0")}` : reste;
      aiguille.style.transform = `rotate(${(1 - (reste * 1000) / total) * 360}deg)`;
      el.classList.toggle("minuterie--urgence", reste <= 5 && fin > 0);
      if (reste <= 5 && reste > 0 && fin > 0) {
        sons.tic(reste);
        chiffres.style.animation = "none";
        void chiffres.offsetWidth;
        chiffres.style.animation = "pouls 0.45s var(--sortie)";
      }
      el.setAttribute("aria-label", `${reste} secondes restantes`);
    },
  };
}

// L'applaudimètre : un vumètre dont l'aiguille monte avec les réactions du public.
function applaudimetre() {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 120 72");
  svg.setAttribute("aria-hidden", "true");
  let traits = "";
  for (let i = 0; i <= 14; i++) {
    const angle = -70 + i * 10;
    traits += `<line x1="60" y1="${i % 2 ? 13 : 10}" x2="60" y2="17" transform="rotate(${angle} 60 64)" class="${i >= 11 ? "trait-chaud" : "trait-long"}"/>`;
  }
  svg.innerHTML = `<path d="M4 64 A56 56 0 0 1 116 64 Z" class="cadran"/>${traits}<g class="aiguille-vu"><line x1="60" y1="64" x2="60" y2="14"/></g><circle cx="60" cy="64" r="5" class="pivot"/>`;
  const valeur = h("span", { class: "applaudimetre-valeur" }, "");
  const el = h("div", { class: "applaudimetre" }, svg, h("span", { class: "applaudimetre-nom" }, "Applaudimètre : 10 points par réaction"), valeur);
  const aiguille = svg.querySelector(".aiguille-vu");
  let max = 1;
  return {
    el,
    regler(n, plafond = max) {
      max = plafond;
      aiguille.style.transform = `rotate(${-70 + 140 * Math.min(1, n / max)}deg)`;
      valeur.textContent = n ? `+${n * 10} points` : "";
      el.setAttribute("aria-label", `Applaudimètre : ${n} réactions`);
    },
  };
}

const texteImprevu = (imprevu) =>
  !imprevu
    ? ""
    : imprevu.type === "finale"
      ? "Manche finale : tout compte double, et chaque diapo ne dure que 12 secondes."
      : imprevu.type === "echange"
        ? "Imprévu : les diapos ont été échangées. Personne ne présente celle qu'on lui destinait."
        : `Imprévu de la manche : ${imprevu.texte.charAt(0).toLowerCase()}${imprevu.texte.slice(1)}.`;

/* ---------- Accueil ---------- */

const EXEMPLE = [
  { carton: ["Camille présente", "Pourquoi les pigeons sont des agents du fisc"] },
  { gabarit: "chiffre", champs: { nombre: "87 %", legende: "des pigeons vous regardent remplir votre déclaration" } },
  { gabarit: "graphique", champs: { titre: "Qui vous surveille le plus", libelles: ["Le fisc", "Votre mère", "Les pigeons"], valeurs: [34, 61, 96] } },
  { gabarit: "citation", champs: { phrase: "Un pigeon ne roucoule pas. Il rédige un rapport.", auteur: "Un contrôleur, sous couvert d'anonymat" } },
];

const carton = ([petit, grand]) => h("div", { class: "diapo diapo--carton" }, h("p", { class: "d-carton-petit" }, petit), h("p", { class: "d-carton-grand" }, grand));

// Change l'image projetée avec l'obturateur, la mise au point et le clic-clac.
function projeter(ecran, contenu, { son = true } = {}) {
  const image = ecran.querySelector(".ecran-image");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    image.replaceChildren(contenu);
    return;
  }
  ecran.classList.remove("ecran--net");
  ecran.classList.add("ecran--obture");
  if (son) clicClac();
  setTimeout(() => {
    image.replaceChildren(contenu);
    ecran.classList.remove("ecran--obture");
    void ecran.offsetWidth;
    ecran.classList.add("ecran--net");
  }, 170);
}

const ecranProjection = (...enfants) => h("div", { class: "ecran" }, h("div", { class: "ecran-image" }), h("div", { class: "ecran-poussiere", "aria-hidden": "true" }), ...enfants);

function ecranAccueil() {
  const codeLien = location.pathname.match(/^\/s\/([A-Za-z]{4})\/?$/)?.[1]?.toUpperCase() ?? null;
  const ecran = ecranProjection();
  ecran.querySelector(".ecran-image").append(carton(EXEMPLE[0].carton));
  let vue = 0;
  const boucle = setInterval(() => {
    vue = (vue + 1) % EXEMPLE.length;
    const e = EXEMPLE[vue];
    projeter(ecran, e.carton ? carton(e.carton) : rendreDiapo(e), { son: false });
  }, 3800);

  const nom = h("input", { class: "cache-nom", id: "nom", name: "nom", maxlength: 16, autocomplete: "nickname", placeholder: "Ton prénom", value: nomMemorise(), required: true, spellcheck: "false" });
  const code = h("input", { class: "code-saisie", id: "code", name: "code", maxlength: 4, autocomplete: "off", placeholder: "ABCD", "aria-label": "Code du salon", spellcheck: "false" });
  code.addEventListener("input", () => (code.value = code.value.toUpperCase().replace(/[^A-Z]/g, "")));

  const exigerNom = () => {
    if (nom.value.trim()) return nom.value.trim();
    nom.focus();
    petitMot("Écris d'abord ton prénom sur la diapo.");
    return null;
  };
  const formulaire = h(
    "form",
    {
      class: "entree",
      onsubmit: (e) => {
        e.preventDefault();
        const n = exigerNom();
        if (!n) return;
        if (codeLien) rejoindreSalon(codeLien, n);
        else if (e.submitter?.value === "rejoindre") {
          if (code.value.length !== 4) {
            code.focus();
            return petitMot("Le code d'un salon fait quatre lettres.");
          }
          rejoindreSalon(code.value, n);
        } else creerSalon(n);
      },
    },
    h(
      "div",
      { class: "cache cache--entree", style: `--pastille:${COULEURS[2]}` },
      h("label", { class: "cache-etiquette", for: "nom" }, h("span", { class: "visuellement-cache" }, "Ton prénom"), nom),
      h("button", { class: "cache-fenetre cache-action", type: "submit", value: "creer" }, codeLien ? `Entrer dans le salon ${codeLien}` : "Créer un salon"),
      h("span", { class: "cache-pastille" }),
      h("span", { class: "cache-tampon" }, TAMPON)
    ),
    !codeLien &&
      h("div", { class: "rejoindre" }, h("label", { for: "code" }, "Tu as un code ?"), code, h("button", { class: "bouton bouton--discret", type: "submit", value: "rejoindre" }, "Rejoindre"))
  );

  const etapes = [
    { texte: "Un sujet tombe pour toute la salle. Tu écris une diapo pour quelqu'un d'autre, qui ne la verra pas avant de parler.", slide: { gabarit: "titre", champs: { titre: "Le rond-point, chef-d'œuvre incompris", sousTitre: "Une conférence que personne n'a demandée" } } },
    { texte: "La conférence se donne en relais : chacun présente à voix haute la diapo qu'il découvre, puis passe la parole.", slide: { gabarit: "liste", champs: { titre: "Trois raisons d'y croire", points: ["On tourne en rond", "Mais on avance", "Sortie numéro trois"] } } },
    { texte: "On vote pour le meilleur moment, et on recommence avec un autre sujet. Celui qui écrit marque autant que celui qui parle.", slide: { gabarit: "chiffre", champs: { nombre: "0", legende: "préparation nécessaire" } } },
  ];

  scene.append(
    h(
      "section",
      { class: "accueil" },
      h("div", { class: "accueil-ecran" }, ecran, h("p", { class: "legende-feutre" }, "Une conférence d'exemple. Les vôtres seront pires.")),
      h("div", { class: "accueil-texte" }, h("h1", {}, "Tes potes écrivent tes diapos. Tu les découvres en les présentant."), h("p", {}, "Un jeu d'improvisation pour 2 à 8 joueurs, à jouer en vocal ou dans la même pièce. Sans compte, sans installation.")),
      formulaire
    ),
    h(
      "section",
      { class: "regles" },
      h("h2", {}, "Trois manches, dix minutes"),
      h(
        "ol",
        { class: "regles-table" },
        etapes.map((e, i) => h("li", {}, cache({ contenu: rendreDiapo(e.slide), numero: i + 1, classe: "cache--pose" }), h("p", {}, e.texte)))
      )
    ),
    h("footer", { class: "pied" }, h("p", {}, "Diapo Surprise ne capte ni micro ni caméra : vous parlez là où vous parlez déjà."))
  );
  if (!nom.value) nom.focus({ preventScroll: true });

  return { maj() {}, demonter: () => clearInterval(boucle) };
}

/* ---------- Salon : le carrousel ---------- */

function ecranSalon() {
  const places = h("ol", { class: "places" });
  const codeEl = h("strong", { class: "moyeu-code" });
  const lien = h("button", { class: "bouton bouton--discret", type: "button" }, "Copier le lien");
  lien.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/s/${session.code}`);
      lien.textContent = "Lien copié";
    } catch {
      lien.textContent = `${location.host}/s/${session.code}`;
    }
    setTimeout(() => (lien.textContent = "Copier le lien"), 2200);
  });
  const reglages = h("div", { class: "reglages" });
  const REGLAGES = {
    mode: {
      nom: "Format",
      choix: [["relais", "Relais"], ["long", "Version longue"]],
      aide: { relais: "Un sujet commun, une diapo chacun, trois manches rapides.", long: "Trois diapos chacun, un exposé complet par joueur." },
    },
    pack: {
      nom: "Sujets",
      choix: [["absurde", "Absurde"], ["genant", "Gênant"], ["noir", "Humour noir"]],
      aide: { absurde: "Des sujets sans queue ni tête.", genant: "Mauvaises nouvelles à annoncer, causes indéfendables.", noir: "Mort, héritage, ruptures. À réserver à ceux qui en rient." },
    },
    ecritureRelaisSecondes: { nom: "Temps pour écrire", choix: [[45, "45 s"], [60, "1 min"], [90, "1 min 30"]] },
    ecritureSecondes: { nom: "Temps pour écrire", choix: [[90, "1 min 30"], [120, "2 min"], [180, "3 min"]] },
  };
  const groupe = (cle, etat, hote) => {
    const r = REGLAGES[cle];
    return h(
      "div",
      { class: "reglage" },
      h("span", { class: "reglage-nom" }, r.nom),
      h(
        "div",
        { class: "durees", role: "radiogroup", "aria-label": r.nom },
        r.choix.map(([valeur, nom]) =>
          h("button", { type: "button", role: "radio", "aria-checked": String(etat[cle] === valeur), disabled: !hote, onclick: () => dire({ t: "reglage", cle, valeur }) }, nom)
        )
      ),
      r.aide && h("span", { class: "reglage-aide" }, r.aide[etat[cle]])
    );
  };
  const lancer = h("button", { class: "bouton bouton--principal", type: "button", onclick: () => dire({ t: "lancer" }) }, "Lancer la partie");
  const attente = h("p", { class: "salon-attente" });
  const regard = h("button", { class: "bouton bouton--discret", type: "button" });
  regard.addEventListener("click", () => dire({ t: "regarder", oui: !session.etat.moi.spectateur }));
  const titre = h("h1", {});

  scene.append(
    h(
      "section",
      { class: "salon" },
      h(
        "div",
        { class: "carrousel" },
        h("div", { class: "plateau", "aria-hidden": "true" }),
        places,
        h("div", { class: "moyeu" }, h("span", { class: "moyeu-libelle" }, "Salon"), codeEl, lien)
      ),
      h(
        "div",
        { class: "salon-cote" },
        titre,
        h("p", {}, "Envoie le lien à tes potes. Chacun glisse sa diapo dans le carrousel, puis on éteint la lumière."),
        reglages,
        lancer,
        attente,
        regard
      )
    )
  );

  let dernier = "";
  return {
    maj(etat) {
      const hote = etat.hoteId === etat.moi.id;
      const cle = JSON.stringify([etat.joueurs.map((j) => [j.id, j.connecte, j.spectateur]), etat.hoteId]);
      codeEl.textContent = etat.code;
      if (cle !== dernier) {
        const anciens = new Set([...places.querySelectorAll("[data-id]")].map((el) => el.dataset.id));
        places.replaceChildren(
          ...[0, 1, 2, 3, 4, 5, 6, 7].map((n) => {
            const j = etat.joueurs.find((x) => x.place === n);
            if (!j) return h("li", { class: "place place--libre", style: `--i:${n}` }, h("span", { class: "place-numero" }, n + 1));
            return h(
              "li",
              { class: `place ${anciens.has(j.id) || !dernier ? "" : "place--arrive"}`, style: `--i:${n}`, "data-id": j.id },
              cache({
                etiquette: j.nom,
                pastille: couleur(j),
                numero: n + 1,
                classe: `cache--joueur ${j.connecte ? "" : "cache--eteint"}`,
                contenu: h("span", { class: `gelatine ${j.spectateur ? "gelatine--long" : ""}` }, j.spectateur ? "regarde" : j.id === etat.hoteId ? "hôte" : j.id === etat.moi.id ? "toi" : ""),
              })
            );
          })
        );
        if (dernier && etat.joueurs.length > anciens.size) clicClac();
        dernier = cle;
      }
      const n = etat.joueurs.filter((j) => !j.spectateur).length;
      regard.textContent = etat.moi.spectateur ? "Finalement, je joue" : "Je préfère regarder";
      titre.textContent = etat.joueurs.length === 1 ? "Le carrousel est vide. Invite du monde." : `${etat.joueurs.length} diapos dans le carrousel.`;
      const cleReglages = JSON.stringify([etat.mode, etat.pack, etat.ecritureSecondes, etat.ecritureRelaisSecondes, hote]);
      if (reglages.dataset.cle !== cleReglages) {
        reglages.dataset.cle = cleReglages;
        reglages.replaceChildren(groupe("mode", etat, hote), groupe("pack", etat, hote), groupe(etat.mode === "relais" ? "ecritureRelaisSecondes" : "ecritureSecondes", etat, hote));
      }
      lancer.hidden = !hote;
      lancer.disabled = n < 2;
      attente.textContent = hote
        ? n < 2
          ? etat.joueurs.length < 2
            ? "Il faut être au moins deux."
            : "Il faut au moins deux joueurs qui ne font pas que regarder."
          : n < 4
            ? "Ça se joue à deux ou trois, mais le vote prend tout son sens à partir de quatre."
            : ""
        : `${joueur(etat, etat.hoteId).nom} règle et lance la partie quand tout le monde est là.`;
    },
  };
}

/* ---------- Écriture : la table lumineuse ---------- */

function ecranEcriture(etat) {
  const e = etat.ecriture;
  if (!e) {
    scene.append(
      h(
        "section",
        { class: "patience" },
        h("h1", {}, "Les autres écrivent leurs diapos."),
        h(
          "p",
          {},
          etat.moi.spectateur
            ? "Tu regardes cette partie. Dès que ça parle, réagis : chaque réaction rapporte des points à celui qui est sur scène."
            : etat.mode === "relais"
              ? "Tu es arrivé en cours de manche : tu joues la prochaine."
              : "Tu es arrivé en cours de partie : tu joueras la prochaine."
        )
      )
    );
    return { maj() {} };
  }
  const slides = copie(e.slides);
  const enRelais = etat.mode === "relais";
  const ROLES = enRelais
    ? [{ ouverture: "ouvre la conférence", suite: "enchaîne", conclusion: "conclus la conférence" }[e.role]]
    : ["plante le décor", "apporte la preuve", "conclus en beauté"];
  let courante = 0;
  let pret = e.pret;
  let envoi = null;
  let titre = e.titre;
  const chrono = minuterie();
  const cible = joueur(etat, e.pourId);

  const grande = h("div", { class: "cache-fenetre" });
  const grandCache = h("div", { class: "cache cache--grand" }, h("span", { class: "cache-etiquette" }), grande, h("span", { class: "cache-tampon" }));
  const gabarits = h("div", { class: "gabarits", role: "radiogroup", "aria-label": "Type de diapo" });
  const petites = h("ol", { class: "petites" });
  const avancement = h("ul", { class: "avancement" });
  const boutonPret = h("button", { class: "bouton bouton--principal", type: "button" });
  const boutonIdee = h("button", { class: "inspire", type: "button" }, "Inspire-moi");
  const table = h("div", { class: "table" }, grandCache, h("div", { class: "outils" }, gabarits, boutonIdee), petites);

  // Le sujet : trois propositions, ou celui que l'auteur invente.
  const sujetLibre = h("input", { type: "text", maxlength: 70, placeholder: "Ou invente la sienne", "aria-label": "Ton propre sujet de conférence", spellcheck: "false" });
  const radioLibre = h("input", { type: "radio", name: "sujet", value: "", class: "visuellement-cache" });
  if (!e.titres.includes(titre)) {
    sujetLibre.value = titre;
    radioLibre.checked = true;
  }
  const sujets = h(
    "fieldset",
    { class: "sujets" },
    h("legend", {}, enRelais ? "Le sujet de la conférence" : "Choisis sa conférence"),
    e.titres.map((t) => {
      const radio = h("input", { type: "radio", name: "sujet", value: t, class: "visuellement-cache" });
      radio.checked = t === titre;
      return h("label", { class: "sujet" }, radio, t);
    }),
    !enRelais && h("label", { class: "sujet sujet--libre" }, radioLibre, sujetLibre)
  );
  const lireSujet = () => {
    const coche = sujets.querySelector("input[type=radio]:checked");
    titre = (coche === radioLibre ? sujetLibre.value.trim() : coche?.value) || e.titres[0];
    envoyerBrouillon();
  };
  sujets.addEventListener("change", lireSujet);
  const choisirLibre = () => ((radioLibre.checked = true), lireSujet());
  sujetLibre.addEventListener("focus", choisirLibre);
  sujetLibre.addEventListener("input", choisirLibre);

  const envoyerBrouillon = () => {
    clearTimeout(envoi);
    envoi = setTimeout(() => dire({ t: "brouillon", slides, titre }), 350);
  };
  const apercu = (i) => {
    const li = petites.children[i];
    li?.querySelector(".cache-fenetre").replaceChildren(rendreDiapo(slides[i]));
    li?.classList.toggle("petite--vide", diapoVide(slides[i]));
  };
  const surChangement = () => {
    apercu(courante);
    envoyerBrouillon();
  };

  function ouvrir(i, focus = false) {
    courante = i;
    grandCache.querySelector(".cache-etiquette").textContent = enRelais ? `ta diapo : ${ROLES[i]}` : `diapo ${i + 1} : ${ROLES[i]}`;
    grandCache.querySelector(".cache-tampon").textContent = `${TAMPON} · ${i + 1}`;
    grande.replaceChildren(pret ? rendreDiapo(slides[i]) : rendreEditeur(slides[i], surChangement));
    [...petites.children].forEach((li, n) => li.firstChild.setAttribute("aria-current", String(n === i)));
    [...gabarits.children].forEach((b) => b.setAttribute("aria-checked", String(b.value === slides[i].gabarit)));
    if (focus) grande.querySelector("textarea")?.focus();
  }

  gabarits.append(
    ...GABARITS.map((g) =>
      h(
        "button",
        {
          type: "button",
          role: "radio",
          value: g.id,
          class: `gabarit gabarit--${g.id}`,
          onclick: () => {
            if (pret || slides[courante].gabarit === g.id) return;
            const ancien = slides[courante].champs;
            slides[courante] = { gabarit: g.id, champs: champsVides(g.id) };
            if ("titre" in slides[courante].champs && typeof ancien.titre === "string") slides[courante].champs.titre = ancien.titre.slice(0, 60);
            ouvrir(courante, true);
            surChangement();
          },
        },
        g.nom
      )
    )
  );
  petites.append(
    ...slides.map((s, i) =>
      h("li", {}, cache({ balise: "button", type: "button", etiquette: ["décor", "preuve", "chute"][i], numero: i + 1, contenu: rendreDiapo(s), classe: "cache--petit", "aria-label": `Diapo ${i + 1}`, onclick: () => ouvrir(i, true) }))
    )
  );
  slides.forEach((_, i) => apercu(i));
  petites.hidden = slides.length === 1;
  // Entre deux manches du relais, on annonce qui vient de gagner.
  if (etat.dernier && etat.dernier.manche === etat.manche - 1 && !pret) {
    petitMot(`Manche ${etat.dernier.manche} : ${joueur(etat, etat.dernier.presentateurId).nom} et ${joueur(etat, etat.dernier.auteurId).nom} l'emportent.`, 6000);
  }

  boutonIdee.addEventListener("click", () => {
    if (pret) return;
    inspirer(slides[courante]);
    ouvrir(courante);
    surChangement();
  });

  boutonPret.addEventListener("click", () => {
    pret = !pret;
    clearTimeout(envoi);
    dire({ t: "pret", pret, slides, titre });
    rafraichirPret();
    ouvrir(courante, !pret);
  });
  function rafraichirPret() {
    boutonPret.textContent = pret ? (enRelais ? "Reprendre ma diapo" : "Reprendre mes diapos") : "C'est prêt";
    boutonPret.classList.toggle("bouton--principal", !pret);
    table.classList.toggle("table--rangee", pret);
    gabarits.querySelectorAll("button").forEach((b) => (b.disabled = pret));
    boutonIdee.disabled = pret;
    sujets.disabled = pret;
  }

  scene.append(
    h(
      "section",
      { class: "ecriture" },
      h(
        "div",
        { class: "consigne" },
        h("h1", {}, enRelais ? "Tu écris une diapo pour " : "Tu écris les diapos de ", h("strong", { style: `--pastille:${couleur(cible)}` }, cible.nom), "."),
        h(
          "p",
          {},
          enRelais
            ? `Toute la salle donne la même conférence, en relais. ${cible.nom} passera en ${e.passage === 1 ? "premier" : `${e.passage}e`} sur ${e.total} et découvrira ta diapo en direct.`
            : `${cible.nom} les découvrira en les présentant, quinze secondes chacune. Tends-lui des perches, ou des pièges.`
        ),
        sujets,
        etat.imprevu && h("p", { class: "imprevu" }, texteImprevu(etat.imprevu))
      ),
      table,
      h("div", { class: "ecriture-cote" }, chrono.el, boutonPret, enRelais && h("p", { class: "rang" }, `Manche ${etat.manche} sur ${etat.manches}`), avancement)
    )
  );
  rafraichirPret();
  ouvrir(0, !pret);

  return {
    maj(etat) {
      chrono.regler(etat.finA);
      avancement.replaceChildren(
        ...etat.joueurs
          .filter((j) => j.enJeu && !j.spectateur)
          .map((j) =>
            h(
              "li",
              { class: etat.prets.includes(j.id) ? "avancement--pret" : "", style: `--pastille:${couleur(j)}` },
              h("span", {}, j.nom),
              h("span", {}, `${etat.manche > 1 ? `${j.score} pts · ` : ""}${etat.prets.includes(j.id) ? "a fini" : "écrit"}`)
            )
          )
      );
    },
    tic: () => chrono.tic(),
    demonter: () => clearTimeout(envoi),
  };
}

/* ---------- Présentation : la projection ---------- */

const REACTIONS = [
  { genre: "rire", bouton: "Haha", mot: "HAHA" },
  { genre: "bravo", bouton: "Bravo", mot: "BRAVO" },
  { genre: "malaise", bouton: "Aïe", mot: "AÏE…" },
  { genre: "quoi", bouton: "Quoi ?", mot: "QUOI ?" },
];

function ecranPresentation() {
  const chrono = minuterie();
  const petitsMots = h("div", { class: "billets" });
  const signature = h("p", { class: "signature", hidden: true });
  const ecran = ecranProjection(petitsMots, signature);
  const titre = h("h1", {});
  const sujet = h("p", { class: "legende-feutre" });
  const pions = h("ol", { class: "pions", "aria-label": "Avancement" });
  const rang = h("p", { class: "rang" });
  const ensuite = h("p", { class: "ensuite" });
  const imprevu = h("p", { class: "imprevu" });
  const jauge = applaudimetre();
  const passer = h("button", { class: "bouton bouton--discret", type: "button", onclick: () => dire({ t: "passer" }) }, "Passer à la suite");
  const publicEl = h("ul", { class: "public" });
  const reactions = h(
    "div",
    { class: "reactions" },
    REACTIONS.map((r) => h("button", { class: "bouton bouton--reaction", type: "button", onclick: () => dire({ t: "reaction", genre: r.genre }) }, r.bouton))
  );
  const pieges = h("div", { class: "pieges" });

  scene.append(
    h(
      "section",
      { class: "projection" },
      h("div", { class: "projection-tete" }, titre, sujet, imprevu),
      ecran,
      h("div", { class: "projection-cote" }, chrono.el, pions, rang, ensuite, jauge.el, passer),
      h("div", { class: "projection-salle" }, publicEl, reactions, pieges)
    )
  );

  const arret = sur_reaction((m) => {
    if (m.applaudi != null) jauge.regler(m.applaudi);
    const siege = publicEl.querySelector(`[data-id="${m.deId}"]`);
    const r = REACTIONS.find((x) => x.genre === m.genre);
    if (!siege || !r) return;
    sons.reaction(m.genre);
    siege.classList.remove("siege--reagit");
    void siege.offsetWidth;
    siege.classList.add("siege--reagit");
    const mot = h("span", { class: "eclat", style: `--penche:${Math.round(Math.random() * 16 - 8)}deg; --decale:${Math.round(Math.random() * 30 - 15)}px` }, r.mot);
    siege.append(mot);
    mot.addEventListener("animationend", () => mot.remove());
  });

  let cle = "";
  let billetsVus = 0;
  return {
    maj(etat) {
      const p = etat.presentation;
      if (!p) return;
      const orateur = joueur(etat, p.presentateurId);
      const moiOrateur = p.presentateurId === etat.moi.id;
      chrono.regler(etat.finA);
      jauge.regler(p.etape === "slide" || p.etape === "auteur" ? p.applaudi : 0, p.applaudiMax);
      imprevu.textContent = texteImprevu(etat.imprevu);
      imprevu.hidden = !etat.imprevu;

      const enRelais = etat.mode === "relais";
      const nouvelleCle = `${p.index}-${p.etape}-${p.numeroSlide}`;
      if (nouvelleCle !== cle && p.etape === "auteur") {
        // La diapo reste à l'écran et la signature de l'auteur vient s'y coller.
        const auteur = joueur(etat, p.auteurId);
        const deMoi = p.auteurId === etat.moi.id;
        signature.replaceChildren(h("span", {}, "écrit par"), h("strong", { style: `--pastille:${couleur(auteur)}` }, deMoi ? "toi" : auteur.nom));
        signature.hidden = false;
        const image = ecran.querySelector(".ecran-image");
        if (!image.firstChild) image.replaceChildren(rendreDiapo(p.slide)); // arrivée en pleine révélation
        sons.pop();
        cle = nouvelleCle;
      } else if (nouvelleCle !== cle) {
        signature.hidden = true;
        if (p.etape === "sortie") sons.applaudissements();
        const contenu =
          p.etape === "intro"
            ? carton([enRelais ? (moiOrateur ? "Conférence collective. Tu ouvres." : `Conférence collective. ${orateur.nom} ouvre.`) : moiOrateur ? "C'est à toi. Ta conférence :" : `${orateur.nom} présente`, p.titre])
            : p.etape === "slide"
              ? rendreDiapo(p.slide)
              : carton([enRelais ? "Fin de la conférence." : `Merci ${orateur.nom}.`, "Applaudissements"]);
        if (cle) projeter(ecran, contenu);
        else ecran.querySelector(".ecran-image").replaceChildren(contenu);
        cle = nouvelleCle;
        billetsVus = 0;
        petitsMots.replaceChildren();
      }
      for (const billet of p.pieges.slice(billetsVus)) {
        petitsMots.append(h("p", { class: "billet" }, h("span", {}, billet.texte), h("span", { class: "billet-de" }, `— ${joueur(etat, billet.deId).nom}`)));
      }
      billetsVus = p.pieges.length;

      titre.textContent = p.etape === "sortie" && enRelais ? "Rideau." : moiOrateur ? "À toi de parler." : enRelais ? `${orateur.nom} a la parole.` : `${orateur.nom} présente.`;
      sujet.textContent = p.etape === "intro" ? "" : p.titre;
      // Un pion par diapo : celles de l'exposé en version longue, celles de toute la salle en relais.
      const nbPions = enRelais ? p.total : p.nbSlides;
      const pionCourant = enRelais ? p.index : p.numeroSlide;
      if (pions.children.length !== nbPions) pions.replaceChildren(...Array.from({ length: nbPions }, () => h("li")));
      const surDiapo = p.etape === "slide" || p.etape === "auteur";
      [...pions.children].forEach((li, i) => (li.className = surDiapo && i === pionCourant ? "pion--allume" : p.etape === "sortie" || (surDiapo && i < pionCourant) ? "pion--passe" : ""));
      rang.textContent = enRelais ? `Manche ${etat.manche} sur ${etat.manches}` : `Exposé ${p.index + 1} sur ${p.total}`;
      ensuite.textContent = p.etape === "sortie" || !p.suivantId ? "" : p.suivantId === etat.moi.id ? "Tu es le prochain." : `Ensuite : ${joueur(etat, p.suivantId).nom}`;
      ensuite.classList.toggle("ensuite--moi", p.suivantId === etat.moi.id && p.etape !== "sortie");
      passer.hidden = !p.peutPasser;
      passer.textContent = moiOrateur && p.etape === "slide" ? "J'ai fini" : "Passer à la suite";

      publicEl.replaceChildren(
        ...etat.joueurs.map((j) =>
          h("li", { class: `siege ${j.id === p.presentateurId ? "siege--scene" : ""} ${j.id === p.auteurId ? "siege--auteur" : ""} ${j.connecte ? "" : "siege--absent"} ${j.spectateur ? "siege--regarde" : ""}`, "data-id": j.id, style: `--pastille:${couleur(j)}` }, h("span", { class: "siege-nom" }, j.nom))
        )
      );
      reactions.hidden = moiOrateur;

      const choix = etat.moi.piegeChoix;
      pieges.hidden = moiOrateur || !choix.length;
      if (!pieges.hidden && pieges.dataset.cle !== `${choix.join("|")}${p.peutPieger}`) {
        pieges.dataset.cle = `${choix.join("|")}${p.peutPieger}`;
        pieges.replaceChildren(
          h("p", { class: "pieges-titre" }, etat.manches > 1 ? "Glisse un petit mot à celui qui parle. Tu en as un par manche." : "Glisse-lui un petit mot. Tu n'en as qu'un pour toute la partie."),
          ...choix.map((texte, i) => h("button", { class: "billet billet--main", type: "button", disabled: !p.peutPieger, onclick: () => dire({ t: "piege", choix: i }) }, texte))
        );
      }
    },
    tic: () => chrono.tic(),
    demonter: arret,
  };
}

// Abonnement aux réactions avec désabonnement (l'écran de projection est démonté entre deux parties).
const ecouteursReaction = new Set();
sur("reaction", (m) => ecouteursReaction.forEach((fn) => fn(m)));
function sur_reaction(fn) {
  ecouteursReaction.add(fn);
  return () => ecouteursReaction.delete(fn);
}

/* ---------- Vote ---------- */

function ecranVote(etat) {
  const chrono = minuterie();
  const rangees = h("ol", { class: "planche" });
  const attente = h("p", { class: "vote-attente" });
  const enRelais = etat.mode === "relais";
  const CATEGORIES = enRelais
    ? [{ id: "moment", nom: "Meilleur moment", interdit: "interditMoment", raison: (x) => (x.estPresentateur ? "C'est toi qui parlais" : "C'est toi qui l'as écrite") }]
    : [
        { id: "orateur", nom: "Meilleur orateur", interdit: "interditOrateur", raison: () => "C'est toi qui parlais" },
        { id: "slides", nom: "Meilleures diapos", interdit: "interditSlides", raison: () => "C'est toi qui les as écrites" },
      ];
  rangees.append(
    ...etat.vote.exposes.map((x) => {
      const orateur = joueur(etat, x.presentateurId);
      return h(
        "li",
        { class: "bande", "data-index": x.index },
        h(
          "div",
          { class: "bande-nom" },
          h("h2", {}, enRelais ? `Le passage de ${orateur.nom}` : x.titre),
          !enRelais && h("p", {}, "présenté par ", h("strong", { style: `--pastille:${couleur(orateur)}` }, orateur.nom))
        ),
        h("div", { class: "bande-diapos" }, x.slides.map((s, i) => cache({ contenu: rendreDiapo(s), numero: i + 1, classe: "cache--petit" }))),
        h(
          "div",
          { class: "bande-votes" },
          CATEGORIES.map((c) =>
            h(
              "button",
              { class: "gommette", type: "button", "data-categorie": c.id, disabled: x[c.interdit], "aria-pressed": "false", onclick: () => dire({ t: "vote", categorie: c.id, index: x.index }) },
              h("span", { class: "gommette-rond", "aria-hidden": "true" }),
              x[c.interdit] ? c.raison(x) : c.nom
            )
          )
        )
      );
    })
  );
  scene.append(
    h(
      "section",
      { class: "vote" },
      h(
        "div",
        { class: "vote-tete" },
        h(
          "div",
          {},
          h("h1", {}, enRelais ? "Colle ta gommette." : "Colle tes deux gommettes."),
          h(
            "p",
            {},
            enRelais
              ? `Manche ${etat.manche} sur ${etat.manches}. Ta gommette rapporte 100 points à celui qui parlait et 100 à celui qui avait écrit la diapo.`
              : "Une pour celui qui a le mieux parlé, une pour les diapos les mieux écrites. Chaque gommette vaut 100 points."
          )
        ),
        chrono.el
      ),
      rangees,
      attente
    )
  );
  return {
    maj(etat) {
      if (!etat.vote) return;
      chrono.regler(etat.finA);
      rangees.querySelectorAll(".gommette").forEach((b) => {
        const index = Number(b.closest(".bande").dataset.index);
        b.setAttribute("aria-pressed", String(etat.vote.mesVotes[b.dataset.categorie] === index));
      });
      const reste = etat.joueurs.filter((j) => j.enJeu && j.connecte && !etat.vote.ontVote.includes(j.id));
      attente.textContent = reste.length ? `On attend ${reste.map((j) => j.nom).join(", ")}.` : "";
    },
    tic: () => chrono.tic(),
  };
}

/* ---------- Résultats ---------- */

function ecranResultats(etat) {
  const classement = [...etat.joueurs].filter((j) => j.enJeu && !j.spectateur).sort((a, b) => b.score - a.score);
  // La diapo de la soirée : celle qui a récolté le plus de gommettes et de réactions.
  const poids = (x) => (x.voix + x.voixOrateur + x.voixSlides) * 100 + x.applaudi * 10;
  const vedette = etat.resultats.manches.flatMap((m) => m.exposes).sort((a, b) => poids(b) - poids(a))[0];
  const diapoVedette = vedette?.slides.find((sl) => !diapoVide(sl)) ?? vedette?.slides[0];
  const souvenir = h("button", { class: "bouton", type: "button" }, "Enregistrer la diapo de la soirée");
  souvenir.addEventListener("click", async () => {
    souvenir.disabled = true;
    try {
      await enregistrerSouvenir({ slide: diapoVedette, titre: vedette.titre, orateur: joueur(etat, vedette.presentateurId).nom, auteur: joueur(etat, vedette.auteurId).nom });
      souvenir.textContent = "Image enregistrée";
    } catch {
      petitMot("L'image n'a pas pu être créée.");
    }
    setTimeout(() => {
      souvenir.disabled = false;
      souvenir.textContent = "Enregistrer la diapo de la soirée";
    }, 2500);
  });
  const hote = etat.hoteId === etat.moi.id;
  const suspense = (classement.length - 1) * 0.5 + 1.2;
  let rang = 0;
  scene.append(
    h(
      "section",
      { class: "resultats" },
      h(
        "div",
        { class: "palmares" },
        h("h1", {}, classement[0]?.score ? `${classement[0].nom} repart avec le projecteur.` : "Personne n'a voté. Égalité parfaite."),
        h(
          "ol",
          { class: "classement" },
          classement.map((j, i) => {
            if (i === 0 || j.score < classement[i - 1].score) rang = i + 1;
            return h("li", { style: `--pastille:${couleur(j)}; --attente:${(classement.length - 1 - i) * 0.5 + 1.2}s` }, h("span", { class: "classement-rang" }, rang), h("span", { class: "classement-nom" }, j.nom), h("span", { class: "classement-score" }, `${j.score} pts`));
          })
        ),
        etat.resultats.recompenses.length
          ? h(
              "ul",
              { class: "recompenses" },
              etat.resultats.recompenses.map((r, i) =>
                h("li", { style: `--attente:${suspense + 0.5 + i * 0.25}s` }, h("span", { class: "recompense-titre" }, r.titre), h("strong", { style: `--pastille:${couleur(joueur(etat, r.joueurId))}` }, joueur(etat, r.joueurId).nom), h("span", { class: "recompense-detail" }, r.detail))
              )
            )
          : null,
        vedette && poids(vedette) > 0 ? souvenir : null,
        hote ? h("button", { class: "bouton bouton--principal", type: "button", onclick: () => dire({ t: "rejouer" }) }, "Rejouer avec les mêmes") : h("p", { class: "salon-attente" }, `${joueur(etat, etat.hoteId).nom} peut relancer une partie.`)
      ),
      h(
        "ol",
        { class: "planche planche--revelee" },
        etat.mode === "relais"
          ? etat.resultats.manches.map((m, n) =>
              // En relais : une bande par manche, et sous chaque diapo qui parlait, qui avait écrit, et son score.
              h(
                "li",
                { class: "bande bande--manche" },
                h("div", { class: "bande-nom" }, h("h2", {}, m.titre), h("p", {}, `Manche ${n + 1}`)),
                h(
                  "div",
                  { class: "bande-diapos" },
                  m.exposes.map((x, i) => {
                    const orateur = joueur(etat, x.presentateurId);
                    const auteur = joueur(etat, x.auteurId);
                    return h(
                      "figure",
                      { class: `passage ${x.voix || x.applaudi ? "passage--prime" : ""}` },
                      cache({ contenu: rendreDiapo(x.slides[0]), numero: i + 1, classe: "cache--petit" }),
                      h(
                        "figcaption",
                        {},
                        h("strong", { style: `--pastille:${couleur(orateur)}` }, orateur.nom),
                        " parlait, ",
                        h("strong", { style: `--pastille:${couleur(auteur)}` }, auteur.nom),
                        " écrivait",
                        x.voix || x.applaudi
                          ? h("span", { class: "passage-voix" }, [x.voix && (x.voix === 1 ? "1 gommette" : `${x.voix} gommettes`), x.applaudi && (x.applaudi === 1 ? "1 réaction" : `${x.applaudi} réactions`)].filter(Boolean).join(", "))
                          : null
                      )
                    );
                  })
                )
              )
            )
          : etat.resultats.manches.flatMap((m) => m.exposes).map((x) => {
          const orateur = joueur(etat, x.presentateurId);
          const auteur = joueur(etat, x.auteurId);
          const voix = (n) => (n === 0 ? "aucune gommette" : n === 1 ? "1 gommette" : `${n} gommettes`);
          return h(
            "li",
            { class: "bande" },
            h(
              "div",
              { class: "bande-nom" },
              h("h2", {}, x.titre),
              h("p", {}, "présenté par ", h("strong", { style: `--pastille:${couleur(orateur)}` }, orateur.nom), ` : ${voix(x.voixOrateur)}`),
              h("p", {}, "diapos écrites par ", h("strong", { style: `--pastille:${couleur(auteur)}` }, auteur.nom), ` : ${voix(x.voixSlides)}`),
              x.applaudi ? h("p", {}, x.applaudi === 1 ? "1 réaction du public" : `${x.applaudi} réactions du public`) : null
            ),
            h("div", { class: "bande-diapos" }, x.slides.map((s, i) => cache({ contenu: rendreDiapo(s), numero: i + 1, classe: "cache--petit" })))
          );
        })
      )
    )
  );
  scene.querySelector(".resultats").style.setProperty("--suspense", `${suspense}s`);
  sons.roulement(suspense);
  sons.fanfare(suspense);
  return { maj() {} };
}

/* ---------- Aiguillage ---------- */

const ECRANS = { accueil: ecranAccueil, salon: ecranSalon, ecriture: ecranEcriture, presentation: ecranPresentation, vote: ecranVote, resultats: ecranResultats };
let courant = null;

function afficher(etat) {
  const phase = etat ? etat.phase : "accueil";
  if (!courant || courant.phase !== phase) {
    courant?.demonter?.();
    scene.replaceChildren();
    document.body.dataset.phase = phase;
    courant = ECRANS[phase](etat);
    courant.phase = phase;
    scrollTo(0, 0);
    if (phase === "ecriture") annonce(etat.mode === "relais" ? `Manche ${etat.manche}` : "À vos diapos", etat.imprevu ? texteImprevu(etat.imprevu) : etat.mode === "relais" && etat.manche === 1 ? "Une diapo chacun, pour quelqu'un d'autre." : "");
    else if (phase === "vote") annonce("Au vote");
    else if (phase === "presentation" && etat.imprevu?.type === "echange") annonce("Imprévu", "Les diapos ont été échangées. Personne ne présente celle qu'on lui destinait.");
    else if (phase === "presentation") clicClac();
  }
  if (etat) courant.maj(etat);
  courant.tic?.();
}

sur("etat", (etat) => {
  if (location.pathname !== `/s/${etat.code}`) history.replaceState(null, "", `/s/${etat.code}`);
  afficher(etat);
});
setInterval(() => courant?.tic?.(), 200);

// Rechargement de la page en pleine partie : on reprend sa place sans repasser par l'accueil.
const codeInitial = location.pathname.match(/^\/s\/([A-Za-z]{4})\/?$/)?.[1]?.toUpperCase();
if (codeInitial && localStorage.getItem(`diapo-surprise:jeton:${codeInitial}`) && nomMemorise()) {
  rejoindreSalon(codeInitial, nomMemorise());
  sur("erreur", () => {
    if (!session.etat) {
      localStorage.removeItem(`diapo-surprise:jeton:${codeInitial}`);
      history.replaceState(null, "", "/");
      afficher(null);
    }
  });
  setTimeout(() => !session.etat && !courant && afficher(null), 1500);
} else {
  afficher(null);
}
