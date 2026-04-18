import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

for (const path of [
  'assets/models/tesla_2_front_light_v2_geo.glb',
  'assets/models/model_y_juniper_geo.glb',
]) {
  console.log('\n=====', path, '=====');
  const doc = await io.read(path);
  function walk(node, depth=0) {
    const t = node.getTranslation();
    const r = node.getRotation();
    const s = node.getScale();
    const hasT = t.some(v => Math.abs(v) > 1e-6);
    const hasR = !(r[0]===0 && r[1]===0 && r[2]===0 && r[3]===1);
    const hasS = s.some(v => Math.abs(v-1) > 1e-6);
    if (depth <= 3) {
      console.log('  '.repeat(depth) + node.getName() + (hasT||hasR||hasS?' [T]':''));
      if (hasR) console.log('  '.repeat(depth+1) + 'quat:', r.map(v=>v.toFixed(3)).join(','));
      if (hasT) console.log('  '.repeat(depth+1) + 'trans:', t.map(v=>v.toFixed(3)).join(','));
    }
    node.listChildren().forEach(c => walk(c, depth+1));
  }
  doc.getRoot().listScenes().forEach(s => s.listChildren().forEach(c => walk(c, 0)));
}
