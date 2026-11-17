# Tesla Model 3 — Channel Mapping (Retro-engineering)

## Test 1 : Diagnostic channels 0-47 (2s ON / 1s OFF)

Date: 2026-02-13

### Channels AVANT — confirmés (test 1, observés de face)

| Channel | Description                      | Status    |
|---------|----------------------------------|-----------|
| 00      | Rond phare AV gauche (DRL)       | ✅ confirmé |
| 01      | Rond phare AV droit (DRL)        | ✅ confirmé |
| 02      | Feux AV gauche (low beam)        | ✅ confirmé |
| 03      | Feux AV droit (low beam)         | ✅ confirmé |
| 04      | Feux haut AV gauche (seg. 1)     | ✅ confirmé |
| 05      | Feux haut AV droit (seg. 1)      | ✅ confirmé |
| 06      | Feux haut AV gauche (seg. 2)     | ✅ confirmé |
| 07      | Feux haut AV droit (seg. 2)      | ✅ confirmé |
| 08      | Feux haut AV gauche (seg. 3)     | ✅ confirmé |
| 09      | Feux haut AV droit (seg. 3)      | ✅ confirmé |
| 10      | Feux haut AV gauche (seg. 4)     | ✅ confirmé |
| 11      | Feux haut AV droit (seg. 4)      | ✅ confirmé |
| 12      | Clignotant AV gauche             | ✅ confirmé |
| 13      | Clignotant AV droit              | ✅ confirmé |
| 14      | Antibrouillard AV gauche         | ✅ confirmé |
| 15      | Antibrouillard AV droit          | ✅ confirmé |
| 16      | Antibrouillard AV (seg?)         | ⚠️ à confirmer |
| 17      | Antibrouillard AV (seg?)         | ⚠️ à confirmer |

### Channels LATÉRAUX + ARRIÈRE — confirmés (test 2, rear-v2 avec marker DRL)

| Channel | Description                        | Status    |
|---------|------------------------------------|-----------|
| 18      | Antibrouillard AV (les 2)         | ✅ confirmé |
| 19      | Antibrouillard AV (les 2, seg. 2) | ✅ confirmé |
| 20      | Clignotant côté gauche (repeater)  | ✅ confirmé |
| 21      | Clignotant côté droit (repeater)   | ✅ confirmé |
| 22      | Clignotant AR gauche               | ✅ confirmé |
| 23      | Clignotant AR droit                | ✅ confirmé |
| 24      | Feux stop (les 3 ensemble)         | ✅ confirmé |
| 25      | Feu signature AR gauche            | ✅ confirmé |
| 26      | Feu signature AR droit             | ✅ confirmé |
| 27      | Feux de recul (les 2)              | ✅ confirmé |
| 28      | Feu rond AR (antibrouillard AR?)   | ✅ confirmé |
| 29      | Feu plaque d'immatriculation       | ✅ confirmé |
| 30      | (non observé)                      | ❓ inconnu  |
| 31      | (non observé)                      | ❓ inconnu  |

> Note: Ch 18-19 ont allumé les antibrouillards avant, pas des feux arrière.
> Donc les fog lights occupent potentiellement Ch 14-19 (6 channels / segments).

### Channels 32-47 : non testés

Probablement les closures (vitres, rétros, coffre, trappe de charge).
Ces actionneurs mécaniques nécessitent un test spécifique avec des transitions
de valeur (0→255 = ouvrir, 255→0 = fermer).

---

## Mapping consolidé pour l'app

### Phares avant

```
light_left_front  → Ch 0, 2, 4, 6, 8, 10   (DRL + low beam + 4 segments haut gauche)
light_right_front → Ch 1, 3, 5, 7, 9, 11   (DRL + low beam + 4 segments haut droit)
```

### Feux arrière

```
light_left_back   → Ch 22, 25   (clignotant AR gauche + signature gauche)
light_right_back  → Ch 23, 26   (clignotant AR droit + signature droit)
brake_lights      → Ch 24       (les 3 feux stop ensemble)
reverse_lights    → Ch 27       (les 2 feux de recul)
rear_fog          → Ch 28       (feu rond AR)
license_plate     → Ch 29       (éclairage plaque)
```

### Autres lumières

```
turn_signal_front_left   → Ch 12
turn_signal_front_right  → Ch 13
fog_lights               → Ch 14, 15, 16(?), 17(?), 18, 19
turn_signal_side_left    → Ch 20
turn_signal_side_right   → Ch 21
```

---

## TODO

- [ ] Confirmer Ch 16-17 (antibrouillard segments ou autre ?)
- [ ] Identifier Ch 30-31
- [ ] Tester les closures (Ch 32-47) avec un script de transitions
- [x] Mettre à jour le CHANNEL_MAP dans fseqExport.js
