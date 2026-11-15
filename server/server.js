// Serveur Diapo Surprise : fichiers statiques + salons temps réel en WebSocket.
// Tout l'état est en mémoire : un redémarrage ferme les parties en cours.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import * as jeu from "./game.js";

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = join(fileURLToPath(new URL("..", import.meta.url)), "public");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

const salons = new Map(); // code -> salon
const REACTIONS = ["rire", "bravo", "malaise", "quoi"];
const GRACE = process.env.DS_RAPIDE === "1" ? 50 : 10_000;

const http = createServer(async (req, res) => {
  const chemin = decodeURIComponent(new URL(req.url, "http://x").pathname);
  // Un lien de salon (/s/ABCD) sert la même page : le code est lu côté client.
  const fichier = chemin === "/" || chemin.startsWith("/s/") ? "/index.html" : chemin;
  const cible = normalize(join(PUBLIC, fichier));
  if (!cible.startsWith(PUBLIC)) return res.writeHead(403).end();
  try {
    const corps = await readFile(cible);
    res.writeHead(200, { "Content-Type": TYPES[extname(cible)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(corps);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Introuvable");
  }
});

const wss = new WebSocketServer({ server: http, path: "/ws", maxPayload: 16 * 1024 });

const envoyer = (ws, message) => ws.readyState === 1 && ws.send(JSON.stringify(message));

function diffuser(salon) {
  for (const j of salon.joueurs) if (j.ws) envoyer(j.ws, jeu.vue(salon, j));
}

function diffuserBrut(salon, message) {
  for (const j of salon.joueurs) if (j.ws) envoyer(j.ws, message);
}

wss.on("connection", (ws) => {
  let salon = null;
  let moi = null;
  const erreur = (texte) => envoyer(ws, { t: "erreur", texte });

  function installer(s, joueur) {
    salon = s;
    moi = joueur;
    if (moi.ws && moi.ws !== ws) moi.ws.close(4000, "Connexion reprise ailleurs");
    moi.ws = ws;
    moi.connecte = true;
    envoyer(ws, { t: "bienvenue", code: salon.code, id: moi.id, jeton: moi.jeton });
    diffuser(salon);
  }

  ws.on("message", (brut) => {
    let m;
    try {
      m = JSON.parse(brut);
    } catch {
      return;
    }
    if (!m || typeof m.t !== "string") return;

    if (m.t === "creer") {
      if (moi) return;
      const s = jeu.creerSalon(jeu.nouveauCode((c) => salons.has(c)));
      salons.set(s.code, s);
      return installer(s, jeu.ajouterJoueur(s, m.nom));
    }

    if (m.t === "rejoindre") {
      if (moi) return;
      const s = salons.get(String(m.code ?? "").toUpperCase());
      if (!s) return erreur("Ce salon n'existe pas ou a fermé.");
      const ancien = typeof m.jeton === "string" && s.joueurs.find((j) => j.jeton === m.jeton);
      if (ancien) return installer(s, ancien);
      if (!m.nom) return envoyer(ws, { t: "salonOk", code: s.code }); // simple vérification du code
      const joueur = jeu.ajouterJoueur(s, m.nom);
      if (!joueur) return erreur(`Ce salon est complet (${jeu.MAX_JOUEURS} joueurs).`);
      return installer(s, joueur);
    }

    if (!moi || !salon) return;
    const rediffuser = () => diffuser(salon);
    const estHote = salon.hoteId === moi.id;

    switch (m.t) {
      case "lancer": {
        if (!estHote) return;
        const refus = jeu.demarrer(salon, rediffuser);
        return refus ? erreur(refus) : rediffuser();
      }
      case "reglage":
        if (estHote && jeu.regler(salon, m.cle, m.valeur)) rediffuser();
        return;
      case "brouillon":
        return jeu.brouillon(salon, moi, m.slides, m.titre);
      case "pret":
        jeu.brouillon(salon, moi, m.slides, m.titre);
        jeu.marquerPret(salon, moi, m.pret, rediffuser);
        return rediffuser();
      case "passer":
        if (jeu.peutPasser(salon, moi)) {
          jeu.avancer(salon, rediffuser);
          rediffuser();
        }
        return;
      case "piege":
        if (jeu.tendrePiege(salon, moi, m.choix)) rediffuser();
        return;
      case "reaction":
        // Pas plus de trois réactions par seconde et par joueur.
        if (salon.phase === "presentation" && REACTIONS.includes(m.genre) && Date.now() - (moi.derniereReaction ?? 0) > 330) {
          moi.derniereReaction = Date.now();
          diffuserBrut(salon, { t: "reaction", genre: m.genre, deId: moi.id, applaudi: jeu.reagir(salon, moi) });
        }
        return;
      case "regarder":
        if (jeu.regarder(salon, moi, m.oui)) rediffuser();
        return;
      case "vote":
        jeu.voter(salon, moi, m.categorie, m.index, rediffuser);
        return rediffuser();
      case "rejouer":
        if (estHote && salon.phase === "resultats") {
          jeu.retourSalon(salon);
          rediffuser();
        }
        return;
    }
  });

  ws.on("close", () => {
    if (!moi || !salon || moi.ws !== ws) return;
    moi.ws = null;
    moi.connecte = false;
    const s = salon;
    const parti = moi;
    diffuser(s);
    // Délai de grâce : un rechargement de page ne fait perdre ni sa place ni le rôle d'hôte.
    setTimeout(() => {
      if (parti.connecte) return;
      if (s.joueurs.some((j) => j.connecte)) {
        jeu.retirerJoueur(s, parti);
        return diffuser(s);
      }
      // Plus personne : on garde le salon deux minutes au cas où quelqu'un revient.
      setTimeout(() => {
        if (s.joueurs.every((j) => !j.connecte)) {
          clearTimeout(s.minuteur);
          salons.delete(s.code);
        }
      }, 120_000).unref();
    }, GRACE).unref();
  });
});

http.listen(PORT, () => console.log(`Diapo Surprise : http://localhost:${PORT}`));
