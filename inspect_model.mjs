import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'fs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// Inspect
const doc = await io.read('assets/models/tesla_windshield.glb');

console.log('=== NODES ===');
function printNode(node, depth = 0) {
  const indent = '  '.repeat(depth);
  const mesh = node.getMesh();
  const meshInfo = mesh ? ` -> mesh: "${mesh.getName()}"` : '';
  console.log(`${indent}"${node.getName()}"${meshInfo}`);
  node.listChildren().forEach(child => printNode(child, depth + 1));
}
doc.getRoot().listScenes().forEach(scene => {
  scene.listChildren().forEach(child => printNode(child, 1));
});

// Strip textures
doc.getRoot().listTextures().forEach(t => t.dispose());
doc.getRoot().listMaterials().forEach(mat => {
  mat.setBaseColorTexture(null);
  mat.setNormalTexture(null);
  mat.setOcclusionTexture(null);
  mat.setEmissiveTexture(null);
  mat.setMetallicRoughnessTexture(null);
});

await io.write('assets/models/tesla_windshield_geo.glb', doc);
const s = fs.statSync('assets/models/tesla_windshield_geo.glb');
console.log('\nStripped -> Size:', (s.size / 1024).toFixed(1), 'KB');
