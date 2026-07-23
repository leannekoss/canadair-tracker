# Canadair Tracker — lisibilité grand public & partage

Date : 2026-07-23

## Objectif

Rendre l'application compréhensible en quelques secondes par un visiteur non
initié arrivant depuis LinkedIn, et faire en sorte que le lien partagé s'affiche
correctement. Cible : grand public curieux, pas pairs techniques.

Contrainte : n'ajouter que des chantiers petits ou nécessaires. Les chantiers 1
à 3 n'introduisent aucune donnée nouvelle — ils exposent des valeurs déjà
calculées dans `src/lib/`.

## Chantier 0 — Carte de partage social

**Problème.** `index.html` ne contient aucune balise Open Graph ni Twitter Card.
LinkedIn affiche donc une carte de lien sans visuel ni description. L'application
est une SPA Vite : le HTML servi ne contient qu'un `#root` vide, les crawlers
sociaux n'exécutent pas le JS, donc toute balise injectée par React serait
invisible.

**Solution.**
- Balises statiques dans `index.html` : `og:title`, `og:description`, `og:image`,
  `og:url`, `og:type`, `twitter:card=summary_large_image`, `description`.
- Image `public/og.jpg` en 1200×630, versionnée dans le dépôt : capture de la
  carte France en vue par défaut avec le titre incrusté. Générée par un script
  de capture, pas à la main, pour être reproductible.
- L'URL de l'image doit être absolue (`https://canadair-tracker.vercel.app/og.jpg`) :
  LinkedIn ne résout pas les chemins relatifs.

**Vérification.** L'image existe et pèse moins de 5 Mo (limite LinkedIn) ; les
balises sont présentes dans le HTML servi en production (`curl` sur l'URL de prod,
pas seulement en local).

## Chantier 1 — Légende et clé de lecture

**Problème.** Rien n'explique le code couleur ni ce que sont les points orange.

**Solution.** Panneau légende compact, ouvert par défaut sur grand écran, replié
derrière un bouton sur mobile :
- une pastille par famille avec sa couleur issue de `CATEGORY_HEX`
  (Pélican CL-415, Milan Dash 8, Air Tractor, Dragon EC145) ;
- point orange = détection de chaleur par satellite ;
- trait = trajectoire des dernières heures.

Sous le titre, une phrase de contexte d'une ligne. L'origine des indicatifs
(« Pélican » vient des Catalina de 1963, « Milan » désigne les Dash 8) est
ajoutée dans `/methodo.html`, pas dans la légende, pour ne pas l'alourdir.

La légende lit `CATEGORY_HEX` et la liste des familles présentes dans la flotte :
pas de duplication des couleurs en dur.

## Chantier 2 — Bandeau d'effort du jour

**Problème.** Les chiffres agrégés du jour ne sont visibles qu'en ouvrant le
poster « Bilan du jour ».

**Solution.** Bandeau dans le header affichant, pour la journée sélectionnée :
appareils engagés, kilomètres cumulés, heures de vol, écopages estimés.
Source : `buildRecap()` de `src/lib/recap.js`, déjà appelé pour le poster —
le calcul est remonté au niveau de `App.jsx` et partagé entre le bandeau et
le poster, sans double calcul.

Les écopages et les rotations sont des heuristiques ADS-B : le mot « estimé »
doit apparaître, et le détail des heuristiques reste dans `/methodo.html`.

En mode direct, le bandeau porte sur la journée en cours ; en replay, sur la
journée sélectionnée. Sur mobile, il se réduit aux deux chiffres les plus
parlants (appareils engagés, kilomètres).

## Chantier 3 — Fiche foyer enrichie

**Problème.** Le lien entre un feu et les appareils qui le traitent n'est
raconté nulle part, alors que `foyerPasses()` le calcule déjà.

**Solution.** Au clic sur un foyer : commune, intensité, ancienneté de la
détection, nombre de détections, et liste des appareils passés dessus dans la
journée avec leur nombre de passages. Réutilise `foyerPasses()` de
`src/lib/mission.js` sur les traces déjà chargées.

Un foyer sans passage détecté affiche explicitement « aucun passage détecté »,
avec le rappel que les appareils volant bas échappent souvent à la couverture
ADS-B — l'absence de détection n'est pas une absence d'intervention.

C'est aussi l'emplacement de l'encart « en amont » vers kanari.io (chantier 6).

## Chantier 4 — Vue saison

**Problème.** L'archive quotidienne s'accumule depuis le 14/07 et n'est
exploitée que jour par jour.

**Solution.** Extension de l'onglet Historique : cumul sur toutes les journées
archivées — total de kilomètres, journée la plus intense, foyers les plus
traités, appareils les plus sollicités.

Agrégation côté client à partir des récapitulatifs par journée. La période
couverte est affichée explicitement (« depuis le 14 juillet 2026 ») pour ne pas
laisser croire à une couverture de toute la saison.

## Chantier 5 — Cadrage et honnêteté des chiffres

**Problème.** La vue par défaut cadre l'Europe de l'Ouest ; le compteur
« Feux 1746 » ne précise pas son périmètre alors qu'un filtre « France » existe
à côté.

**Solution.** Vue initiale recentrée sur la France métropolitaine et la Corse.
Le compteur de feux indique son périmètre courant (France ou zone visible) de
façon que le chiffre et le filtre ne puissent plus se contredire.

## Chantier 6 — Encart « en amont » vers kanari.io

Dans le panneau des foyers, une ligne discrète : la détection des départs de feu
en temps réel relève de kanari.io, la réponse aérienne de ce tracker. Lien
également listé dans `/methodo.html` aux côtés des autres sources.

## Chantier 7 — README vitrine

Le README actuel est fonctionnel. Ajout d'une capture, d'un tableau des sources
de données (donnée, fournisseur, fréquence, limite connue) et d'un résumé
d'architecture. Sert à la fois la découverte GitHub et le post LinkedIn.

## Ordre de livraison

0 → 1 → 5 → 2 → 3 → 4 → 6 → 7, avec un déploiement après chaque bloc cohérent
(0+1+5, puis 2+3, puis 4+6+7) pour juger en production au fur et à mesure.

## Ce qui n'est pas dans le périmètre

- Migration de la couche feux vers NASA FIRMS (l'actuelle fonctionne ; FIRMS
  reste documenté comme repli).
- Couche analytique GeoSQL (décision du 16/07 : quand l'archive aura mûri).
- Toute reprise de l'architecture de rendu deck.gl.
