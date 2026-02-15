/**
 * DemoViewer — Non-interactive rotating Tesla with random light show animation.
 * Used on the HomeScreen when no light shows exist.
 */
import React, { useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Asset } from 'expo-asset';

// Materials kept as module-level factories so they can be swapped in the animation loop
function makeMats() {
  const body = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.7, roughness: 0.2 });
  const window_ = new THREE.MeshStandardMaterial({ color: 0x445566, metalness: 0.7, roughness: 0.1, opacity: 0.75, transparent: true });
  const headOff = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5, roughness: 0.15, emissive: 0x000000, emissiveIntensity: 0 });
  const headOn = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.05, emissive: 0xffffff, emissiveIntensity: 1.5 });
  const tailOff = new THREE.MeshStandardMaterial({ color: 0x331111, metalness: 0.5, roughness: 0.15, emissive: 0x000000, emissiveIntensity: 0 });
  const tailOn = new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.2, roughness: 0.05, emissive: 0xff0000, emissiveIntensity: 1.5 });
  return { body, window: window_, headOff, headOn, tailOff, tailOn };
}

const WINDOW_PARTS = ['window_left_front', 'window_right_front', 'window_left_back', 'window_right_back'];
const HEAD_PARTS = ['light_left_front', 'light_right_front'];
const TAIL_PARTS = ['light_left_back', 'light_right_back'];
const ALL_ANIM_PARTS = [...WINDOW_PARTS, ...HEAD_PARTS, ...TAIL_PARTS];

