import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TextInput, TouchableOpacity, Dimensions, ScrollView, Modal, Pressable, Alert, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
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
import { INTERACTIVE_PARTS, PART_LABELS, EFFECT_TYPES, BLINK_SPEEDS, DEFAULT_EVENT_OPTIONS, RETRO_MODES, RETRO_DURATIONS, TRUNK_MODES, TRUNK_DURATIONS, FLAP_MODES, FLAP_DURATIONS, CLOSURE_LIMITS, closureCommandCost, isRetro, isWindow, isLight, isBlinker, isTrunk, isFlap, isClosure } from './constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { MP3_TRACKS } from '../assets/mp3/index';
import { exportFseq } from './fseqExport';
import { loadShow, saveShow } from './storage';
import ExportModal from './ExportModal';

export default function ModelViewer({ showId, onGoHome }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPart, setSelectedPart] = useState(null);
  const eventsRef = useRef([]);
  const playbackPositionRef = useRef(0);
  const playbackDurationRef = useRef(0);
  const [eventOptions, setEventOptions] = useState({ ...DEFAULT_EVENT_OPTIONS });
  const [menuVisible, setMenuVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  const [loadVisible, setLoadVisible] = useState(false);
  const [cursorOffsetMs, _setCursorOffsetMs] = useState(0);
  const cursorOffsetMsRef = useRef(0);
  const setCursorOffsetMs = useCallback((valOrFn) => {
    _setCursorOffsetMs((prev) => {
      const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      cursorOffsetMsRef.current = next;
      return next;
    });
  }, []);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showName, setShowName] = useState('');
  const [playbackSpeed, _setPlaybackSpeed] = useState(1);
  const playbackSpeedRef = useRef(1);
  const setPlaybackSpeed = useCallback((v) => { _setPlaybackSpeed(v); playbackSpeedRef.current = v; }, []);
  const [timelineScale, _setTimelineScale] = useState(1);
  const timelineScaleRef = useRef(1);
  const setTimelineScale = useCallback((valOrFn) => {
    _setTimelineScale((prev) => {
      const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      timelineScaleRef.current = next;
      return next;
    });
  }, []);
  const audioTimelineRef = useRef(null);
  const showDataRef = useRef(null);
  const saveTimerRef = useRef(null);
  const showLoadedRef = useRef(false);
  const [isLoadingShow, setIsLoadingShow] = useState(!!showId);
  // Debounced auto-save (1.5s after last change)
  const scheduleSave = useCallback(() => {
    if (!showDataRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const trackInfo = audioTimelineRef.current?.getTrackInfo() || null;
      const data = {
        ...showDataRef.current,
        events: eventsRef.current,
        trackId: trackInfo?.isBuiltin ? trackInfo.id : null,
        trackUri: trackInfo?.isBuiltin ? null : (trackInfo?.id || null),
        trackTitle: trackInfo?.title || null,
        isBuiltinTrack: trackInfo?.isBuiltin ?? true,
        cursorOffsetMs: cursorOffsetMsRef.current,
        bodyColor: activeColorRef.current,
        playbackSpeed: playbackSpeedRef.current,
        timelineScale: timelineScaleRef.current,
        brightMode: brightModeRef.current,
      };
      await saveShow(data);
      showDataRef.current = data;
    }, 1500);
  }, []);

  // Load saved show on mount
  useEffect(() => {
    if (!showId || showLoadedRef.current) return;
    (async () => {
      const data = await loadShow(showId);
      if (!data) return;
      showDataRef.current = data;
      if (data.name) setShowName(data.name);
      if (data.bodyColor) {
        activeColorRef.current = data.bodyColor;
        if (bodyMaterialRef.current) {
          bodyMaterialRef.current.color.set(data.bodyColor);
          bodyMaterialRef.current.needsUpdate = true;
        }
      }
      if (data.cursorOffsetMs) setCursorOffsetMs(data.cursorOffsetMs);
      if (data.playbackSpeed) setPlaybackSpeed(data.playbackSpeed);
      if (data.timelineScale) setTimelineScale(data.timelineScale);
      if (data.brightMode) setBrightMode(data.brightMode);
      // Wait for AudioTimeline to be ready, then load track + events
      const waitForTimeline = setInterval(() => {
        if (audioTimelineRef.current) {
          clearInterval(waitForTimeline);
          if (data.trackId && data.isBuiltinTrack !== false) {
            audioTimelineRef.current.selectTrackById(data.trackId);
          } else if (data.trackUri) {
            audioTimelineRef.current.loadImportedTrack(data.trackUri, data.trackTitle);
          }
          // Load events after a short delay to let the track load
          setTimeout(() => {
            if (data.events && data.events.length > 0) {
              audioTimelineRef.current.loadEvents(data.events);
              eventsRef.current = data.events;
            }
            showLoadedRef.current = true;
            setIsLoadingShow(false);
          }, 500);
        }
      }, 100);
      return () => clearInterval(waitForTimeline);
    })();
  }, [showId]);

  const handleDeleteEvent = () => {
    if (!selectedEvent) return;
    eventsRef.current = eventsRef.current.filter((e) => e.id !== selectedEvent.id);
    audioTimelineRef.current?.deleteEvent(selectedEvent.id);
    setSelectedEvent(null);
    scheduleSave();
  };

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
  const litBlinkerMatRef = useRef(null);
  const spotLightsRef = useRef({}); // { light_left_front: SpotLight, ... }
  const dotSpritesRef = useRef([]); // white dot sprites on interactive parts
  const sceneLightsRef = useRef([]); // all scene lights for brightness toggle
  const [brightMode, _setBrightMode] = useState(false);
  const brightModeRef = useRef(false);
  const setBrightMode = useCallback((v) => { _setBrightMode(v); brightModeRef.current = v; }, []);
  const isPlayingRef = useRef(false);
  const retroNodesRef = useRef({}); // { retro_left: { mesh, geoCenter, initMatrix }, ... }
  const windowNodesRef = useRef({}); // { window_left_front: { mesh, initMatrix, travelY }, ... }
  const [activeColor, setActiveColor] = useState('#222222');
  const activeColorRef = useRef('#222222');

  const BODY_COLORS = [
    { name: 'Noir', hex: '#111111' },
    { name: 'Gris clair', hex: '#999999' },
    { name: 'Anthracite', hex: '#3a3a3a' },
    { name: 'Bleu', hex: '#2a4e8f' },
    { name: 'Blanc', hex: '#e8e8e8' },
    { name: 'Rouge', hex: '#b52020' },
  ];

  const toggleBrightMode = useCallback(() => {
    const next = !brightModeRef.current;
    setBrightMode(next);
    sceneLightsRef.current.forEach((l) => {
      l.intensity = next ? l.userData.defaultIntensity * 4 : l.userData.defaultIntensity;
    });
    scheduleSave();
  }, []);

  const changeBodyColor = (hex) => {
    setActiveColor(hex);
    activeColorRef.current = hex;
    if (bodyMaterialRef.current) {
      bodyMaterialRef.current.color.set(hex);
      bodyMaterialRef.current.needsUpdate = true;
    }
    scheduleSave();
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
        // Reset event options for the part type
        if (isRetro(meshName)) {
          const mode = RETRO_MODES.ROUND_TRIP;
          setEventOptions({ ...DEFAULT_EVENT_OPTIONS, retroMode: mode, durationMs: RETRO_DURATIONS[mode] });
        } else if (isWindow(meshName)) {
          setEventOptions({ ...DEFAULT_EVENT_OPTIONS, windowMode: 'window_dance', durationMs: 5000, windowDurationMs: 5000 });
        } else if (isTrunk(meshName)) {
          const mode = TRUNK_MODES.OPEN;
          setEventOptions({ ...DEFAULT_EVENT_OPTIONS, trunkMode: mode, durationMs: TRUNK_DURATIONS[mode] });
        } else if (isFlap(meshName)) {
          const mode = FLAP_MODES.OPEN;
          setEventOptions({ ...DEFAULT_EVENT_OPTIONS, flapMode: mode, durationMs: FLAP_DURATIONS[mode] });
        } else {
          setEventOptions({ ...DEFAULT_EVENT_OPTIONS });
        }
        setSelectedEvent(null);
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

    // Raycast against all meshes (including dot spheres)
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
        // Hit the car body — find the nearest interactive part using bbox center
        const hitPoint = intersects[0].point;
        let nearest = null;
        let nearestDist = Infinity;
        const seenNames = new Set();
        model.traverse((child) => {
          if (!child.isMesh || !child.userData.interactiveName) return;
          const name = child.userData.interactiveName;
          if (seenNames.has(name)) return;
          seenNames.add(name);
          // Use bounding box center in world space (more accurate than mesh origin)
          child.geometry.computeBoundingBox();
          const localCenter = new THREE.Vector3();
          child.geometry.boundingBox.getCenter(localCenter);
          const worldCenter = localCenter.clone();
          child.localToWorld(worldCenter);
          const dist = hitPoint.distanceTo(worldCenter);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = name;
          }
        });
        if (nearest && nearestDist < 1.5) {
          selectPart(nearest);
        } else {
          selectPart(null);
        }
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

    // Lighting — studio setup
    // Each light stores its default intensity for toggling bright mode
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    ambientLight.userData.defaultIntensity = 0.9;
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444466, 0.7);
    hemiLight.userData.defaultIntensity = 0.7;
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(4, 8, 5);
    keyLight.userData.defaultIntensity = 1.0;
    scene.add(keyLight);

    const fillLeft = new THREE.DirectionalLight(0xeeeeff, 0.7);
    fillLeft.position.set(-4, 6, 4);
    fillLeft.userData.defaultIntensity = 0.7;
    scene.add(fillLeft);

    const backLight = new THREE.DirectionalLight(0xccccff, 0.6);
    backLight.position.set(0, 5, -6);
    backLight.userData.defaultIntensity = 0.6;
    scene.add(backLight);

    const sideLeft = new THREE.PointLight(0xffffff, 0.5, 20);
    sideLeft.position.set(-6, 2, 0);
    sideLeft.userData.defaultIntensity = 0.5;
    scene.add(sideLeft);

    const sideRight = new THREE.PointLight(0xffffff, 0.5, 20);
    sideRight.position.set(6, 2, 0);
    sideRight.userData.defaultIntensity = 0.5;
    scene.add(sideRight);

    const bottomLight = new THREE.PointLight(0xddddef, 0.4, 15);
    bottomLight.position.set(0, -3, 0);
    bottomLight.userData.defaultIntensity = 0.4;
    scene.add(bottomLight);

    const frontLight = new THREE.DirectionalLight(0xffffff, 0.5);
    frontLight.position.set(0, 3, 8);
    frontLight.userData.defaultIntensity = 0.5;
    scene.add(frontLight);

    const backLowLight = new THREE.DirectionalLight(0xddddff, 0.4);
    backLowLight.position.set(0, 2, -8);
    backLowLight.userData.defaultIntensity = 0.4;
    scene.add(backLowLight);

    // Store all scene lights for brightness toggle
    const allLights = [ambientLight, hemiLight, keyLight, fillLeft, backLight, sideLeft, sideRight, bottomLight, frontLight, backLowLight];
    sceneLightsRef.current = allLights;

    // Apply bright mode if saved
    if (brightModeRef.current) {
      allLights.forEach((l) => { l.intensity = l.userData.defaultIntensity * 4; });
    }

    // Materials
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: activeColorRef.current || 0x222222,
      metalness: 0.7,
      roughness: 0.2,
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
      color: 0x445566,
      metalness: 0.7,
      roughness: 0.1,
      opacity: 0.75,
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

    // Turn signal (blinker) materials — amber
    const blinkerMaterial = new THREE.MeshBasicMaterial({
      color: 0x332200,
    });

    const litBlinkerMat = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      metalness: 0.2,
      roughness: 0.05,
      emissive: 0xffaa00,
      emissiveIntensity: 1.5,
    });
    litBlinkerMatRef.current = litBlinkerMat;

    // Map non-standard Blender node names to clean part names
    const nodeNameMap = {
      'blink_front_left002': 'blink_front_left',
      'blin_back_right': 'blink_back_right',
    };

    const fixedPartMaterials = {
      window_left_front: windowMaterial,
      window_right_front: windowMaterial,
      window_left_back: windowMaterial,
      window_right_back: windowMaterial,
      windshield_front: windowMaterial,
      windshield_back: windowMaterial,
      light_left_front: headlightMaterial,
      light_right_front: headlightMaterial,
      light_left_back: taillightMaterial,
      light_right_back: taillightMaterial,
      blink_front_left: blinkerMaterial,
      blink_front_right: blinkerMaterial,
      blink_back_left: blinkerMaterial,
      blink_back_right: blinkerMaterial,
    };

    // Load GLB model
    try {
      const asset = Asset.fromModule(require('../assets/models/tesla_model_3_v3_geo.glb'));
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

      // Apply materials per mesh - find the part name by walking up the hierarchy
      const getPartName = (mesh) => {
        let node = mesh;
        while (node) {
          const mapped = nodeNameMap[node.name] || node.name;
          if (INTERACTIVE_PARTS.includes(mapped) || fixedPartMaterials[mapped]) return mapped;
          node = node.parent;
        }
        return null;
      };

      model.traverse((child) => {
        if (child.isMesh) {
          const partName = getPartName(child);
          const mat = (partName && fixedPartMaterials[partName]) || bodyMaterial;
          child.material = mat;
          // Store with a key we can look up later
          const key = partName || child.name;
          meshMaterialsRef.current.set(key, mat);
          // Only tag interactive parts (not cosmetic like windshields)
          child.userData.interactiveName = INTERACTIVE_PARTS.includes(partName) ? partName : null;
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

      // Create SpotLights at each light/blinker mesh position
      const lightDefs = {
        light_left_front:  { color: 0xffffff, dir: new THREE.Vector3(0, -0.3, 1) },
        light_right_front: { color: 0xffffff, dir: new THREE.Vector3(0, -0.3, 1) },
        light_left_back:   { color: 0xff2200, dir: new THREE.Vector3(0, -0.3, -1) },
        light_right_back:  { color: 0xff2200, dir: new THREE.Vector3(0, -0.3, -1) },
        blink_front_left:  { color: 0xffaa00, dir: new THREE.Vector3(-0.5, -0.3, 1) },
        blink_front_right: { color: 0xffaa00, dir: new THREE.Vector3(0.5, -0.3, 1) },
        blink_back_left:   { color: 0xffaa00, dir: new THREE.Vector3(-0.5, -0.3, -1) },
        blink_back_right:  { color: 0xffaa00, dir: new THREE.Vector3(0.5, -0.3, -1) },
      };

      model.traverse((child) => {
        if (!child.isMesh) return;
        const partName = child.userData.interactiveName;
        if (!partName || !lightDefs[partName]) return;

        const def = lightDefs[partName];
        // Get world position of the light mesh
        const worldPos = new THREE.Vector3();
        child.getWorldPosition(worldPos);

        const isBlink = partName.includes('blink');
        const spot = new THREE.SpotLight(def.color, 0, isBlink ? 8 : 12, isBlink ? Math.PI / 6 : Math.PI / 5, 0.6, 1.5);
        spot.position.copy(worldPos);
        // Target = position + direction
        const target = new THREE.Object3D();
        target.position.copy(worldPos).add(def.dir.clone().multiplyScalar(3));
        scene.add(target);
        spot.target = target;
        spot.castShadow = false;
        scene.add(spot);

        // Store — may have multiple meshes per part, keep first
        if (!spotLightsRef.current[partName]) {
          spotLightsRef.current[partName] = spot;
        }
      });

      // Find retro mirror meshes and store initial state
      const retroNames = ['retro_left', 'retro_right'];
      model.traverse((child) => {
        if (!child.isMesh) return;
        const interactiveName = child.userData.interactiveName;
        if (retroNames.includes(interactiveName) && !retroNodesRef.current[interactiveName]) {
          // Store the mesh geometry's bounding box center to use as rotation pivot
          child.geometry.computeBoundingBox();
          const geoBBox = child.geometry.boundingBox;
          const geoCenter = new THREE.Vector3();
          geoBBox.getCenter(geoCenter);

          retroNodesRef.current[interactiveName] = {
            mesh: child,
            geoCenter: geoCenter,
            initMatrix: child.matrix.clone(),
          };
          console.log(`RETRO mesh: "${interactiveName}" geoCenter=(${geoCenter.x.toFixed(3)}, ${geoCenter.y.toFixed(3)}, ${geoCenter.z.toFixed(3)}) pos=(${child.position.x.toFixed(3)}, ${child.position.y.toFixed(3)}, ${child.position.z.toFixed(3)})`);
        }
      });

      // Find window meshes and store initial state + travel distance
      const windowNames = ['window_left_front', 'window_right_front', 'window_left_back', 'window_right_back'];
      model.traverse((child) => {
        if (!child.isMesh) return;
        const interactiveName = child.userData.interactiveName;
        if (windowNames.includes(interactiveName) && !windowNodesRef.current[interactiveName]) {
          child.geometry.computeBoundingBox();
          const geoBBox = child.geometry.boundingBox;
          // Travel distance = height of the window geometry (Z extent = vertical on screen)
          const travelZ = geoBBox.max.z - geoBBox.min.z;

          windowNodesRef.current[interactiveName] = {
            mesh: child,
            initMatrix: child.matrix.clone(),
            travelZ: travelZ,
          };
          console.log(`WINDOW mesh: "${interactiveName}" travelZ=${travelZ.toFixed(3)}`);
        }
      });

      // Create round white dot using a small sphere for each interactive part
      // depthTest is OFF so dots are always rendered; visibility is controlled
      // dynamically in the animation loop based on camera orientation.
      model.updateMatrixWorld(true);
      const dotGeo = new THREE.SphereGeometry(1, 16, 16);
      const dotBaseMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        depthTest: false,
        depthWrite: false,
      });
      const seenParts = new Set();
      model.traverse((child) => {
        if (!child.isMesh) return;
        const partName = child.userData.interactiveName;
        if (!partName || seenParts.has(partName)) return;
        seenParts.add(partName);

        // Compute center of bounding box in local space
        child.geometry.computeBoundingBox();
        const bbox = child.geometry.boundingBox;
        const localCenter = new THREE.Vector3();
        bbox.getCenter(localCenter);

        // For windows, place dot at top edge instead of center
        const dotPosition = localCenter.clone();
        if (partName.startsWith('window_')) {
          dotPosition.z = bbox.max.z - (bbox.max.z - bbox.min.z) * 0.15;
        }

        const dot = new THREE.Mesh(dotGeo, dotBaseMat.clone());
        dot.position.copy(dotPosition);
        // Fixed visual size — compensate for parent world scale
        const worldScale = new THREE.Vector3();
        child.getWorldScale(worldScale);
        const avgScale = (worldScale.x + worldScale.y + worldScale.z) / 3;
        const fixedSize = 0.03 / avgScale;
        dot.scale.set(fixedSize, fixedSize, fixedSize);
        dot.raycast = () => {}; // Dots don't intercept raycasts
        dot.userData.isDot = true;
        child.add(dot);
        dotSpritesRef.current.push(dot);
      });

      setLoading(false);
    } catch (e) {
      console.error('Error loading model:', e);
      setError('Failed to load 3D model: ' + e.message);
      setLoading(false);
    }

    // Animation loop — reads events directly, no setTimeout
    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);

      if (modelRef.current) {
        modelRef.current.rotation.x = rotationRef.current.x;
        modelRef.current.rotation.y = rotationRef.current.y;

        const s = scaleRef.current;
        modelRef.current.scale.set(s, s, s);

        // Show/hide dot sprites based on playback state + camera facing
        const playing = isPlayingRef.current;
        if (playing) {
          for (const dot of dotSpritesRef.current) {
            dot.visible = false;
          }
        } else {
          const camPos = cameraRef.current.position;
          const modelPos = modelRef.current.position;
          const dotWorldPos = new THREE.Vector3();
          const toCam = new THREE.Vector3();
          const toCenter = new THREE.Vector3();
          for (const dot of dotSpritesRef.current) {
            dot.getWorldPosition(dotWorldPos);
            // Vector from model center to dot
            toCenter.subVectors(dotWorldPos, modelPos);
            // Vector from dot to camera
            toCam.subVectors(camPos, dotWorldPos);
            // If dot faces camera (same hemisphere), show it
            dot.visible = toCenter.dot(toCam) > 0;
          }
        }

        // Determine which parts are active at current playback position
        const pos = playbackPositionRef.current;
        const events = eventsRef.current;

        // Build a map: partName -> { event, intensity }
        const activeMap = new Map();
        const lightParts = ['light_left_front', 'light_right_front', 'light_left_back', 'light_right_back',
          'blink_front_left', 'blink_front_right', 'blink_back_left', 'blink_back_right'];

        for (const evt of events) {
          if (pos >= evt.startMs && pos < evt.endMs) {
            let intensity = (evt.power ?? 100) / 100;
            const evtDuration = evt.endMs - evt.startMs;
            const elapsed = pos - evt.startMs;
            const remaining = evt.endMs - pos;
            const easeDuration = Math.min(evtDuration * 0.3, 300);

            if (evt.easeIn && elapsed < easeDuration && easeDuration > 0) {
              intensity *= elapsed / easeDuration;
            }
            if (evt.easeOut && remaining < easeDuration && easeDuration > 0) {
              intensity *= remaining / easeDuration;
            }

            let blinkOff = false;
            if (evt.effect === 'blink') {
              const speedIdx = evt.blinkSpeed ?? 0;
              const periodMs = BLINK_SPEEDS[speedIdx]?.periodMs ?? 80;
              blinkOff = (Math.floor(elapsed / (periodMs / 2)) % 2) !== 0;
            }

            activeMap.set(evt.part, { evt, intensity, blinkOff });
          }
        }

        // Update SpotLight intensities
        const MAX_SPOT_INTENSITY = 5;
        for (const partName of lightParts) {
          const spot = spotLightsRef.current[partName];
          if (!spot) continue;
          const active = activeMap.get(partName);
          if (active && !active.blinkOff) {
            spot.intensity = active.intensity * MAX_SPOT_INTENSITY;
          } else {
            spot.intensity = 0;
          }
        }

        // Apply materials based on active events
        modelRef.current.traverse((child) => {
          if (!child.isMesh) return;
          const partName = child.userData.interactiveName;
          if (!partName) return;
          if (selectedMeshRef.current && selectedMeshRef.current.userData.interactiveName === partName) return;

          const active = activeMap.get(partName);
          if (active) {
            const isHeadlight = isLight(partName) && partName.includes('front');
            const isTaillight = isLight(partName) && partName.includes('back');
            const isBlink = isBlinker(partName);
            if (!isHeadlight && !isTaillight && !isBlink) return;

            if (active.blinkOff) {
              const originalMat = meshMaterialsRef.current.get(partName);
              if (originalMat) child.material = originalMat;
              return;
            }

            const litMat = isBlink ? litBlinkerMatRef.current
                         : isHeadlight ? litHeadlightMatRef.current
                         : litTaillightMatRef.current;
            if (!litMat) return;
            const originalMat = meshMaterialsRef.current.get(partName);
            if (!originalMat) return;

            const intensity = active.intensity;
            if (!child.userData._dynamicMat) {
              child.userData._dynamicMat = litMat.clone();
            }
            const mat = child.userData._dynamicMat;
            const litColor = litMat.color;
            const offColor = originalMat.color;
            mat.color.r = offColor.r + (litColor.r - offColor.r) * intensity;
            mat.color.g = offColor.g + (litColor.g - offColor.g) * intensity;
            mat.color.b = offColor.b + (litColor.b - offColor.b) * intensity;
            mat.emissive.r = litMat.emissive.r * intensity;
            mat.emissive.g = litMat.emissive.g * intensity;
            mat.emissive.b = litMat.emissive.b * intensity;
            mat.emissiveIntensity = litMat.emissiveIntensity * intensity;
            child.material = mat;
          } else {
            const originalMat = meshMaterialsRef.current.get(partName);
            if (originalMat && child.material !== originalMat) {
              child.material = originalMat;
              if (child.userData._dynamicMat) {
                child.userData._dynamicMat = null;
              }
            }
          }
        });

        // Animate retro mirrors based on retroMode: close, open, roundtrip
        // "close" leaves the retro folded after the event until an "open" event
        const RETRO_FOLD_ANGLE = Math.PI / 3; // 60° fold
        const retroParts = ['retro_left', 'retro_right'];
        const _zAxis = new THREE.Vector3(0, 0, 1);
        for (const partName of retroParts) {
          const retroData = retroNodesRef.current[partName];
          if (!retroData || !retroData.mesh) continue;
          const mesh = retroData.mesh;
          const active = activeMap.get(partName);

          // Determine the retro state: find the last retro event that ended before pos
          // to know if the retro should be closed or open at rest
          let restClosed = false;
          for (const evt of events) {
            if (evt.part !== partName) continue;
            if (evt.endMs <= pos) {
              // This event has finished — check its final state
              if (evt.retroMode === 'close') restClosed = true;
              else if (evt.retroMode === 'open') restClosed = false;
              // roundtrip ends open
            }
          }

          let progress = restClosed ? 1 : 0;

          if (active) {
            const elapsed = pos - active.evt.startMs;
            const evtDuration = active.evt.endMs - active.evt.startMs;
            const t = evtDuration > 0 ? Math.min(elapsed / evtDuration, 1) : 0;
            const mode = active.evt.retroMode || 'roundtrip';

            if (mode === 'close') {
              // 0→1 over duration (fold in)
              progress = Math.sin(t * Math.PI / 2);
            } else if (mode === 'open') {
              // 1→0 over duration (fold out)
              progress = Math.cos(t * Math.PI / 2);
            } else {
              // roundtrip: 0→1→0
              const pingPong = t <= 0.5 ? t * 2 : (1 - t) * 2;
              progress = Math.sin(pingPong * Math.PI / 2);
            }
          }

          const sign = partName === 'retro_left' ? 1 : -1;
          const angle = sign * RETRO_FOLD_ANGLE * progress;
          // Slide retro toward car body as it folds (left: +X, right: -X)
          const RETRO_SLIDE = 0.15; // units toward body
          const slideX = -sign * RETRO_SLIDE * progress;

          if (progress === 0) {
            mesh.matrix.copy(retroData.initMatrix);
          } else {
            const c = retroData.geoCenter;
            const toOrigin = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z);
            const rot = new THREE.Matrix4().makeRotationAxis(_zAxis, angle);
            const fromOrigin = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z);
            const slide = new THREE.Matrix4().makeTranslation(slideX, 0, 0);
            const combined = retroData.initMatrix.clone()
              .multiply(slide)
              .multiply(fromOrigin)
              .multiply(rot)
              .multiply(toOrigin);
            mesh.matrix.copy(combined);
          }
          mesh.matrixAutoUpdate = false;
        }

        // Animate windows: dance mode (oscillation haut/bas)
        // The window oscillates between up and ~60% down with a smooth sine wave
        const DANCE_CYCLE_MS = 3500; // one full oscillation = 3.5s (1.75s down + 1.75s up)
        const DANCE_AMPLITUDE = 1.0; // 100% of full travel
        const windowParts = ['window_left_front', 'window_right_front', 'window_left_back', 'window_right_back'];
        for (const partName of windowParts) {
          const winData = windowNodesRef.current[partName];
          if (!winData || !winData.mesh) continue;
          const mesh = winData.mesh;
          const active = activeMap.get(partName);

          const REST_OPEN = 0.7; // windows start 20% open at show start
          let progress = REST_OPEN;

          if (active) {
            const elapsed = pos - active.evt.startMs;
            const evtDuration = active.evt.endMs - active.evt.startMs;
            // Smooth sine oscillation starting from REST_OPEN, going further down, then back
            const phase = (elapsed / DANCE_CYCLE_MS) * Math.PI * 2;
            // Oscillates between REST_OPEN (0.7) and 0.3 (more closed)
            const danceRange = REST_OPEN - 0.3;
            const wave = danceRange * (0.5 - 0.5 * Math.cos(phase));
            progress = REST_OPEN - wave;
            // Ease in at start, ease out back to REST_OPEN at end
            const fadeIn = Math.min(elapsed / 400, 1);
            const fadeOut = Math.min((evtDuration - elapsed) / 400, 1);
            const fade = fadeIn * Math.max(fadeOut, 0);
            progress = REST_OPEN + (progress - REST_OPEN) * fade;
          }

          if (progress === 0) {
            mesh.matrix.copy(winData.initMatrix);
          } else {
            const slideDown = new THREE.Matrix4().makeTranslation(0, 0, -winData.travelZ * progress);
            const combined = winData.initMatrix.clone().multiply(slideDown);
            mesh.matrix.copy(combined);
          }
          mesh.matrixAutoUpdate = false;
        }
      }

      renderer.render(scene, camera);
      gl.endFrameEXP();
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
                  {t(`parts.${selectedPart}`, { defaultValue: PART_LABELS[selectedPart] || selectedPart })}
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
                <Text style={styles.loadingText}>{t('editor.loadingModel')}</Text>
              </View>
            )}

            {error && (
              <View style={styles.loadingOverlay}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {playbackSpeed !== 1 && (
              <TouchableOpacity style={styles.speedBadge} onPress={() => setSettingsVisible(true)}>
                <Text style={styles.speedBadgeText}>{playbackSpeed}x</Text>
              </TouchableOpacity>
            )}
          </View>
        </GestureDetector>
      </View>

      {/* Bottom: scrollable timeline + options */}
      <ScrollView style={styles.bottomSection} contentContainerStyle={styles.bottomContent}>
        {/* Timeline */}
        <View style={styles.timelineSection}>
          <AudioTimeline
            ref={audioTimelineRef}
            selectedPart={selectedPart}
            eventOptions={eventOptions}
            cursorOffsetMs={cursorOffsetMs}
            playbackSpeed={playbackSpeed}
            timelineScale={timelineScale}
            isLoadingShow={isLoadingShow}
            selectedEventId={selectedEvent?.id || null}
            onEventsChange={(evts) => { eventsRef.current = evts; scheduleSave(); }}
            onPlayingChange={(playing) => { isPlayingRef.current = playing; }}
            onPositionChange={(pos, dur) => {
              playbackPositionRef.current = pos;
              playbackDurationRef.current = dur;
            }}
            onEventSelect={(evt) => {
              setSelectedEvent(evt);
              setEventOptions({
                durationMs: evt.endMs - evt.startMs,
                effect: evt.effect,
                power: evt.power ?? 100,
                blinkSpeed: evt.blinkSpeed ?? 0,
                easeIn: evt.easeIn ?? false,
                easeOut: evt.easeOut ?? false,
                retroMode: evt.retroMode ?? 'roundtrip',
                windowMode: evt.windowMode ?? 'window_down',
                windowDurationMs: evt.windowDurationMs ?? 3000,
                trunkMode: evt.trunkMode ?? 'trunk_open',
                flapMode: evt.flapMode ?? 'flap_open',
              });
            }}
            onEventUpdate={(updatedEvt) => {
              eventsRef.current = eventsRef.current.map((e) =>
                e.id === updatedEvt.id ? updatedEvt : e
              );
              scheduleSave();
            }}
            onDeselectPart={() => {
              selectPart(null);
              setSelectedEvent(null);
            }}
          />
        </View>

        {/* Part options panel */}
        <View style={styles.optionsSection}>
          <PartOptionsPanel
            selectedPart={selectedEvent?.part || selectedPart}
            eventOptions={eventOptions}
            editingEvent={selectedEvent}
            events={eventsRef.current}
            onOptionsChange={(newOpts) => {
              setEventOptions(newOpts);
              if (selectedEvent) {
                // Update the selected event in the timeline
                const updatedEvt = {
                  ...selectedEvent,
                  endMs: selectedEvent.startMs + newOpts.durationMs,
                  effect: newOpts.effect,
                  power: newOpts.power,
                  blinkSpeed: newOpts.blinkSpeed,
                  easeIn: newOpts.easeIn,
                  easeOut: newOpts.easeOut,
                  retroMode: newOpts.retroMode,
                  windowMode: newOpts.windowMode,
                  windowDurationMs: newOpts.windowDurationMs,
                  trunkMode: newOpts.trunkMode,
                  flapMode: newOpts.flapMode,
                };
                setSelectedEvent(updatedEvt);
                eventsRef.current = eventsRef.current.map((e) =>
                  e.id === updatedEvt.id ? updatedEvt : e
                );
                audioTimelineRef.current?.updateEvent(updatedEvt);
              }
            }}
            onDeselectEvent={() => setSelectedEvent(null)}
            onDeleteEvent={handleDeleteEvent}
          />
        </View>
      </ScrollView>

      {/* Burger menu button */}
      <TouchableOpacity
        style={styles.burgerButton}
        onPress={() => setMenuVisible(true)}
      >
        <Text style={styles.burgerIcon}>☰</Text>
      </TouchableOpacity>

      {/* Burger menu modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuContent} onStartShouldSetResponder={() => true}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                if (onGoHome) onGoHome();
              }}
            >
              <Text style={styles.menuItemIcon}>🏠</Text>
              <Text style={styles.menuItemText}>{t('editor.home')}</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                setSettingsVisible(true);
              }}
            >
              <Text style={styles.menuItemIcon}>⚙</Text>
              <Text style={styles.menuItemText}>{t('editor.advancedSettings')}</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                Alert.alert(
                  t('editor.resetEvents'),
                  t('editor.resetEventsConfirm'),
                  [
                    { text: t('editor.cancel'), style: 'cancel' },
                    {
                      text: t('editor.delete'),
                      style: 'destructive',
                      onPress: () => {
                        setMenuVisible(false);
                        setSelectedEvent(null);
                        audioTimelineRef.current?.clearAllEvents();
                        eventsRef.current = [];
                        scheduleSave();
                      },
                    },
                  ]
                );
              }}
            >
              <Text style={styles.menuItemIcon}>🗑</Text>
              <Text style={styles.menuItemText}>{t('editor.resetEvents')}</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                setExportVisible(true);
              }}
            >
              <Text style={styles.menuItemIcon}>📤</Text>
              <Text style={styles.menuItemText}>{t('editor.export')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Settings bottom panel */}
      <Modal
        visible={settingsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.settingsOverlay} onPress={() => setSettingsVisible(false)}>
            <ScrollView
              style={styles.settingsPanel}
              onStartShouldSetResponder={() => true}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.settingsHeader}>
                <View style={styles.settingsHandle} />
                <Text style={styles.settingsTitle}>{t('editor.advancedSettings')}</Text>
                <TouchableOpacity style={styles.settingsCloseBtn} onPress={() => setSettingsVisible(false)}>
                  <Text style={styles.settingsCloseBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Renommer le projet */}
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>{t('editor.projectName')}</Text>
                <TextInput
                  style={styles.renameInput}
                  value={showName}
                  onChangeText={(text) => {
                    setShowName(text);
                    if (showDataRef.current) {
                      showDataRef.current.name = text;
                      scheduleSave();
                    }
                  }}
                  placeholder={t('editor.projectNamePlaceholder')}
                  placeholderTextColor="#555577"
                  maxLength={40}
                />
              </View>

              <View style={styles.menuDivider} />

              {/* Couleur carrosserie */}
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>{t('editor.bodyColor')}</Text>
                <View style={styles.menuColorRow}>
                  {BODY_COLORS.map((c) => (
                    <TouchableOpacity
                      key={c.hex}
                      onPress={() => changeBodyColor(c.hex)}
                      style={[
                        styles.menuColorDot,
                        { backgroundColor: c.hex },
                        activeColor === c.hex && styles.menuColorDotActive,
                      ]}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.menuDivider} />

              {/* Offset curseur */}
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>{t('editor.cursorOffset')}</Text>
                <View style={styles.offsetRow}>
                  <TouchableOpacity
                    style={styles.offsetBtn}
                    onPress={() => { setCursorOffsetMs((v) => v - 50); scheduleSave(); }}
                  >
                    <Text style={styles.offsetBtnText}>−50</Text>
                  </TouchableOpacity>
                  <Text style={styles.offsetValue}>{cursorOffsetMs} ms</Text>
                  <TouchableOpacity
                    style={styles.offsetBtn}
                    onPress={() => { setCursorOffsetMs((v) => v + 50); scheduleSave(); }}
                  >
                    <Text style={styles.offsetBtnText}>+50</Text>
                  </TouchableOpacity>
                  {cursorOffsetMs !== 0 && (
                    <TouchableOpacity
                      style={styles.offsetResetBtn}
                      onPress={() => { setCursorOffsetMs(0); scheduleSave(); }}
                    >
                      <Text style={styles.offsetResetText}>Reset</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.menuDivider} />

              {/* Allumer la lumière */}
              <View style={styles.settingsSection}>
                <TouchableOpacity style={styles.brightToggle} onPress={toggleBrightMode}>
                  <Text style={styles.settingsSectionTitle}>{t('editor.brightMode')}</Text>
                  <Text style={styles.brightToggleIcon}>{brightMode ? '☀️' : '🌙'}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.menuDivider} />

              {/* Vitesse de lecture */}
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>{t('editor.playbackSpeed')}</Text>
                <View style={styles.speedRow}>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                    <TouchableOpacity
                      key={speed}
                      style={[styles.speedBtn, playbackSpeed === speed && styles.speedBtnActive]}
                      onPress={() => { setPlaybackSpeed(speed); scheduleSave(); }}
                    >
                      <Text style={[styles.speedBtnText, playbackSpeed === speed && styles.speedBtnTextActive]}>
                        {speed}x
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.menuDivider} />

              {/* Taille timeline */}
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>{t('editor.timelineHeight')}</Text>
                <View style={styles.offsetRow}>
                  <TouchableOpacity
                    style={styles.offsetBtn}
                    onPress={() => { setTimelineScale((v) => Math.max(1, +(v - 0.25).toFixed(2))); scheduleSave(); }}
                  >
                    <Text style={styles.offsetBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.offsetValue}>{Math.round(timelineScale * 100)}%</Text>
                  <TouchableOpacity
                    style={styles.offsetBtn}
                    onPress={() => { setTimelineScale((v) => Math.min(2, +(v + 0.25).toFixed(2))); scheduleSave(); }}
                  >
                    <Text style={styles.offsetBtnText}>+</Text>
                  </TouchableOpacity>
                  {timelineScale !== 1 && (
                    <TouchableOpacity
                      style={styles.offsetResetBtn}
                      onPress={() => { setTimelineScale(1); scheduleSave(); }}
                    >
                      <Text style={styles.offsetResetText}>Reset</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.menuDivider} />

              {/* Communauté */}
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>{t('editor.community')}</Text>
                <TouchableOpacity
                  style={styles.shareLoadBtn}
                  onPress={() => { setSettingsVisible(false); setShareVisible(true); }}
                >
                  <Text style={styles.shareLoadBtnText}>{t('editor.share')}</Text>
                </TouchableOpacity>
              </View>

              {/* Charger */}
              <View style={styles.settingsSection}>
                <TouchableOpacity
                  style={styles.shareLoadBtn}
                  onPress={() => { setSettingsVisible(false); setLoadVisible(true); }}
                >
                  <Text style={styles.shareLoadBtnText}>{t('editor.load')}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.menuDivider} />

              {/* Contact développeur */}
              <TouchableOpacity
                style={styles.contactDevSection}
                onPress={() => Linking.openURL('mailto:guillaumeharari@hotmail.com?subject=Light Studio for Tesla')}
              >
                <Text style={styles.contactDevText}>{t('editor.contactDev')}</Text>
                <Text style={styles.contactDevSub}>{t('editor.contactDevSub')} ✉️</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Share modal */}
      <Modal
        visible={shareVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setShareVisible(false)}
      >
        <Pressable style={styles.centeredOverlay} onPress={() => setShareVisible(false)}>
          <View style={styles.shareLoadModal} onStartShouldSetResponder={() => true}>
            <Text style={styles.shareLoadTitle}>{t('share.title')}</Text>
            <Text style={styles.shareLoadDesc}>{t('share.description')}</Text>
            {eventsRef.current.length === 0 ? (
              <Text style={styles.shareLoadWarning}>{t('share.noEvents')}</Text>
            ) : (
              <TouchableOpacity
                style={styles.shareLoadAction}
                onPress={async () => {
                  try {
                    const data = {
                      _format: 'lightstudio_v1',
                      name: showName || 'Light Show',
                      events: eventsRef.current,
                    };
                    const json = JSON.stringify(data, null, 2);
                    const fileName = (showName || 'lightshow').replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
                    const destUri = FileSystem.documentDirectory + fileName;
                    await FileSystem.writeAsStringAsync(destUri, json);
                    await Sharing.shareAsync(destUri, { mimeType: 'application/json', dialogTitle: t('share.title') });
                    setShareVisible(false);
                  } catch (e) {
                    console.error('Share error:', e);
                    alert(t('export.shareError') + e.message);
                  }
                }}
              >
                <Text style={styles.shareLoadActionText}>{t('share.shareBtn')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Load modal */}
      <Modal
        visible={loadVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLoadVisible(false)}
      >
        <Pressable style={styles.centeredOverlay} onPress={() => setLoadVisible(false)}>
          <View style={styles.shareLoadModal} onStartShouldSetResponder={() => true}>
            <Text style={styles.shareLoadTitle}>{t('load.title')}</Text>
            <Text style={styles.shareLoadDesc}>{t('load.description')}</Text>
            {!audioTimelineRef.current?.getTrackInfo() ? (
              <Text style={styles.shareLoadWarning}>{t('load.noTrack')}</Text>
            ) : (
              <>
                <Text style={styles.shareLoadWarningSmall}>{t('load.warning')}</Text>
                <TouchableOpacity
                  style={styles.shareLoadAction}
                  onPress={async () => {
                    try {
                      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
                      if (result.canceled || !result.assets || result.assets.length === 0) return;
                      const fileUri = result.assets[0].uri;
                      const raw = await FileSystem.readAsStringAsync(fileUri);
                      const data = JSON.parse(raw);
                      if (!data || !data._format || data._format !== 'lightstudio_v1' || !Array.isArray(data.events)) {
                        alert(t('export.loadInvalidFile'));
                        return;
                      }
                      if (data.events.length === 0) {
                        alert(t('export.loadNoEvents'));
                        return;
                      }
                      audioTimelineRef.current?.loadEvents(data.events);
                      eventsRef.current = data.events;
                      scheduleSave();
                      setLoadVisible(false);
                      Alert.alert(t('load.title'), t('export.loadSuccess', { count: data.events.length }));
                    } catch (e) {
                      console.error('Load error:', e);
                      alert(t('export.loadError') + e.message);
                    }
                  }}
                >
                  <Text style={styles.shareLoadActionText}>{t('load.loadBtn')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Export tutorial modal */}
      <ExportModal
        visible={exportVisible}
        onClose={() => setExportVisible(false)}
        trackInfo={audioTimelineRef.current?.getTrackInfo() || null}
        onExportFseq={async () => {
          try {
            const duration = playbackDurationRef.current;
            const result = await exportFseq(eventsRef.current, duration);
            console.log(`Export OK: ${result.frameCount} frames, ${result.fileSize} bytes`);
          } catch (e) {
            console.error('Export error:', e);
            alert(t('editor.exportError') + e.message);
          }
        }}
        onExportMp3={async () => {
          try {
            const trackInfo = audioTimelineRef.current?.getTrackInfo();
            if (!trackInfo?.isBuiltin) return;
            const track = MP3_TRACKS.find((t) => t.id === trackInfo.id);
            if (!track) throw new Error(t('editor.trackNotFound'));
            const asset = Asset.fromModule(track.file);
            await asset.downloadAsync();
            const destUri = FileSystem.documentDirectory + 'lightshow.mp3';
            await FileSystem.copyAsync({ from: asset.localUri, to: destUri });
            await Sharing.shareAsync(destUri, { mimeType: 'audio/mpeg', dialogTitle: 'Export lightshow.mp3' });
          } catch (e) {
            console.error('MP3 export error:', e);
            alert(t('editor.mp3ExportError') + e.message);
          }
        }}
      />
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
  menuColorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  menuColorDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#333355',
  },
  menuColorDotActive: {
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
  burgerButton: {
    position: 'absolute',
    top: 46,
    right: 14,
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(30, 30, 60, 0.85)',
    borderWidth: 1,
    borderColor: '#3a3a5a',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  burgerIcon: {
    color: '#ccccee',
    fontSize: 24,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 86,
    paddingRight: 14,
  },
  menuContent: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    paddingVertical: 6,
    minWidth: 200,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  menuItemIcon: {
    color: '#e94560',
    fontSize: 18,
  },
  menuItemText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#2a2a4a',
    marginHorizontal: 12,
  },
  offsetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  offsetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#1a1a3a',
    borderWidth: 1,
    borderColor: '#3a3a5a',
  },
  offsetBtnText: {
    color: '#ccccee',
    fontSize: 12,
    fontWeight: '600',
  },
  offsetValue: {
    color: '#e94560',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 55,
    textAlign: 'center',
  },
  offsetResetBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
  },
  offsetResetText: {
    color: '#e94560',
    fontSize: 11,
    fontWeight: '600',
  },
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 6,
    flexWrap: 'wrap',
  },
  speedBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#2a2a4a',
    borderWidth: 1,
    borderColor: '#3a3a5a',
  },
  speedBtnActive: {
    backgroundColor: '#44aaff',
    borderColor: '#44aaff',
  },
  speedBtnText: {
    color: '#ccccee',
    fontSize: 12,
    fontWeight: '600',
  },
  speedBtnTextActive: {
    color: '#ffffff',
  },
  brightToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  brightToggleIcon: {
    fontSize: 22,
  },
  speedBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(68, 170, 255, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  speedBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  contactDevSection: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  contactDevText: {
    color: '#8888aa',
    fontSize: 13,
  },
  contactDevSub: {
    color: '#44aaff',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  settingsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  settingsPanel: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: '#2a2a4a',
    paddingBottom: 30,
    paddingTop: 10,
  },
  settingsHeader: {
    position: 'relative',
    alignItems: 'center',
    marginBottom: 18,
  },
  settingsHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#444466',
    alignSelf: 'center',
    marginBottom: 14,
  },
  settingsTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  settingsCloseBtn: {
    position: 'absolute',
    right: 16,
    top: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(60, 60, 90, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsCloseBtnText: {
    color: '#aaaacc',
    fontSize: 16,
    fontWeight: '600',
  },
  settingsSection: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  settingsSectionTitle: {
    color: '#ccccee',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  renameInput: {
    backgroundColor: 'rgba(40, 40, 70, 0.6)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a5a',
    color: '#ffffff',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  shareLoadBtn: {
    backgroundColor: 'rgba(40, 40, 70, 0.6)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3a3a5a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  shareLoadBtnText: {
    color: '#ccccee',
    fontSize: 14,
    fontWeight: '600',
  },
  centeredOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareLoadModal: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    width: '85%',
    padding: 24,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  shareLoadTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center',
  },
  shareLoadDesc: {
    color: '#aaaacc',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
    textAlign: 'center',
  },
  shareLoadWarning: {
    color: '#e94560',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 4,
  },
  shareLoadWarningSmall: {
    color: '#ffaa44',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 16,
  },
  shareLoadAction: {
    backgroundColor: '#44aaff',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  shareLoadActionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
