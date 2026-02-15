# Tesla Light Show — Closures (mécanismes)

## Principe

Les closures fonctionnent **différemment des feux**. Au lieu d'un niveau de luminosité (0-255), elles utilisent des **commandes fixes** écrites dans le FSEQ :

| Commande | Valeur byte | Description |
|----------|-------------|-------------|
| Idle     | `0`         | Arrête (ou finit le mouvement en cours) |
| Open     | `64`        | Ouvre |
| Dance    | `128`       | Oscille entre 2 positions prédéfinies |
| Close    | `192`       | Ferme |
| Stop     | `255`       | Arrêt immédiat |

## Closures disponibles sur Model 3/Y

| Closure             | Modes disponibles       | Supporte Dance ? | Limite par show | Notes |
|---------------------|------------------------|-------------------|-----------------|-------|
| **Rétroviseurs**    | Ouvrir / Fermer / A-R  | Non               | 20 commandes    | Utiliser Open/Close pour simuler Dance |
| **Fenêtres**        | Dance uniquement       | Oui               | 6 commandes     | Limite thermique ~30s |
| **Coffre (liftgate)** | Ouvrir / Fermer / Dance | Oui            | 6 commandes     | Doit être Open avant Dance |
| **Trappe de charge** | Ouvrir / Fermer / Rainbow | Oui (LED rainbow) | 3 commandes | Dance = LED arc-en-ciel |

## Règles importantes

- Les **rétros** ne supportent pas Dance → on propose Open / Close / Aller-retour (Open+Close enchaînés)
- Les **fenêtres** : on ne propose que Dance (oscillation haut/bas native Tesla)
- Le **coffre** doit être **Open** avant de **Dance** — le show doit inclure un Open avant tout Dance
- La **trappe de charge** : Dance fait clignoter la LED en arc-en-ciel (pas de mouvement mécanique)
- **Au démarrage du show**, la Tesla ouvre automatiquement toutes les fenêtres
- Pour les fenêtres : Open (64) = **remonter** la vitre, Close (192) = **descendre** la vitre
- Les commandes trop rapprochées (~20ms) comptent dans les limites sans effet visible
- Laisser un temps raisonnable entre les commandes pour un bon rendu visuel
- Les fenêtres en Dance ont une **limite thermique** (~30s max recommandé par show)
- Les closures ne ferment pas instantanément — prévoir le temps de mouvement

## Channels FSEQ (rétro-ingénierie sur vraie Tesla Model 3)

Les lights occupent les channels 0-29 environ. Les closures occupent les channels 30+.

| Closure                  | Channel | Confirmé | Notes |
|--------------------------|---------|----------|-------|
| Rétro gauche             | 33      | ✅ v3    | Close=plier, Open=déplier |
| Rétro droit              | 34      | ✅ v3    | Close=plier, Open=déplier |
| Fenêtre AV gauche        | 35      | ✅ v3    | Close=remonter la vitre |
| Fenêtre AR gauche        | 36      | ✅ v3    | Close=remonter la vitre |
| Fenêtre AV droite        | 37      | ✅ v3    | Close=remonter la vitre |
| Trappe de charge         | 39      | ✅ v2+v3 | Open=ouvre, Close=ferme |
| Coffre (liftgate)        | 40      | ✅ v2+v3 | Open=ouvre, Close=ferme |
| Fenêtre AR droite        | 45      | ✅ v2+v3 | Open/Close=remonter la vitre |

**Channels sans effet détecté (Model 3) :** 28-32, 38, 41-44, 46-47

**Note :** Les fenêtres sont automatiquement ouvertes (baissées) au démarrage du show.
Pour les remonter : envoyer Close (192). Dance (128) = oscillation haut/bas.

## Durées de mouvement estimées

| Closure           | Open    | Close   | Dance cycle |
|-------------------|---------|---------|-------------|
| Rétroviseurs      | ~2s     | ~2s     | N/A         |
| Fenêtres          | ~3s     | ~3s     | oscillation continue |
| Coffre            | ~5s     | ~5s     | oscillation lente |
| Trappe de charge  | ~1s     | ~1s     | LED rainbow |

## Comptage des utilisations

Chaque événement placé sur la timeline pour une closure compte comme **1 commande** :
- Open = 1 commande
- Close = 1 commande  
- Dance = 1 commande
- Aller-retour (rétros) = 2 commandes (Open + Close)

L'UI affiche le nombre d'utilisations restantes et bloque le placement quand le max est atteint.
