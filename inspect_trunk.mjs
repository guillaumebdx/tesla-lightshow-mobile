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
      if (name !== 'trunk') return;
      const mesh = node.getMesh();
      if (!mesh) return;
      console.log('\nMesh:', name);
      const t = node.getTranslation();
      const r = node.getRotation();
      const s = node.getScale();
      console.log('  translation:', t.map(v => v.toFixed(4)).join(', '));
      console.log('  rotation   :', r.map(v => v.toFixed(4)).join(', '));
      console.log('  scale      :', s.map(v => v.toFixed(6)).join(', '));

      // Aggregate bbox and all vertices
      let min = [Infinity, Infinity, Infinity];
      let max = [-Infinity, -Infinity, -Infinity];
      const allVerts = [];
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
          allVerts.push([x, y, z]);
        }
      }
      console.log('  bbox min   :', min.map(v => v.toFixed(2)).join(', '));
      console.log('  bbox max   :', max.map(v => v.toFixed(2)).join(', '));
      console.log('  vertex count:', allVerts.length);

      // Find top-Y vertices (top 5% of Y range)
      const ySpan = max[1] - min[1];
      const topY = max[1] - ySpan * 0.05;
      const topVerts = allVerts.filter(v => v[1] >= topY);
      console.log('\n  Top 5% Y vertices (hinge candidates):', topVerts.length);
      if (topVerts.length > 0) {
        let sumX = 0, sumZ = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const v of topVerts) {
          sumX += v[0]; sumZ += v[2];
          if (v[0] < minX) minX = v[0];
          if (v[0] > maxX) maxX = v[0];
          if (v[2] < minZ) minZ = v[2];
          if (v[2] > maxZ) maxZ = v[2];
        }
        console.log('    avg X:', (sumX / topVerts.length).toFixed(2), 'range:', minX.toFixed(2), '..', maxX.toFixed(2));
        console.log('    avg Z:', (sumZ / topVerts.length).toFixed(2), 'range:', minZ.toFixed(2), '..', maxZ.toFixed(2));
      }

      // Also: Find min-X vertices (front-most in local)
      const xSpan = max[0] - min[0];
      const frontX = min[0] + xSpan * 0.05;
      const frontVerts = allVerts.filter(v => v[0] <= frontX);
      console.log('\n  Bottom 5% X vertices (front/cabin side):', frontVerts.length);
      if (frontVerts.length > 0) {
        let sumY = 0, sumZ = 0, minY = Infinity, maxY = -Infinity;
        for (const v of frontVerts) {
          sumY += v[1]; sumZ += v[2];
          if (v[1] < minY) minY = v[1];
          if (v[1] > maxY) maxY = v[1];
        }
        console.log('    avg Y:', (sumY / frontVerts.length).toFixed(2), 'range:', minY.toFixed(2), '..', maxY.toFixed(2));
        console.log('    avg Z:', (sumZ / frontVerts.length).toFixed(2));
      }

      // Histogram of Y values
      console.log('\n  Y histogram (10 bins):');
      const bins = Array(10).fill(0);
      for (const v of allVerts) {
        const bin = Math.min(9, Math.floor((v[1] - min[1]) / ySpan * 10));
        bins[bin]++;
      }
      for (let b = 0; b < 10; b++) {
        const yLo = min[1] + b * ySpan / 10;
        const yHi = min[1] + (b+1) * ySpan / 10;
        console.log('    Y [', yLo.toFixed(0).padStart(6), '..', yHi.toFixed(0).padStart(6), ']:', bins[b]);
      }
    });
  }
}
