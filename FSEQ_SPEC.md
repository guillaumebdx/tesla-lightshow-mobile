# FSEQ V2 — Spécifications pour l'export Tesla Light Show

## Format de sortie
- **Fichier** : `.fseq` (FSEQ V2, non compressé)
- **Frame interval** : **20 ms** fixe (recommandé par Tesla) → 50 FPS
- **Pas de compression** dans un premier temps

## Modèle de données
- **Aucune notion d'événement, durée, fade ou pattern dans le format**
- Le fichier contient uniquement une **suite de frames indexées**
- Chaque frame = un tableau de **valeurs byte (0–255)**, une par channel
- → Matrice finale : `[frame][channel] → value (0-255)`

## Compilation
Tout ce qui est "durée", "blink", "fade", "pattern", "BPM" dans la timeline
doit être **compilé en amont** en valeurs frame-par-frame avant l'export.

Exemple : un "allumage 500ms" sur le phare AV gauche à t=2000ms :
- Frame 100 à 124 (500ms / 20ms = 25 frames)
- Channel du phare AV gauche = valeur 255 sur ces 25 frames
- Toutes les autres frames de ce channel = 0

## Channels
- Le **mapping élément logique → index de channel** est fixe par modèle Tesla
- Ce mapping est résolu **uniquement à l'export**, jamais dans la timeline
- La timeline travaille avec des noms logiques (`light_left_front`, etc.)
- L'exporteur traduit ces noms en indices de channels FSEQ

## Règles importantes
1. Chaque état doit être **réécrit à chaque frame** où il est actif
2. Pas de "state machine" dans le format — tout est explicite frame par frame
3. Un channel non mentionné dans une frame = 0 (éteint)
4. La durée totale du fichier = nombre de frames × 20ms = durée de la musique

## Implications pour la timeline
- La timeline stocke des **événements logiques** (partie, type d'effet, paramètres)
- Le moteur de compilation transforme ces événements en matrice [frame][channel]
- L'export sérialise cette matrice en binaire FSEQ V2
