# Tesla Light Show Creator

Application mobile permettant aux propriétaires de Tesla de concevoir et exporter des light shows personnalisés, synchronisés avec un son.

---

## Objectif

Créer une app ultra simple pour concevoir des animations lumineuses sur Tesla Model 3, exportables au format Tesla Light Show, sans outil technique complexe.

## Cible

Propriétaires de Tesla souhaitant créer facilement des animations lumière originales.

---

## Fonctionnalités

### V1

- **Vue 3D interactive** — Rotation, zoom, sélection par éléments (phares, feux, clignotants, fenêtres, rétros, coffre, trappe de charge)
- **Gestion du son** — Import audio (mp3), bibliothèque de sons intégrée
- **Timeline** — Ajout d'événements lumineux et mécaniques, synchronisation avec le rythme, navigation tactile fluide
- **Lumières** — Allumage continu, clignotement (3 vitesses), ease in/out, puissance réglable
- **Closures mécaniques** — Rétros (plier/déplier/aller-retour), fenêtres (dance), coffre (ouvrir/fermer/dance), trappe de charge (ouvrir/fermer/LED rainbow)
- **Limites Tesla** — Compteur d'utilisations par closure, blocage automatique quand le max est atteint
- **Export FSEQ** — Génération du fichier `.fseq` V2 compatible Tesla Light Show (lumières + closures)
- **Sauvegarde** — Projets sauvegardés localement, multi-shows

### V2+

- Partage des créations avec la communauté
- Galerie / découverte de light shows
- Import/export avancé, presets, packs premium

## Différenciation

Seule app native stable et multilangues. Approche créative, visuelle, grand public.

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Framework | React Native / Expo SDK 54 |
| 3D | Three.js + expo-three + expo-gl |
| Gestes | react-native-gesture-handler |
| Modèle 3D | GLB (géométrie seule, sans textures) |
| Outillage 3D | gltf-transform (inspection + strip textures) |

## UX / UI

- UX extrêmement simple, zéro friction
- UI premium, minimaliste, "Apple-like"
- Tout doit être compréhensible sans tutoriel

## Contraintes techniques

- Pas de backend obligatoire (V1)
- Logique locale, POC orienté expérience utilisateur
- Modèle 3D optimisé (low-poly, meshes séparés par éléments)
- Pas de textures embarquées dans le GLB (incompatible React Native)

---

## Installation

### Prérequis

- **Node.js** >= 18
- **npm**
- **Android Studio** avec un émulateur ou un appareil Android connecté (USB debug activé)
- **Expo CLI** : `npm install -g expo-cli`
- **gltf-transform CLI** (optionnel, pour le pipeline 3D) : `npm install -g @gltf-transform/cli`

### Setup

```bash
# Cloner le repo
git clone <repo-url>
cd tesla-3d-viewer

# Installer les dépendances
npm install

# Lancer sur Android
npx expo run:android
```

### Lancer sur émulateur / appareil

```bash
# Démarrer le serveur de dev
npx expo start

# Ou directement sur Android
npx expo run:android
```

---

## Structure du projet

```
tesla-3d-viewer/
├── App.js                    # Point d'entrée
├── src/
│   ├── ModelViewer.js        # Composant 3D principal (Three.js + gestes)
│   ├── AudioTimeline.js      # Timeline audio + événements drag & drop
│   ├── PartOptionsPanel.js   # Panneau d'options par pièce (lumières + closures)
│   ├── fseqExport.js         # Export FSEQ V2 (lumières + closures)
│   ├── constants.js          # Constantes partagées (parts, modes, limites)
│   ├── storage.js            # Sauvegarde/chargement des shows
│   ├── audioPicker.js        # Import audio + waveform
│   ├── ExportModal.js        # Modal d'export
│   └── i18n/                 # Traductions (fr, en, es, de)
├── assets/
│   ├── models/               # Modèles 3D GLB
│   ├── icons/                # Icônes par pièce
│   └── mp3/                  # Bibliothèque de sons intégrée
├── CLOSURES.md               # Doc closures : channels, commandes, limites
├── FSEQ_SPEC.md              # Spécifications format FSEQ V2
├── GLB_PIPELINE.md           # Workflow intégration modèle 3D
├── metro.config.js           # Support des fichiers .glb dans Metro
├── app.json                  # Config Expo
└── package.json
```

---

## Pipeline 3D (nouveau modèle)

Voir [`GLB_PIPELINE.md`](./GLB_PIPELINE.md) pour le workflow complet.

Résumé :

```
Blender (export GLB avec nodes nommés)
  → assets/models/<fichier>.glb
  → node inspect_model.mjs (inspecter + strip textures → _geo.glb)
  → Mettre à jour src/ModelViewer.js (require + partMaterials)
  → npx expo run:android (tester)
```

---

## Meshes interactifs (convention de nommage Blender)

| Pièce                  | Nom du node Blender    |
|------------------------|------------------------|
| Fenêtre avant gauche   | `window_left_front`    |
| Fenêtre avant droite   | `window_right_front`   |
| Fenêtre arrière gauche | `window_left_back`     |
| Fenêtre arrière droite | `window_right_back`    |
| Rétroviseur gauche     | `retro_left`           |
| Rétroviseur droit      | `retro_right`          |
| Trappe de charge       | `flap`                 |
| Coffre                 | `trunk`                |
| Phare avant gauche     | `light_left_front`     |
| Phare avant droit      | `light_right_front`    |
| Phare arrière gauche   | `light_left_back`      |
| Phare arrière droit    | `light_right_back`     |

---

## Documentation

| Document | Description |
|----------|-------------|
| [`CLOSURES.md`](./CLOSURES.md) | Channels FSEQ des closures (rétros, fenêtres, coffre, trappe), commandes, limites, résultats de rétro-ingénierie |
| [`FSEQ_SPEC.md`](./FSEQ_SPEC.md) | Spécifications du format FSEQ V2 pour l'export Tesla Light Show |
| [`GLB_PIPELINE.md`](./GLB_PIPELINE.md) | Workflow pour intégrer un nouveau modèle 3D GLB |

## Liens utiles

- [Tesla Light Show Validator](https://validator.t2k.dev)
- [Tesla Light Show (repo officiel)](https://github.com/teslamotors/light-show)

## Licence

Projet privé.
