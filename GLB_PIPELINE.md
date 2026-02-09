# Pipeline GLB → App React Native

Ce document décrit le workflow complet pour intégrer un nouveau fichier GLB dans l'app Tesla 3D Viewer.

---

## Étape 1 : Placer le fichier GLB

Placer le fichier `.glb` exporté depuis Blender dans :

```
assets/models/<nom_du_fichier>.glb
```

---

## Étape 2 : Inspecter les meshes

Modifier le fichier `inspect_model.mjs` pour pointer vers le nouveau GLB :

```js
const doc = await io.read('assets/models/<nom_du_fichier>.glb');
```

Puis lancer :

```bash
node inspect_model.mjs
```

Cela affiche :
- L'arbre des **nodes** avec leurs noms et les meshes associés
- La taille du fichier strippé en sortie

**Important** : Le `child.name` utilisé dans le code Three.js correspond au **nom du node** (pas du mesh).

### Convention de nommage des nodes dans Blender

| Pièce                  | Nom du node attendu    |
|------------------------|------------------------|
| Carrosserie            | `s_0072` (ou autre)    |
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

## Étape 3 : Stripper les textures

Le script `inspect_model.mjs` fait automatiquement le strip des textures et génère un fichier `_geo.glb`.

Il faut aussi mettre à jour la ligne d'écriture dans le script :

```js
await io.write('assets/models/<nom_du_fichier>_geo.glb', doc);
```

**Pourquoi ?** React Native ne supporte pas le chargement de textures embarquées dans un GLB (erreur `Blob from ArrayBuffer not supported`). On supprime les textures et on applique des matériaux programmatiques dans le code.

Le fichier `_geo.glb` résultant ne contient que la géométrie (typiquement < 300 Ko).

---

## Étape 4 : Mettre à jour le code

Dans `src/ModelViewer.js`, modifier la ligne de chargement :

```js
const asset = Asset.fromModule(require('../assets/models/<nom_du_fichier>_geo.glb'));
```

Puis mettre à jour le dictionnaire `partMaterials` avec les noms des nodes trouvés à l'étape 2 :

```js
const partMaterials = {
  window_left_front: new THREE.MeshStandardMaterial({ color: 0x..., ... }),
  // ... ajouter chaque node avec son matériau
};
```

Tout mesh dont le `child.name` n'est pas dans `partMaterials` reçoit le `bodyMaterial` (carrosserie).

---

## Étape 5 : Tester

```bash
npx expo run:android
```

Vérifier que :
- Le modèle s'affiche correctement
- Chaque pièce a la bonne couleur
- La palette de couleurs change bien la carrosserie
- Les gestes (rotation / zoom) fonctionnent

---

## Résumé du pipeline

```
[Blender] Export GLB avec nodes nommés
    ↓
[assets/models/] Placer le .glb
    ↓
[inspect_model.mjs] Inspecter nodes + strip textures → _geo.glb
    ↓
[src/ModelViewer.js] Mettre à jour require() + partMaterials
    ↓
[npx expo run:android] Tester
```

---

## Contraintes React Native / Three.js

- **Pas de textures embarquées** : Blob from ArrayBuffer non supporté dans RN
- **Pas de compression Draco/meshopt** : décodeurs incompatibles avec RN
- **Pas de WebP** : même raison
- **Chargement** : `expo-asset` → `fetch(localUri)` → `arrayBuffer()` → `GLTFLoader.parse()`
- **Taille max recommandée** : < 1-2 Mo pour le GLB (idéalement < 300 Ko sans textures)
- **Metro config** : `metro.config.js` doit inclure `glb` dans `assetExts`
