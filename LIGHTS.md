# Tesla Light Show — Mapping des lumières (Channels 0-29)

> Source officielle : fichier `Tesla Model S.xmodel` du repo [teslamotors/light-show](https://github.com/teslamotors/light-show)
> Ce fichier xmodel est le superset de tous les véhicules Tesla supportés.
> Vérifié par retro-engineering sur Model 3 (tests réels février 2026).

---

## Mapping officiel complet des 48 canaux

### Lumières (Ch 0-29) — valeurs brightness 0-255

| Channel | Nom officiel xLights     | Notre part ID          | Utilisé | Testé Model 3 | Notes |
|---------|--------------------------|------------------------|---------|----------------|-------|
| **0**   | Left Outer Main Beam     | `light_left_front`     | ✅      | ✅ confirmé    | DRL gauche |
| **1**   | Right Outer Main Beam    | `light_right_front`    | ✅      | ✅ confirmé    | DRL droit |
| **2**   | Left Inner Main Beam     | `light_left_front`     | ✅      | ✅ confirmé    | Feux de croisement gauche |
| **3**   | Right Inner Main Beam    | `light_right_front`    | ✅      | ✅ confirmé    | Feux de croisement droit |
| **4**   | Left Signature           | `light_left_front`     | ✅      | ✅ confirmé    | Segment haut gauche 1 |
| **5**   | Right Signature          | `light_right_front`    | ✅      | ✅ confirmé    | Segment haut droit 1 |
| **6**   | Left Channel 4           | `light_left_front`     | ✅      | ✅ confirmé    | Segment haut gauche 2 |
| **7**   | Right Channel 4          | `light_right_front`    | ✅      | ✅ confirmé    | Segment haut droit 2 |
| **8**   | Left Channel 5           | `light_left_front`     | ✅      | ✅ confirmé    | Segment haut gauche 3 |
| **9**   | Right Channel 5          | `light_right_front`    | ✅      | ✅ confirmé    | Segment haut droit 3 |
| **10**  | Left Channel 6           | `light_left_front`     | ✅      | ✅ confirmé    | Segment haut gauche 4 |
| **11**  | Right Channel 6          | `light_right_front`    | ✅      | ✅ confirmé    | Segment haut droit 4 |
| **12**  | Left Front Turn          | `blink_front_left`     | ✅      | ✅ confirmé    | Clignotant AV gauche |
| **13**  | Right Front Turn         | `blink_front_right`    | ✅      | ✅ confirmé    | Clignotant AV droit |
| **14**  | Left Front Fog           | —                      | ❌      | ✅ confirmé    | Antibrouillard AV gauche |
| **15**  | Right Front Fog          | —                      | ❌      | ✅ confirmé    | Antibrouillard AV droit |
| **16**  | Left Aux Park            | —                      | ❌      | ⚠️ à confirmer | Feux de position gauche |
| **17**  | Right Aux Park           | —                      | ❌      | ⚠️ à confirmer | Feux de position droit |
| **18**  | Left Side Marker         | —                      | ❌      | ✅ confirmé    | Feux latéraux gauche |
| **19**  | Right Side Marker        | —                      | ❌      | ✅ confirmé    | Feux latéraux droit |
| **20**  | Left Side Repeater       | —                      | ❌      | ✅ confirmé    | Répétiteur clignotant gauche |
| **21**  | Right Side Repeater      | —                      | ❌      | ✅ confirmé    | Répétiteur clignotant droit |
| **22**  | Left Rear Turn           | `blink_back_left`      | ✅      | ✅ confirmé    | Clignotant AR gauche |
| **23**  | Right Rear Turn          | `blink_back_right`     | ✅      | ✅ confirmé    | Clignotant AR droit |
| **24**  | Brake Lights             | —                      | ❌      | ✅ confirmé    | Feux stop (les 3 ensemble) |
| **25**  | Left Tail                | `light_left_back`      | ✅      | ✅ confirmé    | Feu signature AR gauche |
| **26**  | Right Tail               | `light_right_back`     | ✅      | ✅ confirmé    | Feu signature AR droit |
| **27**  | Reverse Lights           | —                      | ❌      | ✅ confirmé    | Feux de recul (les 2) |
| **28**  | Rear Fog Lights          | —                      | ❌      | ✅ confirmé    | Feu rond AR (antibrouillard) |
| **29**  | License Plate            | —                      | ❌      | ✅ confirmé    | Éclairage plaque |

### Closures (Ch 30-45) — valeurs commandes (voir CLOSURES.md)

| Channel | Nom officiel xLights     | Notre part ID          | Utilisé | Model 3 | Notes |
|---------|--------------------------|------------------------|---------|---------|-------|
| 30      | Left Falcon Door         | —                      | ❌      | ❌ S/X only | Porte falcon gauche |
| 31      | Right Falcon Door        | —                      | ❌      | ❌ S/X only | Porte falcon droite |
| 32      | Left Front Door          | —                      | ❌      | ❌ S/X only | Porte AV gauche |
| 33      | Right Front Door         | —                      | ❌      | ❌ S/X only | Porte AV droite |
| **34**  | Left Mirror              | `retro_left`           | ✅      | ✅ | Rétroviseur gauche |
| **35**  | Right Mirror             | `retro_right`          | ✅      | ✅ | Rétroviseur droit |
| **36**  | Left Front Window        | `window_left_front`    | ✅      | ✅ | Vitre AV gauche |
| **37**  | Left Rear Window         | `window_left_back`     | ✅      | ✅ | Vitre AR gauche |
| **38**  | Right Front Window       | `window_right_front`   | ✅      | ⬜ à tester | Vitre AV droite |
| **39**  | Right Rear Window        | `window_right_back`    | ✅      | ✅ | Vitre AR droite |
| **40**  | Liftgate                 | `trunk`                | ✅      | ✅ | Coffre |
| 41      | Left Front Door Handle   | —                      | ❌      | ❌ S only | |
| 42      | Left Rear Door Handle    | —                      | ❌      | ❌ S only | |
| 43      | Right Front Door Handle  | —                      | ❌      | ❌ S only | |
| 44      | Rear Rear Door Handle    | —                      | ❌      | ❌ S only | |
| **45**  | Charge Port              | `flap`                 | ✅      | ⬜ à tester | Trappe de charge |
| 46-47   | —                        | —                      | ❌      | — | Pas d'effet connu |

---

## Vérification de notre CHANNEL_MAP (fseqExport.js)

Toutes nos associations sont **conformes** à la spec officielle Tesla :

| Notre part ID          | Nos channels          | Nom officiel correspondant                  | Statut |
|------------------------|-----------------------|---------------------------------------------|--------|
| `light_left_front`     | [0, 2, 4, 6, 8, 10]  | Left Outer/Inner Main Beam + Signature + Ch 4/5/6 | ✅ OK |
| `light_right_front`    | [1, 3, 5, 7, 9, 11]  | Right Outer/Inner Main Beam + Signature + Ch 4/5/6 | ✅ OK |
| `light_left_back`      | [25]                  | Left Tail                                   | ✅ OK |
| `light_right_back`     | [26]                  | Right Tail                                  | ✅ OK |
| `blink_front_left`     | [12]                  | Left Front Turn                             | ✅ OK |
| `blink_front_right`    | [13]                  | Right Front Turn                            | ✅ OK |
| `blink_back_left`      | [22]                  | Left Rear Turn                              | ✅ OK |
| `blink_back_right`     | [23]                  | Right Rear Turn                             | ✅ OK |

---

## Lumières utilisées — Détails par zone

### Phares avant (6 canaux par côté)

```
Gauche : Ch 0 (Outer Main Beam / DRL)
         Ch 2 (Inner Main Beam / feux croisement)
         Ch 4 (Signature / segment haut 1)
         Ch 6 (Channel 4 / segment haut 2)
         Ch 8 (Channel 5 / segment haut 3)
         Ch 10 (Channel 6 / segment haut 4)

Droit :  Ch 1, 3, 5, 7, 9, 11 (symétriques)
```

Dans notre app, les 6 canaux sont groupés en `light_left_front` / `light_right_front` et s'allument/s'éteignent ensemble.

**Note Model 3/Y :** Les canaux 4-6 (Left/Right) sont combinés en une seule sortie physique sur Model 3/Y. L'état on/off est un OR logique : `(Channel 4 || Channel 5 || Channel 6)`. La durée de ramping est définie uniquement par le Channel 4. En pratique, dans notre app, on les allume tous ensemble donc ça ne change rien.

### Clignotants avant

```
Ch 12 : Left Front Turn   → blink_front_left
Ch 13 : Right Front Turn  → blink_front_right
```

### Clignotants arrière

```
Ch 22 : Left Rear Turn    → blink_back_left
Ch 23 : Right Rear Turn   → blink_back_right
```

### Feux arrière (signature)

```
Ch 25 : Left Tail          → light_left_back
Ch 26 : Right Tail         → light_right_back
```

---

## Lumières NON utilisées — Candidats pour expansion future

### Antibrouillards avant (Ch 14-15)

```
fog_left:  Ch 14   — Left Front Fog
fog_right: Ch 15   — Right Front Fog
```

- ⚠️ **Non installés sur Model 3 Standard Range+**
- Présents sur Model 3 Long Range / Performance, Model S, Model X
- Testés et confirmés fonctionnels sur notre Model 3 (donc pas SR+)

### Feux de position / Aux Park (Ch 16-17)

```
aux_park_left:  Ch 16  — Left Aux Park
aux_park_right: Ch 17  — Right Aux Park
```

- ⚠️ **Non installés sur Model 3 Standard Range+**
- **Model 3/Y : tous les Aux Park et Side Markers fonctionnent ensemble**
  → `(Left Side Marker || Left Aux Park || Right Side Marker || Right Aux Park)` = tous ON ou tous OFF
- Pas de contrôle gauche/droite indépendant sur Model 3/Y

### Feux latéraux / Side Markers (Ch 18-19)

```
side_marker_left:  Ch 18  — Left Side Marker
side_marker_right: Ch 19  — Right Side Marker
```

- ⚠️ **Uniquement sur véhicules Amérique du Nord**
- Sur Model 3/Y : OR'd avec Aux Park (voir ci-dessus)
- Testés et confirmés (allument les antibrouillards AV sur notre Model 3)

### Répétiteurs de clignotants (Ch 20-21)

```
side_repeater_left:  Ch 20  — Left Side Repeater
side_repeater_right: Ch 21  — Right Side Repeater
```

- Répétiteurs sur les ailes (petits clignotants latéraux)
- Testés et confirmés fonctionnels

### Feux stop (Ch 24)

```
brake_lights: Ch 24  — Brake Lights
```

- Les 3 feux stop s'allument ensemble (pas de contrôle individuel)
- Testé et confirmé fonctionnel

### Feux de recul (Ch 27)

```
reverse_lights: Ch 27  — Reverse Lights
```

- Les 2 feux de recul s'allument ensemble
- Testé et confirmé fonctionnel

### Antibrouillard arrière (Ch 28)

```
rear_fog: Ch 28  — Rear Fog Lights
```

- ⚠️ **Uniquement sur véhicules hors Amérique du Nord** (+ Model X NA)
- Feu rond AR
- Testé et confirmé fonctionnel

### Éclairage plaque (Ch 29)

```
license_plate: Ch 29  — License Plate
```

- Éclairage de la plaque d'immatriculation
- Testé et confirmé fonctionnel
- **Note Model 3 pre-octobre 2020 :** Left Tail, Right Tail et License Plate fonctionnent ensemble via `(Left Tail || Right Tail)` — le canal License Plate n'a pas d'effet sur ces véhicules.

---

## Comportement des lumières (spec officielle Tesla)

### Lumières booléennes (la plupart)
- La majorité des lumières ne peuvent que s'allumer ou s'éteindre instantanément
- Valeur > 50% (128) = **ON**, valeur ≤ 50% = **OFF**
- Durée minimale pour produire de la lumière : **15ms**
- Durée minimale recommandée (on/off) : **100ms** pour un rendu agréable

### Lumières avec ramping (Ch 0-11 sur certains modèles)
- Certains canaux supportent un allumage/extinction progressif
- La durée de ramp est contrôlée par le type d'effet xLights (pas par la valeur de brightness)
- Channels 4-6 (L/R) : sur Model S/X, contrôle individuel on/off mais ramping partagé (défini par Ch 4). Sur Model 3/Y, les 3 sont combinés en une sortie unique.

### Brightness continu (Cybertruck uniquement)
- Seul le Cybertruck supporte un contrôle de brightness 0-100% continu
- Sur les autres véhicules : brightness > 50% = ON, sinon OFF

---

## Résumé pour l'implémentation future

Si on souhaite ajouter des parts dans l'app, voici les candidats par priorité :

### Priorité haute (bon impact visuel, confirmés fonctionnels)
| Part ID proposé       | Channels | Description | Disponibilité Model 3 |
|-----------------------|----------|-------------|----------------------|
| `side_repeater_left`  | [20]     | Répétiteur clignotant gauche | ✅ Tous |
| `side_repeater_right` | [21]     | Répétiteur clignotant droit | ✅ Tous |
| `brake_lights`        | [24]     | Feux stop (les 3) | ✅ Tous |
| `reverse_lights`      | [27]     | Feux de recul (les 2) | ✅ Tous |

### Priorité moyenne (pas disponible sur tous les Model 3)
| Part ID proposé    | Channels | Description | Disponibilité Model 3 |
|--------------------|----------|-------------|----------------------|
| `fog_left`         | [14]     | Antibrouillard AV gauche | ❌ Pas sur SR+ |
| `fog_right`        | [15]     | Antibrouillard AV droit | ❌ Pas sur SR+ |
| `license_plate`    | [29]     | Éclairage plaque | ✅ (⚠️ OR'd sur pre-2020) |

### Priorité basse (disponibilité limitée ou impact faible)
| Part ID proposé      | Channels     | Description | Disponibilité Model 3 |
|----------------------|--------------|-------------|----------------------|
| `side_markers`       | [16,17,18,19]| Feux de position + latéraux | ⚠️ OR'd ensemble sur 3/Y, NA only pour markers |
| `rear_fog`           | [28]         | Antibrouillard AR | ❌ Hors NA uniquement |

---

## Différences entre modèles Tesla

| Fonctionnalité | Model 3/Y | Model S | Model X | Cybertruck |
|----------------|-----------|---------|---------|------------|
| Ch 4-6 (Signature) | OR'd ensemble | Individuels | Individuels | Full brightness |
| Front Fog (14-15) | ❌ SR+ | ✅ | ✅ | ✅ |
| Aux Park (16-17) | ❌ SR+, OR'd avec markers | ✅ indép. L/R | ✅ | ✅ |
| Side Markers (18-19) | NA only, OR'd avec aux park | ✅ indép. L/R | ✅ | → Rear Side Markers |
| Rear Fog (28) | Hors NA only | ✅ | ✅ NA | ❌ |
| License Plate (29) | ⚠️ pre-2020 OR'd | ✅ | ✅ | ✅ |
| Falcon Doors (30-31) | ❌ | ❌ | ✅ | ❌ |
| Front Doors (32-33) | ❌ | ✅ | ✅ | ❌ |
| Door Handles (41-44) | ❌ | ✅ | ❌ | ❌ |
| Frunk | ❌ | ❌ | ❌ | ✅ (via Ch 40) |
| Light Bar | ❌ | ❌ | ❌ | ✅ (60+52 LEDs) |
| Brightness continu | ❌ | ❌ | ❌ | ✅ |
