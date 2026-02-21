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
- Pour les fenêtres : Open (64) = **descendre** la vitre (ouvrir), Close (192) = **remonter** la vitre (fermer)
- Les commandes trop rapprochées (~20ms) comptent dans les limites sans effet visible
- Laisser un temps raisonnable entre les commandes pour un bon rendu visuel
- Les fenêtres en Dance ont une **limite thermique** (~30s max recommandé par show)
- Les closures ne ferment pas instantanément — prévoir le temps de mouvement

## Channels FSEQ — Source officielle Tesla (Tesla Model S.xmodel)

Mapping extrait du fichier officiel `Tesla Model S.xmodel` du repo [teslamotors/light-show](https://github.com/teslamotors/light-show).

### Lights (channels 0-29)

| Channel | Nom officiel | Notre nom | Notes Model 3 |
|---------|-------------|-----------|---------------|
| 0-1     | Outer Main Beam L/R | light_left/right_front | ✅ |
| 2-3     | Inner Main Beam L/R | light_left/right_front | ✅ |
| 4-5     | Signature L/R | light_left/right_front | ✅ |
| 6-11    | Channel 4/5/6 L/R | light_left/right_front | ✅ |
| 12-13   | Front Turn L/R | blink_front_left/right | ✅ |
| 14-15   | Front Fog L/R | — | Non utilisé |
| 16-17   | Aux Park L/R | — | Non utilisé |
| 18-19   | Side Marker L/R | — | Non utilisé |
| 20-21   | Side Repeater L/R | — | Non utilisé |
| 22-23   | Rear Turn L/R | blink_back_left/right | ✅ |
| 24      | Brake Lights | — | Non utilisé |
| 25-26   | Tail L/R | light_left/right_back | ✅ |
| 27      | Reverse Lights | — | Non utilisé |
| 28      | Rear Fog Lights | — | Non utilisé |
| 29      | License Plate | — | Non utilisé |

### Closures (channels 30-47)

| Channel | Nom officiel | Notre nom | Model 3/Y | Confirmé |
|---------|-------------|-----------|-----------|----------|
| 30-31   | Falcon Door L/R | — | ❌ S/X only | — |
| 32-33   | Front Door L/R | — | ❌ X only | — |
| **34**  | **Left Mirror** | retro_left | ✅ | ✅ test v4 |
| **35**  | **Right Mirror** | retro_right | ✅ | ⬜ à tester |
| **36**  | **Left Front Window** | window_left_front | ✅ | ✅ test v4 |
| **37**  | **Left Rear Window** | window_left_back | ✅ | ✅ test v4 |
| **38**  | **Right Front Window** | window_right_front | ✅ | ⬜ à tester |
| **39**  | **Right Rear Window** | window_right_back | ✅ | ✅ test v4 |
| **40**  | **Liftgate** | trunk | ✅ | ✅ test v4 |
| 41-44   | Door Handles | — | ❌ S only | — |
| **45**  | **Charge Port** | flap | ✅ | ⬜ à tester |
| 46-47   | — | — | — | Pas d'effet |

**Note :** Les fenêtres sont automatiquement ouvertes (baissées) au démarrage du show.
Pour les remonter : envoyer Close (192). Dance (128) = oscillation haut/bas.

## Durées de mouvement estimées

| Closure           | Open    | Close   | Dance cycle | Notes |
|-------------------|---------|---------|-------------|-------|
| Rétroviseurs      | ~2s     | ~2s     | N/A         | |
| Fenêtres          | ~3s     | ~3s     | oscillation continue | Limite thermique ~30s |
| Coffre            | **~13s** | **~13s** | oscillation lente | Mesuré sur vraie Model 3 |
| Trappe de charge  | ~1s     | ~1s     | LED rainbow | OPEN suffit en 1s (spec Tesla) |

## Règles Tesla officielles (spec GitHub)

- **OPEN/CLOSE** : pas de durée minimum requise. Même 1s suffit, la closure finit le mouvement seule.
- **DANCE** : la commande doit persister tant qu'on veut que la dance continue.
- **Avant un DANCE** : la closure DOIT être en position ouverte. Prévoir un délai entre OPEN et DANCE.
- Les fenêtres sont l'exception : elles honorent DANCE même sans OPEN préalable.
- La trappe se referme automatiquement après 2 minutes si restée ouverte.

## Comptage des utilisations

Chaque événement placé sur la timeline pour une closure compte comme **1 commande** :
- Open = 1 commande
- Close = 1 commande  
- Dance = 1 commande
- Aller-retour (rétros) = 2 commandes (Open + Close)

L'UI affiche le nombre d'utilisations restantes et bloque le placement quand le max est atteint.
