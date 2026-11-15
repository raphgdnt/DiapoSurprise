// Connexion au serveur : une WebSocket, reconnexion automatique, et l'état du salon.

const ecouteurs = { etat: [], reaction: [], erreur: [], lien: [], salonOk: [] };
let ws = null;
let enAttente = []; // messages à envoyer dès que la connexion est ouverte
let decalage = 0; // horloge serveur - horloge locale
let tentative = 0;

export const session = {
  etat: null,
  id: null,
  code: null,
  connecte: false,
};

const cleJeton = (code) => `diapo-surprise:jeton:${code}`;
export const nomMemorise = () => localStorage.getItem("diapo-surprise:nom") ?? "";
export const memoriserNom = (nom) => localStorage.setItem("diapo-surprise:nom", nom);

export const sur = (evenement, fn) => ecouteurs[evenement].push(fn);
const emettre = (evenement, donnee) => ecouteurs[evenement].forEach((fn) => fn(donnee));

// Heure du serveur, pour que tous les chronos tombent en même temps.
export const maintenant = () => Date.now() + decalage;

export function dire(message) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(message));
  else enAttente.push(message);
}

function ouvrir() {
  const protocole = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${protocole}://${location.host}/ws`);

  ws.addEventListener("open", () => {
    tentative = 0;
    session.connecte = true;
    emettre("lien", true);
    // Après une coupure, on reprend sa place grâce au jeton gardé dans le navigateur.
    if (session.code) {
      ws.send(JSON.stringify({ t: "rejoindre", code: session.code, jeton: localStorage.getItem(cleJeton(session.code)), nom: nomMemorise() }));
    }
    for (const m of enAttente.splice(0)) ws.send(JSON.stringify(m));
  });

  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.t === "bienvenue") {
      session.id = m.id;
      session.code = m.code;
      localStorage.setItem(cleJeton(m.code), m.jeton);
    } else if (m.t === "etat") {
      decalage = m.maintenant - Date.now();
      session.etat = m;
      emettre("etat", m);
    } else if (m.t === "reaction") {
      emettre("reaction", m);
    } else if (m.t === "erreur") {
      emettre("erreur", m.texte);
    } else if (m.t === "salonOk") {
      emettre("salonOk", m.code);
    }
  });

  ws.addEventListener("close", () => {
    session.connecte = false;
    emettre("lien", false);
    tentative++;
    setTimeout(ouvrir, Math.min(4000, 400 * tentative));
  });
}

export function creerSalon(nom) {
  memoriserNom(nom);
  dire({ t: "creer", nom });
}

export function rejoindreSalon(code, nom) {
  memoriserNom(nom);
  dire({ t: "rejoindre", code, nom, jeton: localStorage.getItem(cleJeton(code.toUpperCase())) });
}

export const verifierSalon = (code) => dire({ t: "rejoindre", code });

ouvrir();
