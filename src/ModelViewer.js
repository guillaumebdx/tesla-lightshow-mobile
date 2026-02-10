import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, Dimensions, ScrollView } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Asset } from 'expo-asset';
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
} from 'react-native-gesture-handler';
import AudioTimeline from './AudioTimeline';
import PartOptionsPanel from './PartOptionsPanel';

const INTERACTIVE_PARTS = [
  'window_left_front', 'window_right_front',
  'window_left_back', 'window_right_back',
  'retro_left', 'retro_right',
  'flap', 'trunk',
  'light_left_front', 'light_right_front',
  'light_left_back', 'light_right_back',
];

const PART_LABELS = {
  window_left_front: 'Fenêtre AV gauche',
  window_right_front: 'Fenêtre AV droite',
  window_left_back: 'Fenêtre AR gauche',
  window_right_back: 'Fenêtre AR droite',
  retro_left: 'Rétro gauche',
  retro_right: 'Rétro droit',
  flap: 'Trappe de charge',
  trunk: 'Coffre',
  light_left_front: 'Phare AV gauche',
  light_right_front: 'Phare AV droit',
  light_left_back: 'Feu AR gauche',
  light_right_back: 'Feu AR droit',
};

export default function ModelViewer() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPart, setSelectedPart] = useState(null);
  const markersRef = useRef([]);
  const playbackPositionRef = useRef(0);
  const playbackDurationRef = useRef(0);
  const litMeshesRef = useRef(new Map()); // meshName -> timeout id
  const [eventOptions, setEventOptions] = useState({ durationMs: 500, blink: false });

  // Refs for Three.js objects
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const modelRef = useRef(null);
  const frameIdRef = useRef(null);
  const glRef = useRef(null);
  const canvasSizeRef = useRef({ width: 1, height: 1 });
  const layoutSizeRef = useRef({ width: 1, height: 1 });

  // Refs for gesture state
  const rotationRef = useRef({ x: 0, y: 0 });
  const savedRotationRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const savedScaleRef = useRef(1);
  const baseScaleRef = useRef(1);

  const getZoomMax = () => baseScaleRef.current * 2.074; // ~4 taps of 1.2x
  const getZoomMin = () => baseScaleRef.current * 0.3;

  const zoomIn = () => {
    scaleRef.current = Math.min(getZoomMax(), scaleRef.current * 1.2);
  };

  const zoomOut = () => {
    scaleRef.current = Math.max(getZoomMin(), scaleRef.current / 1.2);
  };

  // Materials
  const bodyMaterialRef = useRef(null);
  const highlightMaterialRef = useRef(null);
  const meshMaterialsRef = useRef(new Map());
  const selectedMeshRef = useRef(null);
  const litHeadlightMatRef = useRef(null);
  const litTaillightMatRef = useRef(null);
  const lastCheckedPosRef = useRef(0);
  const [activeColor, setActiveColor] = useState('#222222');

  const BODY_COLORS = [
    { name: 'Noir', hex: '#111111' },
    { name: 'Gris clair', hex: '#999999' },
    { name: 'Anthracite', hex: '#3a3a3a' },
    { name: 'Bleu', hex: '#1a3a6b' },
    { name: 'Blanc', hex: '#e8e8e8' },
    { name: 'Rouge', hex: '#8b1a1a' },
  ];

  const changeBodyColor = (hex) => {
    setActiveColor(hex);
    if (bodyMaterialRef.current) {
      bodyMaterialRef.current.color.set(hex);
      bodyMaterialRef.current.needsUpdate = true;
    }
  };

  const selectPart = useCallback((meshName) => {
    const model = modelRef.current;
    if (!model) return;

    // Deselect previous
    if (selectedMeshRef.current) {
      const prev = selectedMeshRef.current;
      const prevKey = prev.userData.interactiveName || prev.name;
      const originalMat = meshMaterialsRef.current.get(prevKey);
      if (originalMat) prev.material = originalMat;
    }

    if (meshName === null || (selectedMeshRef.current && selectedMeshRef.current.userData.interactiveName === meshName)) {
      selectedMeshRef.current = null;
      setSelectedPart(null);
      return;
    }

    // Find and select new (match by userData.interactiveName)
    model.traverse((child) => {
      if (child.isMesh && child.userData.interactiveName === meshName) {
        child.material = highlightMaterialRef.current;
        selectedMeshRef.current = child;
        setSelectedPart(meshName);
      }
    });
  }, []);

  const handleTap = useCallback((x, y) => {
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    const model = modelRef.current;
    if (!camera || !scene || !model) return;

    // Use layout dimensions (logical points) since gesture coords are in points
    const { width, height } = layoutSizeRef.current;
    const mouse = new THREE.Vector2(
      (x / width) * 2 - 1,
      -(y / height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    // Raycast against all meshes first
    const allMeshes = [];
    model.traverse((child) => {
      if (child.isMesh) {
        allMeshes.push(child);
      }
    });

    const intersects = raycaster.intersectObjects(allMeshes, false);
    if (intersects.length > 0) {
      const hit = intersects[0].object;
      const interactiveName = hit.userData.interactiveName;
      console.log('Tap hit:', interactiveName || hit.name);
      if (interactiveName) {
        selectPart(interactiveName);
      } else {
        selectPart(null);
      }
    } else {
      console.log('Tap miss - no intersection');
      selectPart(null);
    }
  }, [selectPart]);

  const onContextCreate = async (gl) => {
    glRef.current = gl;

    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    canvasSizeRef.current = { width, height };

    // Renderer
    const renderer = new Renderer({ gl });
    renderer.setSize(width, height);
    renderer.setClearColor(0x1a1a2e, 1);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 2, 6);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Lights - diffuse and well-distributed
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444466, 0.8);
    scene.add(hemiLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight2.position.set(-5, 8, -3);
    scene.add(directionalLight2);

    const directionalLight3 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight3.position.set(0, 2, -8);
    scene.add(directionalLight3);

    const fillLight = new THREE.PointLight(0xffffff, 0.5, 30);
    fillLight.position.set(-3, 3, 5);
    scene.add(fillLight);

    const fillLight2 = new THREE.PointLight(0xffffff, 0.5, 30);
    fillLight2.position.set(3, 3, 5);
    scene.add(fillLight2);

    // Materials
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.9,
      roughness: 0.15,
    });
    bodyMaterialRef.current = bodyMaterial;

    const highlightMaterial = new THREE.MeshStandardMaterial({
      color: 0x44aaff,
      metalness: 0.5,
      roughness: 0.2,
      emissive: 0x1155aa,
      emissiveIntensity: 0.6,
    });
    highlightMaterialRef.current = highlightMaterial;

    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.9,
      roughness: 0.05,
      opacity: 0.3,
      transparent: true,
    });

    // Lights OFF (default: dark gray, like glass)
    const headlightMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.5,
      roughness: 0.15,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });

    const taillightMaterial = new THREE.MeshStandardMaterial({
      color: 0x331111,
      metalness: 0.5,
      roughness: 0.15,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });

    // Lights ON (bright emissive)
    const litHeadlightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.2,
      roughness: 0.05,
      emissive: 0xffffff,
      emissiveIntensity: 1.5,
    });
    litHeadlightMatRef.current = litHeadlightMat;

    const litTaillightMat = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      metalness: 0.2,
      roughness: 0.05,
      emissive: 0xff0000,
      emissiveIntensity: 1.5,
    });
    litTaillightMatRef.current = litTaillightMat;

    const fixedPartMaterials = {
      window_left_front: windowMaterial,
      window_right_front: windowMaterial,
      window_left_back: windowMaterial,
      window_right_back: windowMaterial,
      light_left_front: headlightMaterial,
      light_right_front: headlightMaterial,
      light_left_back: taillightMaterial,
      light_right_back: taillightMaterial,
    };

    // Load GLB model
    try {
      const asset = Asset.fromModule(require('../assets/models/tesla_mesh_model_1_geo.glb'));
      await asset.downloadAsync();

      const fileUri = asset.localUri || asset.uri;
      const response = await fetch(fileUri);
      const arrayBuffer = await response.arrayBuffer();

      const loader = new GLTFLoader();
      const gltf = await new Promise((resolve, reject) => {
        loader.parse(arrayBuffer, '', resolve, reject);
      });

      const model = gltf.scene;

      // Debug: log full hierarchy to find correct name level
      model.traverse((child) => {
        if (child.isMesh) {
          console.log(`MESH: "${child.name}" parent: "${child.parent?.name}" grandparent: "${child.parent?.parent?.name}"`);
        }
      });

      // Apply materials per mesh - find the interactive name by walking up the hierarchy
      const getInteractiveName = (mesh) => {
        let node = mesh;
        while (node) {
          if (INTERACTIVE_PARTS.includes(node.name)) return node.name;
          node = node.parent;
        }
        return null;
      };

      model.traverse((child) => {
        if (child.isMesh) {
          const interactiveName = getInteractiveName(child);
          const mat = (interactiveName && fixedPartMaterials[interactiveName]) || bodyMaterial;
          child.material = mat;
          // Store with a key we can look up later
          const key = interactiveName || child.name;
          meshMaterialsRef.current.set(key, mat);
          // Also tag the mesh with its interactive name for quick lookup
          child.userData.interactiveName = interactiveName;
        }
      });

      // Center and scale the model
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scaleFactor = 4.5 / maxDim;

      model.scale.setScalar(scaleFactor);
      model.position.sub(center.multiplyScalar(scaleFactor));
      model.position.y = -size.y * scaleFactor / 2;

      // Initialize zoom refs with the computed scale
      scaleRef.current = scaleFactor;
      savedScaleRef.current = scaleFactor;
      baseScaleRef.current = scaleFactor;

      scene.add(model);
      modelRef.current = model;
      setLoading(false);
    } catch (e) {
      console.error('Error loading model:', e);
      setError('Impossible de charger le modèle 3D: ' + e.message);
      setLoading(false);
    }

    // Animation loop
    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);

      if (modelRef.current) {
        modelRef.current.rotation.x = rotationRef.current.x;
        modelRef.current.rotation.y = rotationRef.current.y;

        const s = scaleRef.current;
        modelRef.current.scale.set(s, s, s);

        // Check markers for light triggers
        const pos = playbackPositionRef.current;
        const lastPos = lastCheckedPosRef.current;
        if (pos !== lastPos) {
          const markers = markersRef.current;
          for (const marker of markers) {
            // Trigger if playback just crossed this marker
            if (marker.timeMs > lastPos && marker.timeMs <= pos) {
              triggerLightEvent(marker.part, marker.durationMs || 500, marker.blink || false);
            }
          }
          lastCheckedPosRef.current = pos;
        }
      }

      renderer.render(scene, camera);
      gl.endFrameEXP();
    };

    const triggerLightEvent = (partName, markerDurationMs = 500, markerBlink = false) => {
      const model = modelRef.current;
      if (!model) return;

      const isHeadlight = partName.includes('light') && partName.includes('front');
      const isTaillight = partName.includes('light') && partName.includes('back');
      if (!isHeadlight && !isTaillight) return;

      const litMat = isHeadlight ? litHeadlightMatRef.current : litTaillightMatRef.current;
      if (!litMat) return;

      model.traverse((child) => {
        if (child.isMesh && child.userData.interactiveName === partName) {
          if (selectedMeshRef.current && selectedMeshRef.current.userData.interactiveName === partName) return;

          // Clear previous timeouts/intervals
          const prev = litMeshesRef.current.get(partName);
          if (prev) {
            if (prev.timeout) clearTimeout(prev.timeout);
            if (prev.interval) clearInterval(prev.interval);
          }

          const originalMat = meshMaterialsRef.current.get(partName);

          if (markerBlink) {
            // Blink mode: toggle on/off every 80ms
            let on = true;
            child.material = litMat;
            const interval = setInterval(() => {
              on = !on;
              child.material = on ? litMat : originalMat;
            }, 80);
            const timeout = setTimeout(() => {
              clearInterval(interval);
              if (originalMat) child.material = originalMat;
              litMeshesRef.current.delete(partName);
            }, markerDurationMs);
            litMeshesRef.current.set(partName, { timeout, interval });
          } else {
            // Solid on for duration
            child.material = litMat;
            const timeout = setTimeout(() => {
              if (originalMat && child.material === litMat) {
                child.material = originalMat;
              }
              litMeshesRef.current.delete(partName);
            }, markerDurationMs);
            litMeshesRef.current.set(partName, { timeout });
          }
        }
      });
    };

    animate();
  };

  useEffect(() => {
    return () => {
      if (frameIdRef.current) {
        cancelAnimationFrame(frameIdRef.current);
      }
    };
  }, []);

  // Tap gesture for mesh selection
  const tapGesture = Gesture.Tap()
    .onEnd((event) => {
      handleTap(event.x, event.y);
    });

  // Pan gesture for rotation
  const panGesture = Gesture.Pan()
    .onStart(() => {
      savedRotationRef.current = { ...rotationRef.current };
    })
    .onUpdate((event) => {
      rotationRef.current = {
        x: savedRotationRef.current.x + event.translationY * 0.005,
        y: savedRotationRef.current.y + event.translationX * 0.005,
      };
    });

  // Pinch gesture for zoom
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedScaleRef.current = scaleRef.current;
    })
    .onUpdate((event) => {
      const newScale = savedScaleRef.current * event.scale;
      scaleRef.current = Math.max(getZoomMin(), Math.min(getZoomMax(), newScale));
    });

  // Combine gestures
  const composedGesture = Gesture.Race(
    tapGesture,
    Gesture.Simultaneous(panGesture, pinchGesture)
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Top section: 3D Viewer */}
      <View style={styles.viewerSection}>
        <GestureDetector gesture={composedGesture}>
          <View style={styles.canvasContainer}>
            <GLView
              style={styles.canvas}
              onContextCreate={onContextCreate}
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                layoutSizeRef.current = { width, height };
              }}
            />

            {selectedPart && (
              <View style={styles.selectionBadge}>
                <Text style={styles.selectionText}>
                  {PART_LABELS[selectedPart] || selectedPart}
                </Text>
              </View>
            )}

            <View style={styles.zoomControls}>
              <TouchableOpacity style={styles.zoomButton} onPress={zoomIn}>
                <Text style={styles.zoomButtonText}>+</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.zoomButton} onPress={zoomOut}>
                <Text style={styles.zoomButtonText}>−</Text>
              </TouchableOpacity>
            </View>

            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#e94560" />
                <Text style={styles.loadingText}>Chargement du modèle...</Text>
              </View>
            )}

            {error && (
              <View style={styles.loadingOverlay}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </View>
        </GestureDetector>
      </View>

      {/* Color palette */}
      <View style={styles.palette}>
        {BODY_COLORS.map((c) => (
          <TouchableOpacity
            key={c.hex}
            onPress={() => changeBodyColor(c.hex)}
            style={[
              styles.colorDot,
              { backgroundColor: c.hex },
              activeColor === c.hex && styles.colorDotActive,
            ]}
          />
        ))}
      </View>

      {/* Bottom: scrollable timeline + options */}
      <ScrollView style={styles.bottomSection} contentContainerStyle={styles.bottomContent}>
        {/* Timeline */}
        <View style={styles.timelineSection}>
          <AudioTimeline
            selectedPart={selectedPart}
            eventOptions={eventOptions}
            onMarkersChange={(m) => { markersRef.current = m; }}
            onPositionChange={(pos, dur) => {
              playbackPositionRef.current = pos;
              playbackDurationRef.current = dur;
            }}
          />
        </View>

        {/* Part options panel */}
        <View style={styles.optionsSection}>
          <PartOptionsPanel
            selectedPart={selectedPart}
            eventOptions={eventOptions}
            onOptionsChange={setEventOptions}
          />
        </View>
      </ScrollView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
    paddingTop: 40,
  },
  viewerSection: {
    height: Math.round(Dimensions.get('window').height * 0.38),
  },
  bottomSection: {
    flex: 1,
  },
  bottomContent: {
    flexGrow: 1,
  },
  timelineSection: {
    borderTopWidth: 1,
    borderTopColor: '#2a2a4a',
  },
  optionsSection: {
    borderTopWidth: 1,
    borderTopColor: '#2a2a4a',
    minHeight: 150,
  },
  canvasContainer: {
    flex: 1,
    margin: 8,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  canvas: {
    flex: 1,
  },
  selectionBadge: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(68, 170, 255, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  selectionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 15, 35, 0.85)',
  },
  loadingText: {
    color: '#8888aa',
    marginTop: 12,
    fontSize: 16,
  },
  errorText: {
    color: '#e94560',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  palette: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8,
  },
  colorDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#333355',
  },
  colorDotActive: {
    borderColor: '#e94560',
    borderWidth: 3,
  },
  zoomControls: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    gap: 6,
  },
  zoomButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(30, 30, 60, 0.85)',
    borderWidth: 1,
    borderColor: '#3a3a5a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomButtonText: {
    color: '#ccccee',
    fontSize: 20,
    fontWeight: '300',
    lineHeight: 22,
  },
});
