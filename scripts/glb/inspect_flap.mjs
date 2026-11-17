import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

for (const path of [
  'assets/models/model_y_juniper_geo.glb',
]) {
  console.log('\n=====', path, '=====');
  const doc = await io.read(path);
  for (const scene of doc.getRoot().listScenes()) {
    scene.traverse((node) => {
      const name = node.getName();
      if (name !== 'flap') return;
      const mesh = node.getMesh();
      if (!mesh) return;
      console.log('\nMesh:', name);
      const t = node.getTranslation();
      const r = node.getRotation();
      const s = node.getScale();
      console.log('  translation:', t.map(v => v.toFixed(4)).join(', '));
      console.log('  rotation   :', r.map(v => v.toFixed(4)).join(', '));
      console.log('  scale      :', s.map(v => v.toFixed(6)).join(', '));

      let min = [Infinity, Infinity, Infinity];
      let max = [-Infinity, -Infinity, -Infinity];
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;
        const arr = pos.getArray();
        for (let i = 0; i < arr.length; i += 3) {
          const x = arr[i], y = arr[i+1], z = arr[i+2];
          if (x < min[0]) min[0] = x;
          if (y < min[1]) min[1] = y;
          if (z < min[2]) min[2] = z;
          if (x > max[0]) max[0] = x;
          if (y > max[1]) max[1] = y;
          if (z > max[2]) max[2] = z;
        }
      }
      console.log('  bbox min   :', min.map(v => v.toFixed(2)).join(', '));
      console.log('  bbox max   :', max.map(v => v.toFixed(2)).join(', '));
      console.log('  spans      : X=', (max[0]-min[0]).toFixed(2),
                  ' Y=', (max[1]-min[1]).toFixed(2),
                  ' Z=', (max[2]-min[2]).toFixed(2));
    });
  }
}