export default function DemoViewer({ style }) {
  const frameIdRef = useRef(null);

  useEffect(() => {
    return () => {
      if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
    };
  }, []);

  const onContextCreate = async (gl) => {
    const { drawingBufferWidth: width, drawingBufferHeight: height } = gl;

    const renderer = new Renderer({ gl });
    renderer.setSize(width, height);
    renderer.setClearColor(0x0a0a1a, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(-1.8, 1.2, 2.5);
    camera.lookAt(0, 0, 0);

    // Lighting — same as editor
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.0); key.position.set(4, 8, 5); scene.add(key);
    const fill = new THREE.DirectionalLight(0xeeeeff, 0.7); fill.position.set(-4, 6, 4); scene.add(fill);
    const back = new THREE.DirectionalLight(0xccccff, 0.6); back.position.set(0, 5, -6); scene.add(back);
    const sl = new THREE.PointLight(0xffffff, 0.5, 20); sl.position.set(-6, 2, 0); scene.add(sl);
    const sr = new THREE.PointLight(0xffffff, 0.5, 20); sr.position.set(6, 2, 0); scene.add(sr);
    const bl = new THREE.PointLight(0xddddef, 0.4, 15); bl.position.set(0, -3, 0); scene.add(bl);
    const fl = new THREE.DirectionalLight(0xffffff, 0.5); fl.position.set(0, 3, 8); scene.add(fl);
    const bll = new THREE.DirectionalLight(0xddddff, 0.4); bll.position.set(0, 2, -8); scene.add(bll);

    const mats = makeMats();
    const partMeshes = {}; // partName -> mesh

    try {
      const asset = Asset.fromModule(require('../assets/models/tesla_windshield_geo.glb'));
      await asset.downloadAsync();
      const loader = new GLTFLoader();
      const gltf = await new Promise((resolve, reject) => {
        loader.load(asset.localUri || asset.uri, resolve, undefined, reject);
      });
      const model = gltf.scene;

      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const s = 3 / maxDim;
      model.scale.set(s, s, s);
      model.position.set(-center.x * s, -center.y * s, -center.z * s);

      // Each animated window gets its own material clone so opacity changes are independent
      const windowMats = {};
      WINDOW_PARTS.forEach((p) => { windowMats[p] = mats.window.clone(); });

      const fixedMats = {
        window_left_front: windowMats.window_left_front,
        window_right_front: windowMats.window_right_front,
        window_left_back: windowMats.window_left_back,
        window_right_back: windowMats.window_right_back,
        windshield_front: mats.window, windshield_back: mats.window,
        light_left_front: mats.headOff, light_right_front: mats.headOff,
        light_left_back: mats.tailOff, light_right_back: mats.tailOff,
      };
      const getPartName = (mesh) => {
        let node = mesh;
        while (node) {
          if (fixedMats[node.name]) return node.name;
          node = node.parent;
        }
        return null;
      };
      model.traverse((child) => {
        if (child.isMesh) {
          const pn = getPartName(child);
          child.material = (pn && fixedMats[pn]) || mats.body;
          if (pn && ALL_ANIM_PARTS.includes(pn)) {
            partMeshes[pn] = child;
          }
        }
      });

      scene.add(model);

      // Store each window mesh's init matrix and travelZ (same as editor)
      const windowData = {};
      WINDOW_PARTS.forEach((p) => {
        const mesh = partMeshes[p];
        if (!mesh) return;
        mesh.geometry.computeBoundingBox();
        const geoBBox = mesh.geometry.boundingBox;
        const travelZ = geoBBox.max.z - geoBBox.min.z;
        windowData[p] = {
          mesh,
          initMatrix: mesh.matrix.clone(),
          travelZ,
        };
        mesh.matrixAutoUpdate = false;
      });

      // Random phase offsets per part for chaotic feel
      const headPhase = HEAD_PARTS.map(() => Math.random() * Math.PI * 2);
      const headSpeed = HEAD_PARTS.map(() => 12 + Math.random() * 10);
      const tailPhase = TAIL_PARTS.map(() => Math.random() * Math.PI * 2);
      const tailSpeed = TAIL_PARTS.map(() => 10 + Math.random() * 12);
      const winPhase = WINDOW_PARTS.map(() => Math.random() * Math.PI * 2);
      const winSpeed = WINDOW_PARTS.map(() => 3 + Math.random() * 2);
      const DANCE_CYCLE_MS = 3500;

      let rotation = 0;
      let time = 0;

      const animate = () => {
        frameIdRef.current = requestAnimationFrame(animate);
        time += 1 / 60;

        // Rotate model
        rotation += 0.008;
        model.rotation.y = rotation;

        // Headlights — fast chaotic blink, always on
        HEAD_PARTS.forEach((p, i) => {
          if (!partMeshes[p]) return;
          const on = Math.sin(time * headSpeed[i] + headPhase[i]) > 0;
          partMeshes[p].material = on ? mats.headOn : mats.headOff;
        });

        // Taillights — fast chaotic blink, always on
        TAIL_PARTS.forEach((p, i) => {
          if (!partMeshes[p]) return;
          const on = Math.sin(time * tailSpeed[i] + tailPhase[i]) > 0;
          partMeshes[p].material = on ? mats.tailOn : mats.tailOff;
        });

        // Windows dance — Z-axis slide (same as editor)
        WINDOW_PARTS.forEach((p, i) => {
          const wd = windowData[p];
          if (!wd) return;
          const phase = (time * 1000 / DANCE_CYCLE_MS) * Math.PI * 2 + winPhase[i];
          const REST_OPEN = 0.7;
          const danceRange = REST_OPEN - 0.3;
          const wave = danceRange * (0.5 - 0.5 * Math.cos(phase));
          const progress = REST_OPEN - wave;
          const slideDown = new THREE.Matrix4().makeTranslation(0, 0, -wd.travelZ * progress);
          const combined = wd.initMatrix.clone().multiply(slideDown);
          wd.mesh.matrix.copy(combined);
        });

        renderer.render(scene, camera);
        gl.endFrameEXP();
      };
      animate();
    } catch (e) {
      console.error('DemoViewer model error:', e);
    }
  };

  return (
    <View style={[styles.container, style]}>
      <GLView style={styles.gl} onContextCreate={onContextCreate} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0a0a1a',
  },
  gl: {
    width: '100%',
    height: '100%',
  },
});
