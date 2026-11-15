# Design — Diapo Surprise

Univers : **Soirée diapos**. Le jeu se passe dans une salle de projection plongée dans le noir ; les slides sont des diapositives 35 mm. La lumière est le seul marqueur d'état : ce qui est actif est éclairé, le reste est dans l'ombre.

## Couleurs (variables dans `public/css/style.css`)

| Rôle | Variable | Valeur |
|---|---|---|
| Salle | `--noir`, `--noir-2`, `--noir-3`, `--trait` | #12100e, #1c1916, #2a2520, #3d362d |
| Texte sur noir | `--texte`, `--texte-2` | #f1ebdd, #b9ae9a |
| Carton des caches | `--carton`, `--carton-bord` | #f0ebe0, #d6cebd |
| Lumière du projecteur | `--lumiere` | #fbf7ec |
| Encre sur clair | `--encre`, `--encre-2` | #1b1714, #5b5245 |
| Feutre et papier | `--feutre`, `--papier` | #232f6e, #fbf4cf |
| Fonds de diapo | `--jaune`, `--rouge`, `--bleu`, `--vert` | #f5b301, #c42e19, #1c3fa8, #0e6b4d |
| Tampon dateur | `--tampon` | #c2452d |

Le jaune est aussi la couleur de l'action principale. Chaque joueur a une pastille de couleur (liste `COULEURS` dans `public/js/app.js`).

## Typographie (polices auto-hébergées dans `public/fonts`)

- **Caprasimo** : titres et grands chiffres.
- **Archivo** (variable, graisse et largeur) : texte, boutons, contenu des diapos.
- **Reenie Beanie** : tout ce qui est écrit au feutre (étiquettes des caches, petits mots, titres de conférence).

## Objets

- **Cache de diapo** (`.cache`) : carton blanc, fenêtre 3:2, étiquette au feutre, tampon dateur, pastille du joueur. Sert pour les joueurs, les diapos, le formulaire d'accueil.
- **Écran de projection** (`.ecran`) : changement de diapo avec obturateur, mise au point et poussières à cet instant seulement, plus le clic-clac sonore.
- **Table lumineuse** (`.table`, `.planche`, `.regles-table`) : panneau clair pour écrire, voter et lire les résultats.
- **Carrousel** (`.carrousel`) : le salon, huit emplacements vus de dessus, le code au centre.
- **Minuterie** (`.minuterie`) : cadran mécanique dont le repère avance seconde par seconde.
- **Petits mots** (`.billet`, `.mot`) : papier jaune manuscrit pour les pièges et les messages d'erreur.

## Règles

- Pas d'emoji ni d'icônes décoratives ; les libellés sont du texte.
- Pas de halo coloré : les ombres sont neutres, seule la lumière crème du projecteur déborde.
- Les cinq gabarits de diapo ont chacun leur fond : titre bleu, chiffre rouge, citation noire, graphique jaune, liste verte.
- Les tailles à l'intérieur d'un cache ou d'une diapo sont en unités de conteneur (`cqw`, `cqh`) pour que le même rendu serve à toutes les tailles.
