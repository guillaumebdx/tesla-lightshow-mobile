# Tesla Model Y Juniper — LightShow Studio Reference

> Source : rétro-ingénierie du repo officiel [teslamotors/light-show](https://github.com/teslamotors/light-show) + code source [xLightsSequencer/xLights](https://github.com/xLightsSequencer/xLights).  
> Toutes les données ci-dessous sont extraites directement des fichiers `xlights_rgbeffects.xml`, `xlights_networks.xml`, `validator.py` et du `README.md` du repo Tesla.

---

## 1. Vue d'ensemble — Ce que le Model Y Juniper PEUT faire

Le Model Y Juniper (MYJ, 2024+) est la première génération de Model Y à supporter le même protocole de lightshow que le Cybertruck. Concrètement, il ajoute :

- **Barre lumineuse avant** (front light bar) — 60 LEDs individuelles, blanc uniquement, contrôle de luminosité
- **Barre lumineuse arrière** (rear light bar) — 52 LEDs individuelles, rouge uniquement, contrôle de luminosité
- **Éclairage ambiance intérieur RGB** — 5 segments avec contrôle de couleur complet (R, G, B)

Les 46 premiers canaux sont partagés avec tous les Tesla et couvrent phares, feux de position, clignotants, feux arrière, et éléments mobiles (closures).

---

## 2. Format de fichier FSEQ

| Propriété | Valeur |
|---|---|
| Format | FSEQ v2.0 ou v2.2, **non compressé** (V2 Uncompressed dans xLights) |
| Nombre de canaux | **200** (obligatoire pour le MYJ avec barres lumineuses et RGB) |
| Intervalle de frame | 15 ms à 100 ms — **20 ms recommandé** |
| Durée max | **4 heures** |
| Audio | `.wav` (44.1 kHz recommandé) ou `.mp3` |
| Dossier USB | `LightShow/lightshow.fseq` + `LightShow/lightshow.wav` |

> **Note pour l'agent :** le validator.py de Tesla vérifie `channel_count == 48 OR 200`. Pour le MYJ, utiliser obligatoirement 200 canaux.

---

## 3. Mapping complet des canaux

Les numéros de canaux sont **1-indexés** (comme dans xLights). Dans le fichier FSEQ binaire, le canal 1 = byte 0 du frame.

### 3.1 Phares avant

| Canal | Nom xLights | Côté | Comportement MYJ | Notes |
|---|---|---|---|---|
| 1 | Left Outer Main Beam | Gauche | **Ramping** (réflecteur LED) / Boolean (projecteur) | Feu de croisement extérieur |
| 2 | Right Outer Main Beam | Droite | idem | |
| 3 | Left Inner Main Beam | Gauche | **Ramping** | Feu de croisement intérieur |
| 4 | Right Inner Main Beam | Droite | **Ramping** | |
| 5 | Left Signature | Gauche | **Ramping** | DRL / signature lumineuse — Ramping sur Model 3/Y (Boolean sur Model S/X) |
| 6 | Right Signature | Droite | **Ramping** | |
| 7 | Left Channel 4 | Gauche | **Ramping** | Canaux 4-6 **fusionnés** sur MYJ (OR logique) |
| 8 | Right Channel 4 | Droite | **Ramping** | Channel 4 = maître de la durée de ramping pour 4/5/6 |
| 9 | Left Channel 5 | Gauche | **Ramping** | Fusionné avec 4 et 6 sur le véhicule |
| 10 | Right Channel 5 | Droite | **Ramping** | |
| 11 | Left Channel 6 | Gauche | **Ramping** | Fusionné avec 4 et 5 |
| 12 | Right Channel 6 | Droite | **Ramping** | |
| 13 | Left Front Turn | Gauche | **Ramping** | Clignotant avant gauche |
| 14 | Right Front Turn | Droite | **Ramping** | |
| 15 | Left Front Fog | Gauche | Boolean | Antibrouillard avant — absent sur Model 3 Standard Range+ |
| 16 | Right Front Fog | Droite | Boolean | |

### 3.2 Feux de position et répétiteurs

| Canal | Nom xLights | Côté | Comportement MYJ | Notes |
|---|---|---|---|---|
| 17 | Left Aux Park | Gauche | Boolean | Position auxiliaire — absent sur Model 3 SR+ |
| 18 | Right Aux Park | Droite | Boolean | Sur MYJ : Aux Park + Side Marker partagent la même sortie physique (OR logique) |
| 19 | Left Side Marker | Gauche | Boolean | Feux de gabarit latéraux — Amérique du Nord uniquement |
| 20 | Right Side Marker | Droite | Boolean | |
| 21 | Left Side Repeater | Gauche | Boolean | Répétiteur de clignotant côté gauche |
| 22 | Right Side Repeater | Droite | Boolean | |

### 3.3 Feux arrière

| Canal | Nom xLights | Côté | Comportement MYJ | Notes |
|---|---|---|---|---|
| 23 | Left Rear Turn | Gauche | Boolean | Clignotant arrière — Boolean sur MYJ (vs Full Brightness CT) |
| 24 | Right Rear Turn | Droite | Boolean | |
| 25 | Brake Lights | Centre | Boolean | Feux de frein — Boolean sur MYJ (vs Full Brightness CT) |
| 26 | Left Tail | Gauche | Boolean | Feu arrière gauche |
| 27 | Right Tail | Droite | Boolean | |
| 28 | Reverse Lights | Centre | Boolean | Feux de recul |
| 29 | Rear Fog Lights | Centre | Boolean | Antibrouillard arrière — **hors Amérique du Nord uniquement** (sauf Model X NA) |
| 30 | License Plate | Centre | Boolean | Feux de plaque d'immatriculation (2 LEDs) |

### 3.4 Closures (éléments mobiles)

| Canal | Nom xLights | Support MYJ | Limite d'actionnements | Support Dance | Durée approx. |
|---|---|---|---|---|---|
| 31 | Left Falcon Door | ❌ Model X uniquement | — | — | — |
| 32 | Right Falcon Door | ❌ Model X uniquement | — | — | — |
| 33 | Left Front Door | ❌ Model X uniquement | — | — | — |
| 34 | Right Front Door | ❌ Model X uniquement | — | — | — |
| 35 | Left Mirror | ✅ | 20 | ❌ | ~2 s |
| 36 | Right Mirror | ✅ | 20 | ❌ | ~2 s |
| 37 | Left Front Window | ✅ | 6 | ✅ | ~4 s |
| 38 | Left Rear Window | ✅ | 6 | ✅ | ~4 s |
| 39 | Right Front Window | ✅ | 6 | ✅ | ~4 s |
| 40 | Right Rear Window | ✅ | 6 | ✅ | ~4 s |
| 41 | Liftgate | ✅ (power liftgate) | 6 | ✅ | Open ~14 s / Close ~4 s |
| 42 | Left Front Door Handle | ❌ Model S uniquement | — | — | — |
| 43 | Left Rear Door Handle | ❌ Model S uniquement | — | — | — |
| 44 | Right Front Door Handle | ❌ Model S uniquement | — | — | — |
| 45 | Right Rear Door Handle | ❌ Model S uniquement | — | — | — |
| 46 | Charge Port | ✅ | 3 | ✅ (flash arc-en-ciel) | ~2 s |

#### Commandes de closure (valeurs de luminosité xLights)

| Commande | Luminosité effet | Raccourci xLights |
|---|---|---|
| Idle | vide | — |
| Open | ~25% | Q |
| Dance | ~50% | A |
| Close | ~75% | Z |
| Stop | 100% | F |

> **Règle critique :** pour les closures (sauf Windows), un état **Open doit précéder Dance**. Compter la durée d'ouverture avant de placer Dance.  
> **Limite thermique :** ne pas dépasser ~30 s de Dance par closure sur toute la durée du show.

---

## 4. Barre lumineuse avant — Front Light Bar (MYJ)

> Canaux 47–106 | **60 LEDs individuelles** (30 gauche + 30 droite) | **Blanc uniquement** | Contrôle de luminosité par LED

### Segmentation

| Segment xLights | Canaux | LEDs |
|---|---|---|
| Front Light Bar / left (portion angled gauche) | sous-ensemble de 47–76 | variable |
| Front Light Bar / center | sous-ensemble de 47–76 + 77–106 | variable |
| Front Light Bar / right (portion angled droite) | sous-ensemble de 77–106 | variable |
| Left Front Light Bar (complet) | **47–76** | 30 |
| Right Front Light Bar (complet) | **77–106** | 30 |

### Comportement

- Couleur : **blanc uniquement** (pas de contrôle RGB)
- Chaque LED = 1 canal d'1 byte → luminosité de 0 (éteint) à 255 (100%)
- Effets xLights recommandés : **Curtain, Bars, Marble, Morph, On**
- Possible de contrôler chaque LED individuellement pour des effets Knight Rider
- Les effets se diffusent légèrement sur le vrai véhicule (diffusion optique)

### Accès dans xLights

```
Front Light Bar
  ├── left
  ├── center
  └── right
       └── [double-clic pour accès LED par LED]
```

---

## 5. Barre lumineuse arrière — Rear Light Bar (MYJ)

> Canaux 111–162 | **52 LEDs individuelles** (26 gauche + 26 droite) | **Rouge uniquement** | Contrôle de luminosité par LED

### Segmentation

| Segment xLights | Canaux | LEDs |
|---|---|---|
| Left Rear Light Bar | **111–136** | 26 |
| Right Rear Light Bar | **137–162** | 26 |
| Rear Light Bar / left | segment retenu pour compat. | ~vide |
| Rear Light Bar / center | **totalité des 52 LEDs** | 52 |
| Rear Light Bar / right | segment retenu pour compat. | ~vide |

> ⚠️ **Note de rétro-ingénierie :** sur les anciens shows (pre-2024), 4 LEDs étaient assignées aux segments left/right de la barre arrière par erreur. Ces segments existent dans le projet xLights mais sont vides pour la compatibilité descendante. Sur le MYJ, la totalité des 52 LEDs est dans le segment "center".

### Comportement

- Couleur : **rouge uniquement** (pas de contrôle RGB)
- Chaque LED = 1 canal, luminosité 0–255
- Mêmes effets xLights recommandés que la barre avant

---

## 6. Éclairage intérieur RGB

> Canaux 176–193 | **Contrôle RGB complet** | Applicable sur MYJ avec Interior Accent Lights

### Segments

| Canal | Nom xLights | R | G | B | Description |
|---|---|---|---|---|---|
| 176 | Center Front Display | 176 | 177 | 178 | Écran central — très lumineux, éclaire tout l'habitacle |
| 179 | Right Rear RGB | 179 | 180 | 181 | Bandeau ambiance arrière droit |
| 182 | Right Front RGB | 182 | 183 | 184 | Bandeau ambiance avant droit |
| 185 | Center Front RGB | 185 | 186 | 187 | Bandeau ambiance central avant |
| 188 | Left Front RGB | 188 | 189 | 190 | Bandeau ambiance avant gauche |
| 191 | Left Rear RGB | 191 | 192 | 193 | Bandeau ambiance arrière gauche |

Chaque segment = **3 bytes consécutifs** (R, G, B) dans le frame FSEQ.

### Comportement

- Couleurs : **toutes couleurs possibles** (contrôle RGB 8 bits par segment)
- Le Center Front Display est **plus lumineux** que les bandeaux accent
- Visible depuis l'extérieur même vitres fermées
- Effets xLights recommandés : **Color Wash, On** (avec value curves pour transitions douces)
- Les 6 segments sont groupés dans "All Interior RGB" dans xLights (double-clic pour accès individuel)

---

## 7. Canaux spécifiques Cybertruck — Non présents sur MYJ

| Canaux | Nom | Raison d'absence |
|---|---|---|
| 167–172 | Offroad Light Bar | Accessoire CT exclusif (6 segments) |
| 175 | Suspension | Suspension pneumatique CT uniquement |
| Frunk éclairage | CT Frunk Light | CT uniquement — Liftgate ch 41 = hayon sur MYJ |

---

## 8. Règles de contrôle et limites

### 8.1 Ramping (Channels avec progressivité)

| Commande | Luminosité effet | Raccourci |
|---|---|---|
| Turn off; Instant | 0% (vide) | — |
| Turn off; 500 ms | 10% | W |
| Turn off; 1000 ms | 20% | S |
| Turn off; 2000 ms | 30% | X |
| Turn on; 500 ms | 70% | E |
| Turn on; 1000 ms | 80% | D |
| Turn on; 2000 ms | 90% | C |
| Turn on; Instant | 100% | F |

**Canaux avec Ramping sur MYJ :**
- Outer Main Beam (réflecteur LED), Inner Main Beam, Signature, Channels 4-6, Front Turn

**Canaux Boolean sur MYJ** (0% ou 100% uniquement) :
- Front Fog, Aux Park, Side Marker, Side Repeater, Rear Turn, Brake, Tail, Reverse, Rear Fog, License Plate

### 8.2 Durée minimale

- **On time minimum** : 15 ms pour qu'une lumière s'allume
- **Recommandé** : 100 ms minimum on/off pour un effet visible

### 8.3 Canaux 4-6 — comportement spécial sur MYJ

Les canaux 4, 5 et 6 (gauche ET droite) sont **tous fusionnés** sur une seule sortie physique sur le Model 3/Y/Juniper :
- La logique est **OU** : si l'un des 6 channels est ON → la lumière s'allume
- **Channel 4 est le maître** : la durée de ramping est dictée par l'effet placé sur Channel 4, même si seuls Ch5 ou Ch6 sont actifs
- Pour que la lumière clignote, il faut un **temps vide simultané** sur TOUS les channels 4, 5, 6 (gauche et droite)

### 8.4 Aux Park + Side Markers — comportement spécial sur MYJ

Sur Model 3/Y/Juniper, tous les aux park et side markers (ch 17, 18, 19, 20) sont fusionnés sur une sortie unique :
- Activé si `(Left Side Marker OR Left Aux Park OR Right Side Marker OR Right Aux Park)`

---

## 9. Ce que le MYJ NE peut PAS faire

| Fonctionnalité | Raison |
|---|---|
| Door Handles animés | Absents physiquement (sans poignées rétractables comme Model S) |
| Falcon Doors | Model X uniquement |
| Front Doors animées | Model X uniquement |
| Rear light bar en couleur | Uniquement rouge, pas de RGB |
| Front light bar en couleur | Uniquement blanc, pas de RGB |
| Offroad Light Bar | Cybertruck uniquement |
| Suspension pneumatique | Cybertruck uniquement |
| Brake Light en dégradé | Boolean seulement (pas Full Brightness Control comme CT) |
| Rear Turn en dégradé | Boolean seulement |
| Antibrouillard arrière (NA) | Absent sur véhicules Amérique du Nord |

---

## 10. Récapitulatif consolidé pour l'agent IA

### Format de données attendu

```
Fichier FSEQ : 200 canaux, V2 Uncompressed, frame 20ms
Chaque frame = tableau de 200 bytes (valeurs 0–255)
Canal N → byte N-1 dans le frame (0-indexed)
```

### Catégories de canaux

```
Canaux  1–30  : Lumières extérieures (phares, feux, clignotants)
Canaux 31–46  : Closures (miroirs, vitres, liftgate, charge port)
Canaux 47–106 : Front Light Bar (60 LEDs blanches individuelles)
                 Left: 47–76 | Right: 77–106
Canaux 107–110: Réservés (compat. arrière)
Canaux 111–162: Rear Light Bar (52 LEDs rouges individuelles)
                 Left: 111–136 | Right: 137–162
Canaux 163–166: Réservés
Canaux 167–172: Offroad Light Bar — CT ONLY (6 segments)
Canaux 173–174: Réservés
Canal  175    : Suspension — CT ONLY
Canaux 176–178: Center Front Display (RGB)
Canaux 179–181: Right Rear Interior RGB
Canaux 182–184: Right Front Interior RGB
Canaux 185–187: Center Front Interior RGB
Canaux 188–190: Left Front Interior RGB
Canaux 191–193: Left Rear Interior RGB
Canaux 194–200: Réservés (padding)
```

### Règles de génération

1. **Lumières booléennes** : byte = 0 (OFF) ou 255 (ON). Toute valeur > 127 = ON sur MYJ pour ces canaux.
2. **Ramping** : utiliser les valeurs encodées (0, 25, 51, 76, 178, 204, 229, 255) correspondant aux 8 états de ramping.
3. **Light bars** : valeur 0–255 = luminosité 0–100% pour chaque LED individuelle.
4. **Interior RGB** : byte R + byte G + byte B pour chaque segment (valeurs 0–255 chacune).
5. **Closures** : valeurs encodées (Open ≈ 64, Dance ≈ 128, Close ≈ 192, Stop = 255, Idle = 0).
6. **Channels 4-6 MYJ** : toujours inclure un effet de ramping sur Channel 4 (ch 7 ou 8) même si seuls Ch5/Ch6 sont actifs.
7. **Durée minimale** : tout événement < 15 ms sera ignoré par le véhicule.

### Groupes xLights utiles pour séquençage

| Groupe | Contenu | Usage recommandé |
|---|---|---|
| GRP Outer Main Beams | Ch 1+2 | Phares principaux synchronisés |
| GRP Inner Main Beams | Ch 3+4 | |
| GRP Signatures | Ch 5+6 | DRL / signatures |
| All Channel 4-6 | Ch 7–12 | Ambiance avant |
| GRP Turns (Front) | Ch 13+14 | Clignotants avant sync |
| GRP Fogs (Front) | Ch 15+16 | Antibrouillards |
| GRP Tail Lights | Ch 26+27 | Feux arrière |
| GRP Turns (Rear) | Ch 23+24 | Clignotants arrière |
| All Mirrors | Ch 35+36 | |
| All Windows | Ch 37–40 | |
| All Front Lightbars | Ch 47–106 | Barre avant complète |
| All Rear Lightbars | Ch 111–162 | Barre arrière complète |
| All Interior RGB | Ch 176–193 | Ambiance intérieure |

---

## 11. Données de timing closures (référence complète)

| Closure | Durée ouverture | Durée fermeture |
|---|---|---|
| Liftgate | ~14 s | ~4 s |
| Windows | ~4 s | ~4 s |
| Mirrors | ~2 s | ~2 s |
| Charge Port | ~2 s | ~2 s |

---

## 12. Références source

- `tesla_xlights_show_folder/xlights_rgbeffects.xml` — définitions de tous les modèles et channels
- `tesla_xlights_show_folder/xlights_networks.xml` — configuration du contrôleur (max 200 canaux)
- `validator.py` — validation du fichier FSEQ (channel_count == 48 ou 200, compression == 0)
- `README.md` — documentation officielle Tesla (tableaux de brightess control, closures, light bars)
- Cross-vehicle mappings `cross_vehicle_mapping_1-5.xmap` — mapping pour shows multi-véhicules (jusqu'à 5 voitures simultanées)

---

## 13. Anomalie observée en conditions réelles — Light bars ne s'allument pas

> ⚠️ **Section basée sur un seul test terrain (avril 2026)** — certaines conclusions sont **spéculatives** et marquées comme telles. À confirmer avec davantage de retours.

### 13.1 Symptômes

Sur un Model Y Juniper réel, un FSEQ exporté par LightShow Studio a été testé. Inspection image par image du FSEQ (200 canaux, 6050 frames à 20 ms = 121 s) :

| Timestamp | Canaux à 255 | Résultat sur le véhicule |
|---|---|---|
| t=12 s | barre avant (47–106) **seule** | ❌ barre éteinte |
| t=38 s | barre avant (47–106) + phares avant (1–14) | ✅ barre allumée |
| t=56 s | barre arrière (111–162) **seule** | ❌ barre éteinte |
| t=85 s | barre arrière (111–162) + feux arrière (ch 23, 24, 26–30) | ❌ barre éteinte |

**Pattern observé :** la barre avant ne s'allume que lorsque les canaux 1–14 (phares + DRL) sont aussi actifs simultanément. Pour la barre arrière, même en accompagnement de feux arrière, elle est restée éteinte dans ce test — résultat à confirmer avec d'autres retours.

### 13.2 Hypothèse de power-gating par l'ECU (SPÉCULATIF)

> Cette sous-section est une **interprétation** des observations. Aucune source Tesla officielle ne documente ce comportement.

Interprétation plausible : le firmware Juniper applique un **power-gating** sur les barres lumineuses — elles ne reçoivent du courant que si l'ECU des phares (avant) ou des feux arrière (arrière) est déjà en état "on". Écrire 255 sur les octets 47–106 sans réveiller l'ECU via les canaux de phares laisserait la barre hors tension.

Sur le Juniper, la barre avant est **physiquement intégrée au bloc phare/signature** (pas un module indépendant). Il est donc plausible que la ligne d'alimentation soit commune, et que le microcontrôleur du phare n'alimente pas les LEDs de la barre s'il est en "sleep".

### 13.3 Contournement appliqué (commit à venir)

`src/fseqExport.js` co-écrit des canaux "enabler" en même temps que les barres, pour réveiller l'ECU :

- `light_center_front` (barre avant) → écrit aussi les canaux **Left Signature (ch 5) + Right Signature (ch 6)**
- `light_center_back` (barre arrière) → écrit aussi les canaux **Left Tail (ch 26) + Right Tail (ch 27)**

Cela reproduit la configuration qui a fonctionné à t=38 s dans le test. Sur le Juniper, le DRL signature ET la barre avant sont la même zone physique : les allumer ensemble est cohérent visuellement.

### 13.4 Ce qui a été écarté pendant l'investigation

| Hypothèse testée | Conclusion |
|---|---|
| Luminosité trop forte (écrire 255 trop haut) | ❌ faux. L'échelle xLights `Max=400` signifie que la valeur `0.25` d'une value curve = 100 % = octet 255. L'exemple officiel Tesla Cyber Symphony écrit la pleine luminosité sur les barres. |
| Mauvais intervalle de frame | ❌ notre step de 20 ms correspond exactement au `<sequenceTiming>20 ms</sequenceTiming>` du xsq officiel. |
| Mauvais mapping de canaux | ❌ conforme à 100 % à `xlights_rgbeffects.xml` (front bar 47–106, rear bar 111–162, StringType "Node Single Color"). |
| "Sequence Element Mismatch" bloque la lecture | ❌ c'est un warning **de l'éditeur xLights** lors du chargement d'anciens shows — il n'empêche pas le FSEQ de jouer sur le véhicule. |

### 13.5 Sources

- Inspection binaire du FSEQ généré : `test/real_life/lightshow.fseq` + video du propriétaire du véhicule
- [teslamotors/light-show README](https://github.com/teslamotors/light-show) — confirmation du fait que les barres avant/arrière sont mappées sur des canaux "Node Single Color" (1 octet par LED)
- [Discussion TMC "New MY Juniper light show issue"](https://teslamotorsclub.com/tmc/threads/new-my-juniper-light-show-issue.347083/) — confirme que d'autres utilisateurs rapportent "seule la barre avant s'allume" dans certaines conditions d'activation
- [Issue GitHub #166 "new model y 2025"](https://github.com/teslamotors/light-show/issues/166) — issue ouverte sur le repo officiel concernant le support Juniper
- Exemple officiel Tesla `tesla_ex7.zip` → `cyber_symphony.xsq` (décembre 2024) — utilisé pour vérifier les value curves et la timeline canonique

### 13.6 À faire pour confirmer

- Récupérer un FSEQ Juniper-only vérifié comme fonctionnel (hors app TLGen) pour comparaison octet par octet
- Obtenir plus de retours de propriétaires de Model Y Juniper après déploiement du contournement 13.3
- Tester la valeur minimale non-nulle sur les canaux enabler (255 a été retenu par défaut mais 1 suffit peut-être à réveiller l'ECU)
