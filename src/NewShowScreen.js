import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Dimensions, ScrollView,
} from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Asset } from 'expo-asset';
import { getShowCount, createShow } from './storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.7;
const CARD_MARGIN = 12;

const CAR_MODELS = [
  { id: 'model_s', label: 'Model S', available: false },
  { id: 'model_3', label: 'Model 3', available: true },
  { id: 'model_x', label: 'Model X', available: false },
];

export default function NewShowScreen({ onBack, onCreated }) {
  const [selectedIndex, setSelectedIndex] = useState(1); // Model 3 = center
  const [showName, setShowName] = useState('');
  const scrollRef = useRef(null);
  const glRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const modelRef = useRef(null);
  const frameIdRef = useRef(null);
  const rotationRef = useRef(0);

  useEffect(() => {
    (async () => {
      const count = await getShowCount();
      setShowName(`Light Show #${count + 1}`);
    })();
  }, []);

  // Scroll to Model 3 on mount
  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        x: 1 * (CARD_WIDTH + CARD_MARGIN * 2),
        animated: false,
      });
    }, 100);
  }, []);

  const handleScroll = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / (CARD_WIDTH + CARD_MARGIN * 2));
    if (idx !== selectedIndex && idx >= 0 && idx < CAR_MODELS.length) {
      setSelectedIndex(idx);
    }
  };

  const handleCreate = async () => {
    const model = CAR_MODELS[selectedIndex];
    if (!model.available) return;
    try {
      const show = await createShow({
        name: showName.trim() || `Light Show`,
        carModel: model.id,
      });
      onCreated(show.id);
    } catch (e) {
      alert(e.message);
    }
  };

  const onContextCreate = async (gl) => {
    glRef.current = gl;
    const { drawingBufferWidth: width, drawingBufferHeight: height } = gl;

    const renderer = new Renderer({ gl });
    renderer.setSize(width, height);
    renderer.setClearColor(0x0a0a1a, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(-3, 2, 4);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const ambient = new THREE.AmbientLight(0xddddef, 0.6);
    scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0xccccff, 0x222233, 0.5);
    scene.add(hemi);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(5, 8, 5);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x8888cc, 0.4);
    fillLight.position.set(-5, 3, -3);
    scene.add(fillLight);

    try {
      const asset = Asset.fromModule(require('../assets/models/tesla_mesh_model_1_geo.glb'));
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

      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x222222,
        metalness: 0.85,
        roughness: 0.15,
        envMapIntensity: 1.0,
      });
      model.traverse((child) => {
        if (child.isMesh) {
          child.material = bodyMat;
        }
      });

      scene.add(model);
      modelRef.current = model;
    } catch (e) {
      console.error('Error loading preview model:', e);
    }

    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      if (modelRef.current) {
        rotationRef.current += 0.005;
        modelRef.current.rotation.y = rotationRef.current;
      }
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    animate();
  };

  useEffect(() => {
    return () => {
      if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
    };
  }, []);

  const selectedModel = CAR_MODELS[selectedIndex];

  return (
    <View style={styles.container}>
      {/* Back button */}
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Text style={styles.backText}>← Retour</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Nouveau Light Show</Text>

      {/* Name input */}
      <View style={styles.nameRow}>
        <Text style={styles.nameLabel}>Nom</Text>
        <TextInput
          style={styles.nameInput}
          value={showName}
          onChangeText={setShowName}
          placeholder="Mon Light Show"
          placeholderTextColor="#444466"
          selectTextOnFocus
        />
      </View>

      {/* Car model carousel */}
      <Text style={styles.sectionLabel}>Modèle</Text>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={false}
        snapToInterval={CARD_WIDTH + CARD_MARGIN * 2}
        snapToAlignment="center"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carousel}
        onMomentumScrollEnd={handleScroll}
      >
        {CAR_MODELS.map((car, idx) => (
          <View
            key={car.id}
            style={[
              styles.carCard,
              idx === selectedIndex && styles.carCardSelected,
            ]}
          >
            <Text style={styles.carLabel}>{car.label}</Text>
            {car.available ? (
              <View style={styles.previewContainer}>
                {idx === 1 && (
                  <GLView
                    style={styles.glView}
                    onContextCreate={onContextCreate}
                  />
                )}
              </View>
            ) : (
              <View style={styles.previewContainer}>
                <Text style={styles.comingSoon}>Bientôt disponible</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Create button */}
      <TouchableOpacity
        style={[styles.createButton, !selectedModel.available && styles.createButtonDisabled]}
        onPress={handleCreate}
        disabled={!selectedModel.available}
      >
        <Text style={styles.createButtonText}>
          {selectedModel.available ? 'Créer' : 'Non disponible'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
    paddingTop: 60,
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  backText: {
    color: '#44aaff',
    fontSize: 15,
    fontWeight: '500',
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 24,
  },
  nameRow: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  nameLabel: {
    color: '#8888aa',
    fontSize: 13,
    marginBottom: 6,
  },
  nameInput: {
    backgroundColor: '#12122a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e1e3a',
    color: '#ffffff',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sectionLabel: {
    color: '#8888aa',
    fontSize: 13,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  carousel: {
    paddingHorizontal: (SCREEN_WIDTH - CARD_WIDTH) / 2 - CARD_MARGIN,
  },
  carCard: {
    width: CARD_WIDTH,
    marginHorizontal: CARD_MARGIN,
    backgroundColor: '#12122a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e1e3a',
    padding: 16,
    alignItems: 'center',
  },
  carCardSelected: {
    borderColor: '#44aaff',
    borderWidth: 2,
  },
  carLabel: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  previewContainer: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#0a0a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  glView: {
    width: '100%',
    height: '100%',
  },
  comingSoon: {
    color: '#444466',
    fontSize: 15,
    fontStyle: 'italic',
  },
  createButton: {
    marginHorizontal: 20,
    marginTop: 30,
    backgroundColor: '#44aaff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  createButtonDisabled: {
    backgroundColor: '#2a2a4a',
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
