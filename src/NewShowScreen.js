import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Dimensions, ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
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
  { id: 'model_y', label: 'Model Y', available: false },
];

export default function NewShowScreen({ onBack, onCreated }) {
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState(1); // Model 3
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

  const MODEL_3_INDEX = 1;

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
    camera.position.set(-2.2, 1.5, 3);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444466, 0.7);
    scene.add(hemiLight);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(4, 8, 5);
    scene.add(keyLight);
    const fillLeft = new THREE.DirectionalLight(0xeeeeff, 0.7);
    fillLeft.position.set(-4, 6, 4);
    scene.add(fillLeft);
    const backLight = new THREE.DirectionalLight(0xccccff, 0.6);
    backLight.position.set(0, 5, -6);
    scene.add(backLight);
    const sideLeft = new THREE.PointLight(0xffffff, 0.5, 20);
    sideLeft.position.set(-6, 2, 0);
    scene.add(sideLeft);
    const sideRight = new THREE.PointLight(0xffffff, 0.5, 20);
    sideRight.position.set(6, 2, 0);
    scene.add(sideRight);
    const bottomLight = new THREE.PointLight(0xddddef, 0.4, 15);
    bottomLight.position.set(0, -3, 0);
    scene.add(bottomLight);
    const frontLight = new THREE.DirectionalLight(0xffffff, 0.5);
    frontLight.position.set(0, 3, 8);
    scene.add(frontLight);
    const backLowLight = new THREE.DirectionalLight(0xddddff, 0.4);
    backLowLight.position.set(0, 2, -8);
    scene.add(backLowLight);

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

      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x222222,
        metalness: 0.7,
        roughness: 0.2,
      });
      const windowMat = new THREE.MeshStandardMaterial({
        color: 0x445566,
        metalness: 0.7,
        roughness: 0.1,
        opacity: 0.75,
        transparent: true,
      });
      const litHeadMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.2,
        roughness: 0.05,
        emissive: 0xffffff,
        emissiveIntensity: 1.5,
      });
      const litTailMat = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        metalness: 0.3,
        roughness: 0.1,
        emissive: 0xff2200,
        emissiveIntensity: 1.2,
      });
      const partMats = {
        window_left_front: windowMat, window_right_front: windowMat,
        window_left_back: windowMat, window_right_back: windowMat,
        windshield_front: windowMat, windshield_back: windowMat,
        light_left_front: litHeadMat, light_right_front: litHeadMat,
        light_left_back: litTailMat, light_right_back: litTailMat,
      };
      const getPartName = (mesh) => {
        let node = mesh;
        while (node) {
          if (partMats[node.name]) return node.name;
          node = node.parent;
        }
        return null;
      };
      model.traverse((child) => {
        if (child.isMesh) {
          const pn = getPartName(child);
          child.material = (pn && partMats[pn]) || bodyMat;
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
        <Text style={styles.backText}>{t('newShow.back')}</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{t('newShow.title')}</Text>

      {/* Name input */}
      <View style={styles.nameRow}>
        <Text style={styles.nameLabel}>{t('newShow.name')}</Text>
        <TextInput
          style={styles.nameInput}
          value={showName}
          onChangeText={setShowName}
          placeholder={t('newShow.namePlaceholder')}
          placeholderTextColor="#444466"
          selectTextOnFocus
        />
      </View>

      {/* Car model carousel */}
      <Text style={styles.sectionLabel}>{t('newShow.model')}</Text>
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
                {idx === MODEL_3_INDEX && (
                  <GLView
                    style={styles.glView}
                    onContextCreate={onContextCreate}
                  />
                )}
              </View>
            ) : (
              <View style={styles.previewContainer}>
                <Text style={styles.comingSoon}>{t('newShow.comingSoon')}</Text>
              </View>
            )}
            {idx === MODEL_3_INDEX && (
              <View style={styles.modelInfoBox}>
                <Text style={styles.modelInfoText}>
                  {t('newShow.model3Compat')}
                </Text>
                <Text style={styles.modelInfoHint}>
                  {t('newShow.model3Hint')}
                </Text>
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
          {selectedModel.available ? t('newShow.create') : t('newShow.unavailable')}
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
  modelInfoBox: {
    marginTop: 10,
    paddingHorizontal: 4,
  },
  modelInfoText: {
    color: '#8888aa',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  modelInfoHint: {
    color: '#6666aa',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 6,
    fontStyle: 'italic',
  },
  createButton: {
    marginHorizontal: 20,
    marginTop: 30,
    marginBottom: 50,
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
