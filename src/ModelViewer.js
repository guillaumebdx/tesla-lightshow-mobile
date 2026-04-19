import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TextInput, TouchableOpacity, Dimensions, ScrollView, Modal, Pressable, Alert, KeyboardAvoidingView, Platform, Linking, Animated as RNAnimated, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { INTERACTIVE_PARTS, PART_LABELS, PART_COLORS, EFFECT_TYPES, BLINK_SPEEDS, PULSE_SPEEDS, DEFAULT_EVENT_OPTIONS, RETRO_MODES, RETRO_DURATIONS, TRUNK_MODES, TRUNK_DURATIONS, FLAP_MODES, FLAP_DURATIONS, CLOSURE_LIMITS, closureCommandCost, isRetro, isWindow, isLight, isBlinker, isTrunk, isFlap, isClosure, isRgb } from './constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { MP3_TRACKS } from '../assets/mp3/index';
import { exportFseq } from './fseqExport';
import { getGlbModule } from './carModels';
import { loadShow, saveShow } from './storage';
import ExportModal from './ExportModal';
import FlashMessage from './FlashMessage';
import TutorialOverlay from './TutorialOverlay';
import { Ionicons } from '@expo/vector-icons';
import { generateAIShow } from './aiService';
import { trackEvent } from './analyticsService';
import AiPromptModal from './AiPromptModal';
import SupportChat from './SupportChat';
import { hasEverSentMessage, fetchChatStatus } from './chatService';

export default function ModelViewer({ showId, onGoHome }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPart, setSelectedPart] = useState(null);
  const [showInterior, setShowInterior] = useState(false);
  const showInteriorRef = useRef(false);
  const [carModel, setCarModel] = useState('model_3');
  const eventsRef = useRef([]);
  const undoStackRef = useRef([]);   // Array of event snapshots
  const redoStackRef = useRef([]);
  const MAX_UNDO = 50;
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const lastEventsIdentityRef = useRef(null);
  const sortedEventsRef = useRef([]);
  const playbackPositionRef = useRef(0);
  const playbackDurationRef = useRef(0);
  const [eventOptions, setEventOptions] = useState({ ...DEFAULT_EVENT_OPTIONS });
  const [menuVisible, setMenuVisible] = useState(false);
  const drawerAnim = useRef(new RNAnimated.Value(0)).current;
  const overlayAnim = useRef(new RNAnimated.Value(0)).current;
  const DRAWER_WIDTH = 260;
  const openDrawer = useCallback(() => {
    setMenuVisible(true);
    RNAnimated.parallel([
      RNAnimated.spring(drawerAnim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 4 }),
      RNAnimated.timing(overlayAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [drawerAnim, overlayAnim]);
  const closeDrawer = useCallback((cb) => {
    RNAnimated.parallel([
      RNAnimated.timing(drawerAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      RNAnimated.timing(overlayAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      setMenuVisible(false);
      if (cb) cb();
    });
  }, [drawerAnim, overlayAnim]);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  const [loadVisible, setLoadVisible] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const chatPollRef = useRef(null);
  const [cursorOffsetMs, _setCursorOffsetMs] = useState(0);
  const cursorOffsetMsRef = useRef(0);
  const setCursorOffsetMs = useCallback((valOrFn) => {
    _setCursorOffsetMs((prev) => {
      const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      cursorOffsetMsRef.current = next;
      return next;
    });
  }, []);
  const flashRef = useRef(null);
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

  // Tutorial state
  const [tutorialStep, setTutorialStep] = useState(null); // null = hidden, 0-3 = step

  const handleTutorialNext = useCallback(() => {
    setTutorialStep((prev) => {
      if (prev === null) return null;
      if (prev >= 4) {
        // Done — close drawer opened at step 4
        closeDrawer();
        return null;
      }
      const next = prev + 1;
      // Moving to step 1 (options) — auto-select a headlight if nothing selected
      if (next === 1 && !selectedPart) {
        selectPart('left_high_light');
      }
      // Step 4: open the burger menu
      if (next === 4) {
        openDrawer();
      }
      return next;
    });
  }, [openDrawer, closeDrawer, selectedPart, selectPart]);

  const handleTutorialSkip = useCallback(() => {
    setTutorialStep(null);
    // Close drawer if open from step 4
    if (menuVisible) closeDrawer();
  }, [menuVisible, closeDrawer]);

  const handleTrackSelected = useCallback((hasDemo) => {
    // Skip tutorial if user chose "Music + Demo" or if events already exist
    if (hasDemo || eventsRef.current.length > 0) return;
    setTimeout(() => setTutorialStep(0), 600);
  }, []);

  // AI light show generation
  const [aiPromptModalVisible, setAiPromptModalVisible] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const aiGeneratingRef = useRef(false);
  const [aiProgressMsg, setAiProgressMsg] = useState('');
  const aiTimerRef = useRef(null);
  const aiFakeIntervalRef = useRef(null);

  // Light parts for random animation during AI generation
  const AI_LIGHT_PARTS = ['left_high_light', 'right_high_light', 'left_signature_light', 'right_signature_light',
    'light_left_back', 'light_right_back',
    'blink_front_left', 'blink_front_right', 'blink_back_left', 'blink_back_right',
    'license_plate', 'brake_lights', 'rear_fog', 'reversing_lights',
    'side_repeater_left', 'side_repeater_right'];

  const startAiAnimation = useCallback((trackDurationMs) => {
    aiGeneratingRef.current = true;
    const startTime = Date.now();
    let fakeCount = 0;

    // Estimate generation duration: ~30s base + ~10s per minute of track
    const trackMinutes = (trackDurationMs || 60000) / 60000;
    const estimatedDurationS = Math.max(30, 30 + trackMinutes * 10);

    // Messages split: first 15% = 5 analysis messages, remaining 85% = adding/refining messages
    const analysisMessages = [
      t('editor.aiStep1'), // Analyzing waveform
      t('editor.aiStep2'), // Detecting beats
      t('editor.aiStep3'), // Identifying sections
      t('editor.aiStep4'), // Mapping energy levels
      t('editor.aiStep5'), // Building show structure
    ];
    const buildMessages = [
      t('editor.aiStep6'),  // Adding light sequences
      t('editor.aiStep7'),  // Placing blink patterns
      t('editor.aiStep8'),  // Syncing to beat drops
      t('editor.aiStep9'),  // Adding transitions
      t('editor.aiStep10'), // Refining choreography
      t('editor.aiStep11'), // Polishing final details
    ];

    const analysisEndS = estimatedDurationS * 0.15;
    const analysisMsgDurationS = analysisEndS / analysisMessages.length;
    const buildMsgDurationS = (estimatedDurationS * 0.85) / buildMessages.length;

    let msgIndex = 0;
    setAiProgressMsg(analysisMessages[0]);

    // Rotate messages based on estimated progress (never loops back)
    aiTimerRef.current = setInterval(() => {
      if (!aiGeneratingRef.current) return;
      const elapsedS = (Date.now() - startTime) / 1000;

      if (elapsedS < analysisEndS) {
        // Analysis phase (first 15%)
        const idx = Math.min(Math.floor(elapsedS / analysisMsgDurationS), analysisMessages.length - 1);
        if (idx !== msgIndex) { msgIndex = idx; setAiProgressMsg(analysisMessages[idx]); }
      } else {
        // Build phase (remaining 85%)
        const buildElapsed = elapsedS - analysisEndS;
        const idx = Math.min(Math.floor(buildElapsed / buildMsgDurationS), buildMessages.length - 1);
        const globalIdx = analysisMessages.length + idx;
        if (globalIdx !== msgIndex) { msgIndex = globalIdx; setAiProgressMsg(buildMessages[idx]); }
      }
    }, 800);

    // Fake events: add one every 300-800ms with random part/position
    const addFakeEvent = () => {
      if (!aiGeneratingRef.current) return;
      fakeCount++;
      const part = AI_LIGHT_PARTS[Math.floor(Math.random() * AI_LIGHT_PARTS.length)];
      const maxPos = trackDurationMs || 60000;
      const startMs = Math.floor(Math.random() * (maxPos - 2000));
      const duration = 300 + Math.floor(Math.random() * 1500);
      const fakeEvent = {
        id: `ai_fake_${fakeCount}_${Date.now()}`,
        part,
        startMs,
        endMs: Math.min(startMs + duration, maxPos),
        effect: Math.random() > 0.5 ? 'blink' : 'solid',
        power: 60 + Math.floor(Math.random() * 40),
        blinkSpeed: Math.floor(Math.random() * 3),
        easeIn: Math.random() > 0.6,
        easeOut: Math.random() > 0.6,
      };
      const currentEvents = eventsRef.current;
      const updatedEvents = [...currentEvents, fakeEvent];
      eventsRef.current = updatedEvents;
      audioTimelineRef.current?.loadEvents(updatedEvents);
      aiFakeIntervalRef.current = setTimeout(addFakeEvent, 300 + Math.floor(Math.random() * 500));
    };
    aiFakeIntervalRef.current = setTimeout(addFakeEvent, 500);
  }, [t]);

  const stopAiAnimation = useCallback(() => {
    aiGeneratingRef.current = false;
    if (aiTimerRef.current) { clearInterval(aiTimerRef.current); aiTimerRef.current = null; }
    if (aiFakeIntervalRef.current) { clearTimeout(aiFakeIntervalRef.current); aiFakeIntervalRef.current = null; }
    setAiProgressMsg('');
  }, []);

  const handleAIGenerate = useCallback(() => {
    const trackInfo = audioTimelineRef.current?.getTrackInfo();
    if (!trackInfo) {
      Alert.alert(t('editor.aiGenerate'), t('editor.aiNoTrack'));
      return;
    }
    closeDrawer();
    setAiPromptModalVisible(true);
  }, [t, closeDrawer]);

  const handleAIPromptSubmit = useCallback((userPrompt) => {
    setAiPromptModalVisible(false);
    const trackInfo = audioTimelineRef.current?.getTrackInfo();
    if (!trackInfo) return;

    const doGenerate = async () => {
      setAiGenerating(true);
      const durationMs = Math.round(playbackDurationRef.current || 60000);

      // Clear existing events and start AI animation
      eventsRef.current = [];
      audioTimelineRef.current?.loadEvents([]);
      startAiAnimation(durationMs);

      try {
        // Get waveform data from the selected track
        let waveformData;
        if (trackInfo.isBuiltin) {
          const track = MP3_TRACKS.find(tr => tr.id === trackInfo.id);
          if (track?.waveform) {
            const wf = typeof track.waveform === 'function' ? track.waveform : track.waveform;
            waveformData = wf.bars || wf;
          }
        }
        if (!waveformData) waveformData = [];

        const events = await generateAIShow({
          waveform: waveformData,
          durationMs,
          trackTitle: trackInfo.title || 'Unknown',
          userPrompt: userPrompt || undefined,
        });

        // Stop animation and replace fake events with real AI-generated ones
        stopAiAnimation();
        pushUndo();
        setSelectedEvent(null);
        audioTimelineRef.current?.loadEvents(events);
        eventsRef.current = events;
        scheduleSave();
        flashRef.current?.show(t('editor.aiSuccess', { count: events.length }));
      } catch (err) {
        stopAiAnimation();
        // Clear fake events on error
        eventsRef.current = [];
        audioTimelineRef.current?.loadEvents([]);
        console.error('[AI Generate]', err);
        Alert.alert(t('editor.aiGenerate'), t('editor.aiError', { error: err.message }));
      } finally {
        setAiGenerating(false);
      }
    };

    // Confirm replacement if events already exist
    if (eventsRef.current.length > 0) {
      Alert.alert(
        t('editor.aiGenerate'),
        t('editor.aiConfirm'),
        [
          { text: t('editor.cancel'), style: 'cancel' },
          { text: t('editor.aiConfirmReplace'), style: 'destructive', onPress: doGenerate },
        ]
      );
    } else {
      doGenerate();
    }
  }, [t, scheduleSave, pushUndo, startAiAnimation, stopAiAnimation]);

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

  // Undo/redo helpers
  const pushUndo = useCallback((snapshot) => {
    if (!snapshot) snapshot = [...eventsRef.current];
    undoStackRef.current = [...undoStackRef.current.slice(-(MAX_UNDO - 1)), snapshot];
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const applyEvents = useCallback((newEvents) => {
    eventsRef.current = newEvents;
    audioTimelineRef.current?.setEventsDirectly(newEvents);
    setSelectedEvent(null);
    scheduleSave();
  }, [scheduleSave]);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const current = [...eventsRef.current];
    redoStackRef.current = [...redoStackRef.current, current];
    const prev = undoStackRef.current.pop();
    applyEvents(prev);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
  }, [applyEvents]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const current = [...eventsRef.current];
    undoStackRef.current = [...undoStackRef.current, current];
    const next = redoStackRef.current.pop();
    applyEvents(next);
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
  }, [applyEvents]);

  // Load saved show on mount
  useEffect(() => {
    if (!showId || showLoadedRef.current) return;
    (async () => {
      const data = await loadShow(showId);
      if (!data) return;
      showDataRef.current = data;
      if (data.carModel) setCarModel(data.carModel);
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
      if (data.brightMode !== undefined) setBrightMode(data.brightMode);
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

  // Chat unread badge polling (30s, only if user has ever sent a message)
  const prevChatUnreadRef = useRef(0);
  useEffect(() => {
    let mounted = true;
    const checkUnread = async () => {
      const hasSent = await hasEverSentMessage();
      if (!hasSent || !mounted) return;
      try {
        const data = await fetchChatStatus();
        if (!mounted) return;
        const newUnread = data.unread || 0;
        // Show toast if unread increased and chat is not open
        if (newUnread > prevChatUnreadRef.current && !chatVisible) {
          flashRef.current?.show(t('chat.newReply'), 'info', 4000);
        }
        prevChatUnreadRef.current = newUnread;
        setChatUnread(newUnread);
      } catch {}
    };
    checkUnread();
    chatPollRef.current = setInterval(checkUnread, 30000);
    return () => { mounted = false; if (chatPollRef.current) clearInterval(chatPollRef.current); };
  }, [chatVisible]);

  const handleDeleteEvent = () => {
    if (!selectedEvent) return;
    pushUndo();
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
  const highlightMaterialNoDepthRef = useRef(null);
  const meshMaterialsRef = useRef(new Map());
  const selectedMeshRef = useRef(null);
  const litHeadlightMatRef = useRef(null);
  const litTaillightMatRef = useRef(null);
  const litBlinkerMatRef = useRef(null);
  const spotLightsRef = useRef({}); // { light_left_front: SpotLight, ... }
  const rgbPointLightsRef = useRef({}); // { interior_front_door_right: PointLight }
  const dotSpritesRef = useRef([]); // white dot sprites on interactive parts
  const sceneLightsRef = useRef([]); // all scene lights for brightness toggle
  const [brightMode, _setBrightMode] = useState(true);
  const brightModeRef = useRef(true);
  const setBrightMode = useCallback((v) => { _setBrightMode(v); brightModeRef.current = v; }, []);
  const isPlayingRef = useRef(false);
  const retroNodesRef = useRef({}); // { retro_left: { mesh, geoCenter, initMatrix }, ... }
  const windowNodesRef = useRef({}); // { window_left_front: { mesh, initMatrix, travelY }, ... }
  const trunkNodeRef = useRef(null); // { mesh, initMatrix, pivotLocal }
  const flapNodeRef = useRef(null);  // { mesh, initMatrix, pivotLocal }
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
        const needsNoDepth = meshName === 'flap' || child.renderOrder > 0;
        child.material = needsNoDepth ? highlightMaterialNoDepthRef.current : highlightMaterialRef.current;
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

    // Raycast against all meshes (including dot spheres). Skip invisible
    // ones so interior-view picks report the mesh actually on screen.
    const allMeshes = [];
    model.traverse((child) => {
      if (child.isMesh && child.visible) {
        allMeshes.push(child);
      }
    });

    // In interior view, only RGB LED parts are selectable.
    const interiorOnly = showInteriorRef.current;
    const isSelectable = (name) => !!name && (!interiorOnly || isRgb(name));

    const intersects = raycaster.intersectObjects(allMeshes, false);
    if (intersects.length > 0) {
      const hit = intersects[0].object;
      // DEBUG: in interior view, log every tapped mesh (name + parents + verts)
      if (interiorOnly) {
        const chain = [];
        let n = hit;
        while (n && chain.length < 6) { chain.push(n.name || '(noname)'); n = n.parent; }
        const verts = hit.geometry?.attributes?.position?.count ?? '?';
        console.log('[INTERIOR TAP]', chain.join(' < '), '| verts:', verts);
      }
      const interactiveName = hit.userData.interactiveName;
      if (isSelectable(interactiveName)) {
        selectPart(interactiveName);
      } else {
        // Hit the car body (or a non-selectable interactive) — find the
        // nearest selectable part using dot world positions.
        const hitPoint = intersects[0].point;
        let nearest = null;
        let nearestDist = Infinity;
        const dotWorldPos = new THREE.Vector3();
        for (const dot of dotSpritesRef.current) {
          const parent = dot.parent;
          const name = parent?.userData?.interactiveName;
          if (!isSelectable(name)) continue;
          dot.getWorldPosition(dotWorldPos);
          const dist = hitPoint.distanceTo(dotWorldPos);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = name;
          }
        }
        if (nearest && nearestDist < 1.5) {
          selectPart(nearest);
        } else {
          selectPart(null);
        }
      }
    } else {
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
      color: 0x22ddff,
      metalness: 0.3,
      roughness: 0.15,
      emissive: 0x00aaff,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    highlightMaterialRef.current = highlightMaterial;

    // Flap is embedded under the body — needs depthTest off to be visible
    const highlightMaterialNoDepth = new THREE.MeshStandardMaterial({
      color: 0x22ddff,
      metalness: 0.3,
      roughness: 0.15,
      emissive: 0x00aaff,
      emissiveIntensity: 1.0,
      depthTest: false,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    highlightMaterialNoDepthRef.current = highlightMaterialNoDepth;

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
      side: THREE.DoubleSide,
    });

    const taillightMaterial = new THREE.MeshStandardMaterial({
      color: 0x331111,
      metalness: 0.5,
      roughness: 0.15,
      emissive: 0x000000,
      emissiveIntensity: 0,
      side: THREE.DoubleSide,
    });

    // Lights ON (bright emissive)
    const litHeadlightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.2,
      roughness: 0.05,
      emissive: 0xffffff,
      emissiveIntensity: 1.5,
      side: THREE.DoubleSide,
    });
    litHeadlightMatRef.current = litHeadlightMat;

    const litTaillightMat = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      metalness: 0.2,
      roughness: 0.05,
      emissive: 0xff0000,
      emissiveIntensity: 1.5,
      side: THREE.DoubleSide,
    });
    litTaillightMatRef.current = litTaillightMat;

    // Turn signal (blinker) materials — amber
    const blinkerMaterial = new THREE.MeshBasicMaterial({
      color: 0x332200,
      side: THREE.DoubleSide,
    });

    const litBlinkerMat = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      metalness: 0.2,
      roughness: 0.05,
      emissive: 0xffaa00,
      emissiveIntensity: 1.5,
      side: THREE.DoubleSide,
    });
    litBlinkerMatRef.current = litBlinkerMat;

    // Interior RGB LED base material (off state: dim dark gray strip).
    // `toneMapped: false` bypasses the scene's ACES compression so the emissive
    // can actually look fully saturated/bright instead of getting crushed.
    const rgbMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.1,
      roughness: 0.6,
      emissive: 0x000000,
      emissiveIntensity: 0,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    // Map non-standard Blender node names to clean part names
    const nodeNameMap = {
      'blink_front_left002': 'blink_front_left',
      'blink_front_left.002': 'blink_front_left',
      'blin_back_right': 'blink_back_right',
      'plaque': 'license_plate',
      'stop_light': 'brake_lights',
      'anti_fog_back_left': 'rear_fog',
      'anti_fog_back_right': 'rear_fog',
      'side_clignoant_left': 'side_repeater_left',
      'side_clignotant_left': 'side_repeater_left',
      'side_clignotant_right': 'side_repeater_right',
      // Juniper interior RGB LEDs. Three.js PropertyBinding strips `.`
      // entirely from node names at runtime (e.g. `GEO_DOOR_R_INT_SUB6.001`
      // → `GEO_DOOR_R_INT_SUB6001`). We include every plausible variant
      // (sanitized, original, underscore) so lookup always succeeds.
      'GEO_DOOR_R_INT_SUB6001': 'interior_front_door_right',
      'GEO_DOOR_R_INT_SUB6.001': 'interior_front_door_right',
      'GEO_DOOR_R_INT_SUB6_001': 'interior_front_door_right',
      'GEO_DOOR_L_INT_SUB5002': 'interior_front_door_left',
      'GEO_DOOR_L_INT_SUB5.002': 'interior_front_door_left',
      'GEO_DOOR_L_INT_SUB5_002': 'interior_front_door_left',
      'GEO_Cockpit_HR_SUB14002': 'interior_front_central',
      'GEO_Cockpit_HR_SUB14.002': 'interior_front_central',
      'GEO_Cockpit_HR_SUB14_002': 'interior_front_central',
      'GEO_DOOR_L2_INT_SUB3002': 'interior_back_door_left',
      'GEO_DOOR_L2_INT_SUB3.002': 'interior_back_door_left',
      'GEO_DOOR_L2_INT_SUB3_002': 'interior_back_door_left',
      'GEO_DOOR_R2_INT_SUB6002': 'interior_back_door_right',
      'GEO_DOOR_R2_INT_SUB6.002': 'interior_back_door_right',
      'GEO_DOOR_R2_INT_SUB6_002': 'interior_back_door_right',
    };

    const fixedPartMaterials = {
      window_left_front: windowMaterial,
      window_right_front: windowMaterial,
      window_left_back: windowMaterial,
      window_right_back: windowMaterial,
      windshield_front: windowMaterial,
      windshield_back: windowMaterial,
      unactivate_glasses: windowMaterial,
      left_high_light: headlightMaterial,
      right_high_light: headlightMaterial,
      left_signature_light: headlightMaterial,
      right_signature_light: headlightMaterial,
      light_left_front: headlightMaterial,
      light_right_front: headlightMaterial,
      light_center_front: headlightMaterial,
      light_left_back: taillightMaterial,
      light_right_back: taillightMaterial,
      light_center_back: taillightMaterial,
      blink_front_left: blinkerMaterial,
      blink_front_right: blinkerMaterial,
      blink_back_left: blinkerMaterial,
      blink_back_right: blinkerMaterial,
      license_plate: headlightMaterial,
      brake_lights: taillightMaterial,
      rear_fog: taillightMaterial,
      reversing_lights: headlightMaterial,
      side_repeater_left: blinkerMaterial,
      side_repeater_right: blinkerMaterial,
      interior_front_door_right: rgbMaterial,
      interior_front_door_left: rgbMaterial,
      interior_front_central: rgbMaterial,
      interior_back_door_left: rgbMaterial,
      interior_back_door_right: rgbMaterial,
    };

    // Load GLB model — per-show based on carModel. If the show hasn't finished
    // loading yet (AsyncStorage race), wait briefly for showDataRef to populate.
    try {
      if (showId && !showDataRef.current) {
        await new Promise((resolve) => {
          const start = Date.now();
          const check = setInterval(() => {
            if (showDataRef.current || Date.now() - start > 3000) {
              clearInterval(check);
              resolve();
            }
          }, 30);
        });
      }
      const carModelId = showDataRef.current?.carModel || 'model_3';
      const asset = Asset.fromModule(getGlbModule(carModelId));
      await asset.downloadAsync();

      const fileUri = asset.localUri || asset.uri;
      const response = await fetch(fileUri);
      const arrayBuffer = await response.arrayBuffer();

      const loader = new GLTFLoader();
      const gltf = await new Promise((resolve, reject) => {
        loader.parse(arrayBuffer, '', resolve, reject);
      });

      const model = gltf.scene;

      // Apply materials per mesh - find the part name by walking up the hierarchy.
      // Fallback: check geometry.name (preserves glTF mesh name, useful when
      // Blender assigned a generic node name but a clean mesh name).
      const getPartName = (mesh) => {
        let node = mesh;
        while (node) {
          const mapped = nodeNameMap[node.name] || node.name;
          if (INTERACTIVE_PARTS.includes(mapped) || fixedPartMaterials[mapped]) return mapped;
          node = node.parent;
        }
        const gname = mesh.geometry?.name;
        if (gname) {
          const mapped = nodeNameMap[gname] || gname;
          if (INTERACTIVE_PARTS.includes(mapped) || fixedPartMaterials[mapped]) return mapped;
        }
        return null;
      };

      const frontLightParts = ['left_high_light', 'right_high_light', 'left_signature_light', 'right_signature_light'];
      // Parts that must always render on top of the body (avoid occlusion/z-fighting)
      const alwaysOnTopParts = new Set([
        ...frontLightParts,
        'light_left_front', 'light_right_front',
        'light_center_front',
        'light_left_back', 'light_right_back',
        'light_center_back',
        'blink_front_left', 'blink_front_right',
        'blink_back_left', 'blink_back_right',
        'side_repeater_left', 'side_repeater_right',
        'license_plate', 'brake_lights', 'rear_fog',
        'reversing_lights',
        'interior_front_door_right',
        'interior_front_door_left',
        'interior_front_central',
        'interior_back_door_left',
        'interior_back_door_right',
      ]);
      // Patterns that mark a mesh as part of the cabin interior. Used by the
      // interior/exterior view toggle to hide the exterior body & shell so
      // interior RGB LEDs become easy to reach.
      const INTERIOR_PATTERNS = [/_INT(\b|_|\d|\.|$)/i, /COCKPIT/i, /SEAT/i, /DASHBOARD/i, /STEERING/i, /INTERIOR/i];
      // Cockpit sub-meshes that englobe exterior-looking geometry (roof liner,
      // rear shelf, body shell) — force-hidden in interior view. Also includes
      // exterior body pieces that leak into view from behind.
      // Matches SUB{N} followed by either `.NNN` (original) or `NNN` where
      // the suffix starts with 0 (sanitized form). The end-anchor prevents
      // SUB0 from matching SUB01, SUB5 from matching SUB50, etc.
      const INTERIOR_HIDE_PATTERNS = [
        /Cockpit_HR_SUB(?:0|5|6|17)(?:\.\d+|0\d{2})$/i,
        /^Plane[._]?002$/i,
      ];
      const matchesAny = (mesh, patterns) => {
        let n = mesh;
        while (n) {
          const nm = n.name || '';
          for (const pat of patterns) if (pat.test(nm)) return true;
          n = n.parent;
        }
        return false;
      };
      const isInteriorChain = (mesh) => matchesAny(mesh, INTERIOR_PATTERNS);
      const isHiddenInInterior = (mesh) => matchesAny(mesh, INTERIOR_HIDE_PATTERNS);
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
          // Tag interior meshes (for the interior/exterior view toggle). RGB
          // LED parts are always flagged interior regardless of name heuristics.
          const hideInInterior = isHiddenInInterior(child);
          child.userData.forceHideInInterior = hideInInterior;
          child.userData.isInterior = ((partName && isRgb(partName)) || isInteriorChain(child)) && !hideInInterior;
          // Interior meshes opt in to layer 2 so the RGB PointLight (which
          // lives on layer 2) only illuminates them — exterior stays unlit.
          if (child.userData.isInterior) child.layers.enable(2);
          // Lights & blinkers may be recessed inside the body — render on top
          if (alwaysOnTopParts.has(partName)) {
            child.renderOrder = 1;
            child.material = child.material.clone();
            child.material.depthTest = false;
          }
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
        left_high_light:       { color: 0xffffff, dir: new THREE.Vector3(0, -0.3, 1) },
        right_high_light:      { color: 0xffffff, dir: new THREE.Vector3(0, -0.3, 1) },
        left_signature_light:  { color: 0xaaddff, dir: new THREE.Vector3(0, -0.3, 1) },
        right_signature_light: { color: 0xaaddff, dir: new THREE.Vector3(0, -0.3, 1) },
        light_left_front:      { color: 0xffffff, dir: new THREE.Vector3(0, -0.3, 1) },
        light_right_front:     { color: 0xffffff, dir: new THREE.Vector3(0, -0.3, 1) },
        light_center_front:    { color: 0xffffff, dir: new THREE.Vector3(0, -0.3, 1) },
        light_left_back:   { color: 0xff2200, dir: new THREE.Vector3(0, -0.3, -1) },
        light_right_back:  { color: 0xff2200, dir: new THREE.Vector3(0, -0.3, -1) },
        light_center_back: { color: 0xff2200, dir: new THREE.Vector3(0, -0.3, -1) },
        blink_front_left:  { color: 0xffaa00, dir: new THREE.Vector3(-0.5, -0.3, 1) },
        blink_front_right: { color: 0xffaa00, dir: new THREE.Vector3(0.5, -0.3, 1) },
        blink_back_left:   { color: 0xffaa00, dir: new THREE.Vector3(-0.5, -0.3, -1) },
        blink_back_right:  { color: 0xffaa00, dir: new THREE.Vector3(0.5, -0.3, -1) },
        license_plate:     { color: 0xffffff, dir: new THREE.Vector3(0, -1, -0.3) },
        brake_lights:      { color: 0xff2200, dir: new THREE.Vector3(0, -0.3, -1) },
        rear_fog:          { color: 0xff2200, dir: new THREE.Vector3(0, -0.3, -1) },
        reversing_lights:  { color: 0xffffff, dir: new THREE.Vector3(0, -0.3, -1) },
        side_repeater_left:  { color: 0xffaa00, dir: new THREE.Vector3(-1, -0.3, 0) },
        side_repeater_right: { color: 0xffaa00, dir: new THREE.Vector3(1, -0.3, 0) },
      };

      model.traverse((child) => {
        if (!child.isMesh) return;
        const partName = child.userData.interactiveName;
        if (!partName || !lightDefs[partName]) return;

        const def = lightDefs[partName];
        // Get world position of the light mesh
        const worldPos = new THREE.Vector3();
        child.getWorldPosition(worldPos);

        const isSmallLight = partName.includes('blink') || partName.includes('repeater') || partName === 'license_plate' || partName === 'rear_fog' || partName === 'brake_lights' || partName === 'reversing_lights';
        const spot = new THREE.SpotLight(def.color, 0, isSmallLight ? 8 : 12, isSmallLight ? Math.PI / 6 : Math.PI / 5, 0.6, 1.5);
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

      // Interior RGB LEDs: attach a PointLight to each mesh so the diffuse
      // glow spills onto the surrounding door panel (makes thin strip meshes
      // readable). Parented to the mesh so it follows model rotation.
      model.traverse((child) => {
        if (!child.isMesh) return;
        const partName = child.userData.interactiveName;
        if (!partName || !isRgb(partName) || rgbPointLightsRef.current[partName]) return;
        const pt = new THREE.PointLight(0xffffff, 0, 0.9, 2.0);
        pt.castShadow = false;
        pt.layers.set(2);
        child.add(pt);
        rgbPointLightsRef.current[partName] = pt;
      });

      // Find retro mirror meshes and store initial state.
      // Fold rotation must happen around world-up and slide along world-lateral,
      // but meshes may be rotated (Juniper windows/retros have a 90° Y-rotation).
      // Compute these axes in mesh-local space so the same animation code works
      // for both Model 3 (local Z = up, local X = lateral) and Juniper (local Y
      // = up, local Z = lateral).
      const retroNames = ['retro_left', 'retro_right'];
      model.traverse((child) => {
        if (!child.isMesh) return;
        const interactiveName = child.userData.interactiveName;
        if (retroNames.includes(interactiveName) && !retroNodesRef.current[interactiveName]) {
          child.geometry.computeBoundingBox();
          const geoBBox = child.geometry.boundingBox;
          const geoCenter = new THREE.Vector3();
          geoBBox.getCenter(geoCenter);

          const worldQuat = new THREE.Quaternion();
          child.getWorldQuaternion(worldQuat);
          const invQuat = worldQuat.clone().invert();
          const foldAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(invQuat);
          const slideAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(invQuat);

          retroNodesRef.current[interactiveName] = {
            mesh: child,
            geoCenter: geoCenter,
            initMatrix: child.matrix.clone(),
            foldAxis,
            slideAxis,
          };
        }
      });

      // Find window meshes and store initial state + travel distance.
      // Model 3 windows are oriented so local -Z = world down; Juniper windows
      // are rotated 90° around Y so local -Y = world down. Detect the axis
      // dynamically by projecting world-down into mesh local space, then use
      // the geometry extent along that axis as the travel distance.
      const windowNames = ['window_left_front', 'window_right_front', 'window_left_back', 'window_right_back'];
      model.updateMatrixWorld(true);
      model.traverse((child) => {
        if (!child.isMesh) return;
        const interactiveName = child.userData.interactiveName;
        if (windowNames.includes(interactiveName) && !windowNodesRef.current[interactiveName]) {
          child.geometry.computeBoundingBox();
          const geoBBox = child.geometry.boundingBox;

          const worldQuat = new THREE.Quaternion();
          child.getWorldQuaternion(worldQuat);
          const localDown = new THREE.Vector3(0, -1, 0).applyQuaternion(worldQuat.invert());
          const absX = Math.abs(localDown.x), absY = Math.abs(localDown.y), absZ = Math.abs(localDown.z);
          let travelAxis, travelLength;
          if (absY >= absX && absY >= absZ) {
            travelAxis = new THREE.Vector3(0, Math.sign(localDown.y) || -1, 0);
            travelLength = geoBBox.max.y - geoBBox.min.y;
          } else if (absZ >= absX) {
            travelAxis = new THREE.Vector3(0, 0, Math.sign(localDown.z) || -1);
            travelLength = geoBBox.max.z - geoBBox.min.z;
          } else {
            travelAxis = new THREE.Vector3(Math.sign(localDown.x) || -1, 0, 0);
            travelLength = geoBBox.max.x - geoBBox.min.x;
          }

          windowNodesRef.current[interactiveName] = {
            mesh: child,
            initMatrix: child.matrix.clone(),
            travelAxis,
            travelLength,
          };
        }
      });

      // Find trunk mesh → use matrix-based pivot rotation
      // From logs: geo bbox X=1479..2211 (front-back), Y=-688..671 (left-right), Z=918..1230 (up-down)
      // Matrix has 0.001 scale (Blender mm → meters)
      // Hinge = min X (front/roof side), center Y, max Z (top) — rotation around Y axis
      model.traverse((child) => {
        if (!child.isMesh) return;
        const interactiveName = child.userData.interactiveName;
        if (interactiveName === 'flap' && !flapNodeRef.current) {
          child.geometry.computeBoundingBox();
          const bb = child.geometry.boundingBox;
          // Hinge at the top edge, rotation around the "front-back" axis of the
          // car. The "up" direction differs per model:
          //   - Model 3: mesh identity, local +Z = world up → hinge at max.z
          //   - Juniper: R_y(+90°), local +Y = world up → hinge at max.y
          // In both cases the rotation axis is local +X (the front-back axis
          // of the car in each convention), so FLAP_OPEN_ANGLE works as-is.
          const pivotLocal = carModelId === 'model_y_juniper'
            ? new THREE.Vector3(
                (bb.min.x + bb.max.x) / 2,       // center X
                bb.max.y,                        // top edge = hinge (Juniper)
                (bb.min.z + bb.max.z) / 2,       // center Z
              )
            : new THREE.Vector3(
                (bb.min.x + bb.max.x) / 2,       // center X
                (bb.min.y + bb.max.y) / 2,       // center Y
                bb.max.z,                        // top edge = hinge (Model 3)
              );
          flapNodeRef.current = {
            mesh: child,
            initMatrix: child.matrix.clone(),
            pivotLocal: pivotLocal,
          };
        }
        if (interactiveName === 'trunk' && !trunkNodeRef.current) {
          child.geometry.computeBoundingBox();
          const geoBBox = child.geometry.boundingBox;

          let pivotLocal, rotationAxis;
          if (carModelId === 'model_y_juniper') {
            // Juniper trunk: node has R_y(+90°), so local +X → world -Z.
            // The bbox corners don't sit on real vertices — the hinge is
            // inside the bbox, not at a corner. Detect it by clustering the
            // topmost vertices: their X gives the hinge line position, and
            // they span laterally across the whole trunk (the hinge line
            // itself). Only Y and Z of the pivot matter for anchoring — X
            // lies along the rotation axis so it has no effect on translation.
            const pos = child.geometry.getAttribute('position');
            const ySpan = geoBBox.max.y - geoBBox.min.y;
            const yThreshold = geoBBox.max.y - ySpan * 0.05;
            let sumX = 0, sumZ = 0, count = 0;
            for (let i = 0; i < pos.count; i++) {
              if (pos.getY(i) >= yThreshold) {
                sumX += pos.getX(i);
                sumZ += pos.getZ(i);
                count++;
              }
            }
            const hingeX = count > 0 ? sumX / count : (geoBBox.min.x + geoBBox.max.x) / 2;
            const hingeZ = count > 0 ? sumZ / count : (geoBBox.min.z + geoBBox.max.z) / 2;
            pivotLocal = new THREE.Vector3(hingeX, geoBBox.max.y, hingeZ);
            rotationAxis = new THREE.Vector3(0, 0, -1);
          } else {
            // Model 3 original convention. From mesh logs:
            //   X=1479..2211 (front-back), Y=-688..671 (left-right), Z=918..1230 (up-down)
            // Hinge = min X (front/roof side), center Y, max Z (top) — around local Y.
            pivotLocal = new THREE.Vector3(
              geoBBox.min.x,
              (geoBBox.min.y + geoBBox.max.y) / 2,
              geoBBox.max.z,
            );
            rotationAxis = new THREE.Vector3(0, 1, 0);
          }

          const trunkInit = child.matrix.clone();

          // For Juniper, rear taillights are physically attached to the
          // liftgate and must rotate with it. Compute the hinge+axis in
          // PARENT space (shared between trunk and lights, which are
          // siblings at depth 0), so we can apply one rotation matrix to
          // every attached mesh.
          let parentSpace = null;
          if (carModelId === 'model_y_juniper') {
            const pivotParent = pivotLocal.clone().applyMatrix4(trunkInit);
            const rotOnly = new THREE.Matrix4().extractRotation(trunkInit);
            const axisParent = rotationAxis.clone().applyMatrix4(rotOnly).normalize();
            parentSpace = { pivotParent, axisParent, attached: [] };
          }

          trunkNodeRef.current = {
            mesh: child,
            initMatrix: trunkInit,
            pivotLocal,
            rotationAxis,
            parentSpace,
          };
        }
      });

      // For Juniper, collect the rear taillight meshes so they rotate with
      // the trunk (they're physically bolted to the liftgate).
      if (carModelId === 'model_y_juniper' && trunkNodeRef.current?.parentSpace) {
        const attachedNames = new Set([
          'light_left_back', 'light_right_back',
          'light_center_back',
          'blink_back_left', 'blink_back_right',
        ]);
        model.traverse((child) => {
          if (!child.isMesh) return;
          if (attachedNames.has(child.userData.interactiveName)) {
            trunkNodeRef.current.parentSpace.attached.push({
              mesh: child,
              initMatrix: child.matrix.clone(),
            });
          }
        });
      }

      // Create rainbow plane for flap — positioned at the bbox center in world space
      model.updateMatrixWorld(true);
      if (flapNodeRef.current && flapNodeRef.current.mesh) {
        const flapMesh = flapNodeRef.current.mesh;
        // Get bbox center in local geometry space
        const bb = flapMesh.geometry.boundingBox;
        const localCenter = new THREE.Vector3();
        bb.getCenter(localCenter);
        // Transform to world space using the mesh's matrixWorld
        const worldCenter = localCenter.clone().applyMatrix4(flapMesh.matrixWorld);

        const rainbowGeo = new THREE.PlaneGeometry(0.075, 0.04);
        const rainbowMat = new THREE.MeshBasicMaterial({
          color: 0xff0000,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthTest: false,
        });
        const rainbowPlane = new THREE.Mesh(rainbowGeo, rainbowMat);
        // Convert world center back to model local space so it moves with the car
        const modelInverse = new THREE.Matrix4().copy(model.matrixWorld).invert();
        const modelLocal = worldCenter.clone().applyMatrix4(modelInverse);
        rainbowPlane.position.copy(modelLocal);
        model.add(rainbowPlane);
        flapNodeRef.current.rainbowPlane = rainbowPlane;
        flapNodeRef.current.rainbowMat = rainbowMat;
      }

      // Create round white dot using a small sphere for each interactive part
      // depthTest is OFF so dots are always rendered; visibility is controlled
      // dynamically in the animation loop based on camera orientation.
      const dotGeo = new THREE.SphereGeometry(1, 16, 16);
      const dotBaseMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        depthTest: false,
        depthWrite: false,
      });
      // Juniper-specific: reversing_lights and rear_fog are modeled as wide
      // horizontal strips whose local bbox center coincides with the license plate
      // position. Shift their dots in world space so the 3 rear-center dots don't
      // stack on top of each other.
      const juniperWorldOffsets = carModelId === 'model_y_juniper' ? {
        reversing_lights: new THREE.Vector3(-0.60, -0.02, 0),
        rear_fog:         new THREE.Vector3(-0.48, 0.02, 0),
      } : null;
      const juniperHiddenDots = new Set();

      const seenParts = new Set();
      model.traverse((child) => {
        if (!child.isMesh) return;
        const partName = child.userData.interactiveName;
        if (!partName || seenParts.has(partName)) return;
        seenParts.add(partName);
        if (juniperHiddenDots.has(partName)) return;

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
        // Offset flap dot away from taillight onto the body panel.
        // Axes differ per model:
        //   - Model 3: local Y = lateral (negative = left, away from taillight)
        //              local Z = vertical (negative = down)
        //   - Juniper: local X = front-back (negative = toward front of car)
        //              local Z = lateral (does not need adjustment here)
        if (partName === 'flap') {
          if (carModelId === 'model_y_juniper') {
            dotPosition.x -= 120; // shift toward front of car (away from taillight)
            dotPosition.y -= 40;  // slight shift downward
          } else {
            dotPosition.y -= 120; // shift left (more negative Y = away from taillight)
            dotPosition.z -= 80;  // shift down slightly
          }
        }
        // Apply per-part world-space offset (converted to mesh-local)
        const worldOffset = juniperWorldOffsets?.[partName];
        if (worldOffset) {
          child.updateWorldMatrix(true, false);
          const worldPos = dotPosition.clone().applyMatrix4(child.matrixWorld);
          worldPos.add(worldOffset);
          const invMatrix = new THREE.Matrix4().copy(child.matrixWorld).invert();
          dotPosition.copy(worldPos).applyMatrix4(invMatrix);
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
        // Draw dots on top of light meshes (which now use renderOrder=1)
        dot.renderOrder = 2;
        child.add(dot);
        dotSpritesRef.current.push(dot);
      });

      setLoading(false);
    } catch (e) {
      console.error('Error loading model:', e);
      setError('Failed to load 3D model: ' + e.message);
      setLoading(false);
    }

    // --- Pre-allocate reusable objects (zero per-frame GC pressure) ---
    const _dotWorldPos = new THREE.Vector3();
    const _toCam = new THREE.Vector3();
    const _toCenter = new THREE.Vector3();
    const _zAxis = new THREE.Vector3(0, 0, 1);
    const _yAxis = new THREE.Vector3(0, 1, 0);
    const _xAxis = new THREE.Vector3(1, 0, 0);
    const _tmpMat4a = new THREE.Matrix4();
    const _tmpMat4b = new THREE.Matrix4();
    const _tmpMat4c = new THREE.Matrix4();
    const _tmpMat4d = new THREE.Matrix4();
    const _tmpMat4e = new THREE.Matrix4(); // for combined result
    const _tmpColor = new THREE.Color();
    const RAINBOW_COLORS = [
      new THREE.Color(0xff0000),
      new THREE.Color(0x00ff00),
      new THREE.Color(0x0000ff),
      new THREE.Color(0xff8800),
      new THREE.Color(0xaa00ff),
    ];
    // Color helpers for the interior RGB LED.
    const _rgbParseCache = new Map();
    const hexToRgb01 = (hex, out) => {
      let rgb = _rgbParseCache.get(hex);
      if (!rgb) {
        const n = parseInt(hex.replace('#', ''), 16);
        rgb = { r: ((n >> 16) & 0xff) / 255, g: ((n >> 8) & 0xff) / 255, b: (n & 0xff) / 255 };
        _rgbParseCache.set(hex, rgb);
      }
      out.r = rgb.r; out.g = rgb.g; out.b = rgb.b;
      return out;
    };
    // Exterior-light colors used by the RGB "sync" mode.
    const SYNC_COLORS = {
      brake_lights:          { r: 1.0, g: 0.05, b: 0.05 },
      light_left_back:       { r: 0.8, g: 0.02, b: 0.02 },
      light_right_back:      { r: 0.8, g: 0.02, b: 0.02 },
      light_center_back:     { r: 0.8, g: 0.02, b: 0.02 },
      rear_fog:              { r: 0.8, g: 0.02, b: 0.02 },
      blink_front_left:      { r: 1.0, g: 0.5, b: 0.0 },
      blink_front_right:     { r: 1.0, g: 0.5, b: 0.0 },
      blink_back_left:       { r: 1.0, g: 0.5, b: 0.0 },
      blink_back_right:      { r: 1.0, g: 0.5, b: 0.0 },
      side_repeater_left:    { r: 1.0, g: 0.5, b: 0.0 },
      side_repeater_right:   { r: 1.0, g: 0.5, b: 0.0 },
      left_high_light:       { r: 1.0, g: 1.0, b: 1.0 },
      right_high_light:      { r: 1.0, g: 1.0, b: 1.0 },
      left_signature_light:  { r: 0.6, g: 0.85, b: 1.0 },
      right_signature_light: { r: 0.6, g: 0.85, b: 1.0 },
      light_left_front:      { r: 1.0, g: 1.0, b: 1.0 },
      light_right_front:     { r: 1.0, g: 1.0, b: 1.0 },
      light_center_front:    { r: 1.0, g: 1.0, b: 1.0 },
      license_plate:         { r: 1.0, g: 1.0, b: 1.0 },
      reversing_lights:      { r: 1.0, g: 1.0, b: 1.0 },
    };
    const computeRgbColor = (evt, posMs, activeMap, out) => {
      if (evt.rgbSync) {
        let r = 0, g = 0, b = 0;
        for (const [part, active] of activeMap) {
          if (part === evt.part) continue;
          const col = SYNC_COLORS[part];
          if (!col || active.blinkOff) continue;
          const w = active.intensity;
          if (col.r * w > r) r = col.r * w;
          if (col.g * w > g) g = col.g * w;
          if (col.b * w > b) b = col.b * w;
        }
        out.r = r; out.g = g; out.b = b;
        return out;
      }
      if (evt.rgbRainbow) {
        const elapsed = posMs - evt.startMs;
        const hue = ((elapsed / RAINBOW_CYCLE_MS) % 1 + 1) % 1;
        out.setHSL(hue, 1, 0.5);
        return out;
      }
      return hexToRgb01(evt.rgbColor || '#ffffff', out);
    };
    const _rgbColor = new THREE.Color();
    const RETRO_FOLD_ANGLE = Math.PI / 3;
    const RETRO_SLIDE = 0.15;
    const TRUNK_OPEN_ANGLE = -Math.PI / 4;
    const FLAP_OPEN_ANGLE = -Math.PI / 3;
    const RAINBOW_CYCLE_MS = 2500;
    const WINDOW_DANCE_CYCLE_MS = 3500;
    const WINDOW_REST_OPEN = 0.7;
    const retroPartNames = ['retro_left', 'retro_right'];
    const windowPartNames = ['window_left_front', 'window_right_front', 'window_left_back', 'window_right_back'];
    const lightPartNames = ['left_high_light', 'right_high_light', 'left_signature_light', 'right_signature_light',
      'light_left_front', 'light_right_front',
      'light_center_front',
      'light_left_back', 'light_right_back',
      'light_center_back',
      'blink_front_left', 'blink_front_right', 'blink_back_left', 'blink_back_right',
      'license_plate', 'brake_lights', 'rear_fog', 'reversing_lights',
      'side_repeater_left', 'side_repeater_right'];
    const _activeMap = new Map();

    // Build a direct-lookup map: partName → [mesh, ...] (avoids model.traverse every frame)
    const interactiveMeshMap = new Map();
    if (modelRef.current) {
      modelRef.current.traverse((child) => {
        if (child.isMesh && child.userData.interactiveName) {
          const name = child.userData.interactiveName;
          if (!interactiveMeshMap.has(name)) interactiveMeshMap.set(name, []);
          interactiveMeshMap.get(name).push(child);
        }
      });
    }

    // Animation loop — reads events directly, no setTimeout
    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);

      if (modelRef.current) {
        modelRef.current.rotation.x = rotationRef.current.x;
        modelRef.current.rotation.y = rotationRef.current.y;

        const s = scaleRef.current;
        modelRef.current.scale.set(s, s, s);

        // Interior/exterior view toggle: hide exterior meshes when interior mode
        // is active. Only re-traverse when the mode flips (cheap on every frame).
        const interior = showInteriorRef.current;
        if (modelRef.current.userData._lastInterior !== interior) {
          modelRef.current.userData._lastInterior = interior;
          modelRef.current.traverse((c) => {
            if (!c.isMesh) return;
            c.visible = interior
              ? (!!c.userData.isInterior && !c.userData.forceHideInInterior)
              : true;
          });
        }

        // Show/hide dot sprites based on playback state + camera facing.
        // In interior view only RGB LED dots are kept, all others are hidden.
        const playing = isPlayingRef.current;
        const interiorView = showInteriorRef.current;
        if (playing) {
          for (const dot of dotSpritesRef.current) {
            dot.visible = false;
          }
        } else {
          const camPos = cameraRef.current.position;
          const modelPos = modelRef.current.position;
          for (const dot of dotSpritesRef.current) {
            const partName = dot.parent?.userData?.interactiveName;
            if (interiorView && !isRgb(partName)) {
              dot.visible = false;
              continue;
            }
            dot.getWorldPosition(_dotWorldPos);
            _toCenter.subVectors(_dotWorldPos, modelPos);
            _toCam.subVectors(camPos, _dotWorldPos);
            dot.visible = _toCenter.dot(_toCam) > 0;
          }
        }

        // Pulse highlight material glow on selected part
        if (selectedMeshRef.current) {
          const t = Date.now() * 0.003; // ~3 cycles per second
          const pulse = 0.6 + 0.5 * Math.sin(t); // oscillates 0.1 — 1.1
          if (highlightMaterialRef.current) {
            highlightMaterialRef.current.emissiveIntensity = pulse;
            highlightMaterialRef.current.opacity = 0.75 + 0.2 * Math.sin(t);
          }
          if (highlightMaterialNoDepthRef.current) {
            highlightMaterialNoDepthRef.current.emissiveIntensity = pulse;
            highlightMaterialNoDepthRef.current.opacity = 0.65 + 0.2 * Math.sin(t);
          }
        }

        // Determine which parts are active at current playback position
        const pos = playbackPositionRef.current;
        const events = eventsRef.current;

        // Reuse pre-allocated map (clear instead of new Map())
        _activeMap.clear();

        // Cache sorted events — only re-sort when events array identity changes
        if (events !== lastEventsIdentityRef.current) {
          lastEventsIdentityRef.current = events;
          sortedEventsRef.current = [...events].sort((a, b) => a.startMs - b.startMs);
        }
        const sorted = sortedEventsRef.current;

        // AI generating mode: random light animation on the 3D model
        if (aiGeneratingRef.current) {
          const now = Date.now();
          for (let i = 0; i < lightPartNames.length; i++) {
            const partName = lightPartNames[i];
            // Each light has its own pseudo-random phase based on index
            const phase = (now * 0.003 + i * 1.7);
            const wave = Math.sin(phase) * 0.5 + 0.5; // 0-1
            // Only light up if wave is above threshold (creates random blinking)
            const threshold = 0.3 + Math.sin(now * 0.001 + i * 2.3) * 0.2;
            if (wave > threshold) {
              const intensity = wave;
              const blinkOff = (Math.floor(now / (120 + i * 15)) % 2) === 0;
              _activeMap.set(partName, { evt: { part: partName, effect: 'blink', power: 100, blinkSpeed: 1 }, intensity, blinkOff });
            }
          }
        } else {
          // Normal mode: events-based lighting
          // Scan only relevant events (sorted by startMs, early-break)
          for (let i = 0; i < sorted.length; i++) {
            const evt = sorted[i];
            if (evt.startMs > pos) break;
            if (evt.endMs <= pos) continue;
            let intensity = (evt.power ?? 100) / 100;
            const evtDuration = evt.endMs - evt.startMs;
            const elapsed = pos - evt.startMs;
            const remaining = evt.endMs - pos;
            const easeDuration = Math.min(evtDuration * 0.3, 1500);

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
            } else if (evt.effect === 'pulse') {
              const speedIdx = evt.pulseSpeed ?? 0;
              const periodMs = PULSE_SPEEDS[speedIdx]?.periodMs ?? 1200;
              // Half-rectified sine: (1 - cos)/2 → 0..1, always on, breathes smoothly
              intensity *= 0.5 - 0.5 * Math.cos((elapsed / periodMs) * Math.PI * 2);
            }

            _activeMap.set(evt.part, { evt, intensity, blinkOff });
          }
        }

        // Update SpotLight intensities
        const MAX_SPOT_INTENSITY = 5;
        for (let i = 0; i < lightPartNames.length; i++) {
          const partName = lightPartNames[i];
          const spot = spotLightsRef.current[partName];
          if (!spot) continue;
          const active = _activeMap.get(partName);
          if (active && !active.blinkOff) {
            spot.intensity = active.intensity * MAX_SPOT_INTENSITY;
          } else {
            spot.intensity = 0;
          }
        }

        // Apply materials using cached mesh lookup (no traverse)
        const selectedPartName = selectedMeshRef.current?.userData?.interactiveName;
        for (const [partName, meshes] of interactiveMeshMap) {
          if (partName === selectedPartName) continue;

          const active = _activeMap.get(partName);
          for (let mi = 0; mi < meshes.length; mi++) {
            const child = meshes[mi];
            if (active) {
              // Interior RGB LED: emissive color comes from the event options
              // (rgbColor / rgbRainbow / rgbSync). Bypasses lit headlight/taillight mats.
              if (isRgb(partName)) {
                const pt = rgbPointLightsRef.current[partName];
                if (active.blinkOff) {
                  const originalMat = meshMaterialsRef.current.get(partName);
                  if (originalMat) child.material = originalMat;
                  if (pt) pt.intensity = 0;
                  continue;
                }
                const originalMat = meshMaterialsRef.current.get(partName);
                if (!child.userData._dynamicMat) {
                  child.userData._dynamicMat = originalMat ? originalMat.clone() : new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
                  child.userData._dynamicMat.toneMapped = false;
                  if (child.renderOrder > 0) child.userData._dynamicMat.depthTest = false;
                }
                const mat = child.userData._dynamicMat;
                computeRgbColor(active.evt, pos, _activeMap, _rgbColor);
                const k = active.intensity;
                mat.color.r = 0.1; mat.color.g = 0.1; mat.color.b = 0.1;
                mat.emissive.r = _rgbColor.r * k;
                mat.emissive.g = _rgbColor.g * k;
                mat.emissive.b = _rgbColor.b * k;
                mat.emissiveIntensity = 1.5;
                child.material = mat;
                if (pt) {
                  pt.color.setRGB(
                    Math.max(_rgbColor.r, 0.001),
                    Math.max(_rgbColor.g, 0.001),
                    Math.max(_rgbColor.b, 0.001)
                  );
                  pt.intensity = k * 8;
                }
                continue;
              }

              const isLightPart = isLight(partName);
              const isBlink = isBlinker(partName);
              if (!isLightPart && !isBlink) continue;

              if (active.blinkOff) {
                const originalMat = meshMaterialsRef.current.get(partName);
                if (originalMat) child.material = originalMat;
                continue;
              }

              const isFrontLight = partName.includes('front') || partName === 'license_plate'
                || partName === 'reversing_lights'
                || partName.includes('high_light') || partName.includes('signature_light');
              const litMat = isBlink ? litBlinkerMatRef.current
                           : isFrontLight ? litHeadlightMatRef.current
                           : litTaillightMatRef.current;
              if (!litMat) continue;
              const originalMat = meshMaterialsRef.current.get(partName);
              if (!originalMat) continue;

              const intensity = active.intensity;
              if (!child.userData._dynamicMat) {
                child.userData._dynamicMat = litMat.clone();
                if (child.renderOrder > 0) child.userData._dynamicMat.depthTest = false;
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
              if (isRgb(partName)) {
                const pt = rgbPointLightsRef.current[partName];
                if (pt && pt.intensity !== 0) pt.intensity = 0;
              }
            }
          }
        }

        // Animate retro mirrors
        for (let ri = 0; ri < retroPartNames.length; ri++) {
          const partName = retroPartNames[ri];
          const retroData = retroNodesRef.current[partName];
          if (!retroData || !retroData.mesh) continue;
          const mesh = retroData.mesh;
          const active = _activeMap.get(partName);

          let restClosed = false;
          for (let i = 0; i < sorted.length; i++) {
            const evt = sorted[i];
            if (evt.startMs > pos) break;
            if (evt.part !== partName) continue;
            if (evt.endMs <= pos) {
              if (evt.retroMode === 'close') restClosed = true;
              else if (evt.retroMode === 'open') restClosed = false;
            }
          }

          let progress = restClosed ? 1 : 0;

          if (active) {
            const elapsed = pos - active.evt.startMs;
            const evtDuration = active.evt.endMs - active.evt.startMs;
            const t = evtDuration > 0 ? Math.min(elapsed / evtDuration, 1) : 0;
            const mode = active.evt.retroMode || 'roundtrip';

            if (mode === 'close') {
              progress = Math.sin(t * Math.PI / 2);
            } else if (mode === 'open') {
              progress = Math.cos(t * Math.PI / 2);
            } else {
              const pingPong = t <= 0.5 ? t * 2 : (1 - t) * 2;
              progress = Math.sin(pingPong * Math.PI / 2);
            }
          }

          const sign = partName === 'retro_left' ? 1 : -1;
          const angle = sign * RETRO_FOLD_ANGLE * progress;
          const slideX = -sign * RETRO_SLIDE * progress;

          if (progress === 0) {
            mesh.matrix.copy(retroData.initMatrix);
          } else {
            const c = retroData.geoCenter;
            const sa = retroData.slideAxis;
            _tmpMat4a.makeTranslation(-c.x, -c.y, -c.z);
            _tmpMat4b.makeRotationAxis(retroData.foldAxis, angle);
            _tmpMat4c.makeTranslation(c.x, c.y, c.z);
            _tmpMat4d.makeTranslation(sa.x * slideX, sa.y * slideX, sa.z * slideX);
            _tmpMat4e.copy(retroData.initMatrix)
              .multiply(_tmpMat4d)
              .multiply(_tmpMat4c)
              .multiply(_tmpMat4b)
              .multiply(_tmpMat4a);
            mesh.matrix.copy(_tmpMat4e);
          }
          mesh.matrixAutoUpdate = false;
        }

        // Animate windows
        for (let wi = 0; wi < windowPartNames.length; wi++) {
          const partName = windowPartNames[wi];
          const winData = windowNodesRef.current[partName];
          if (!winData || !winData.mesh) continue;
          const mesh = winData.mesh;
          const active = _activeMap.get(partName);

          let progress = WINDOW_REST_OPEN;

          if (active) {
            const elapsed = pos - active.evt.startMs;
            const evtDuration = active.evt.endMs - active.evt.startMs;
            const phase = (elapsed / WINDOW_DANCE_CYCLE_MS) * Math.PI * 2;
            const danceRange = WINDOW_REST_OPEN - 0.3;
            const wave = danceRange * (0.5 - 0.5 * Math.cos(phase));
            progress = WINDOW_REST_OPEN - wave;
            const fadeIn = Math.min(elapsed / 400, 1);
            const fadeOut = Math.min((evtDuration - elapsed) / 400, 1);
            const fade = fadeIn * Math.max(fadeOut, 0);
            progress = WINDOW_REST_OPEN + (progress - WINDOW_REST_OPEN) * fade;
          }

          if (progress === 0) {
            mesh.matrix.copy(winData.initMatrix);
          } else {
            const d = winData.travelLength * progress;
            _tmpMat4a.makeTranslation(
              winData.travelAxis.x * d,
              winData.travelAxis.y * d,
              winData.travelAxis.z * d,
            );
            _tmpMat4e.copy(winData.initMatrix).multiply(_tmpMat4a);
            mesh.matrix.copy(_tmpMat4e);
          }
          mesh.matrixAutoUpdate = false;
        }

        // Animate trunk (liftgate)
        const trunkData = trunkNodeRef.current;
        if (trunkData && trunkData.mesh) {
          const mesh = trunkData.mesh;
          const active = _activeMap.get('trunk');

          let restOpen = false;
          for (let i = 0; i < sorted.length; i++) {
            const evt = sorted[i];
            if (evt.startMs > pos) break;
            if (evt.part !== 'trunk') continue;
            if (evt.endMs <= pos) {
              if (evt.trunkMode === 'trunk_open' || evt.trunkMode === 'trunk_dance') restOpen = true;
              else if (evt.trunkMode === 'trunk_close') restOpen = false;
            }
          }

          let progress = restOpen ? 1 : 0;

          if (active) {
            const elapsed = pos - active.evt.startMs;
            const evtDuration = active.evt.endMs - active.evt.startMs;
            const t = evtDuration > 0 ? Math.min(elapsed / evtDuration, 1) : 0;
            const mode = active.evt.trunkMode || 'trunk_open';

            if (mode === 'trunk_open') {
              progress = Math.sin(t * Math.PI / 2);
            } else if (mode === 'trunk_close') {
              progress = Math.cos(t * Math.PI / 2);
            } else if (mode === 'trunk_dance') {
              const OPEN_PHASE_MS = restOpen ? 0 : 1000;
              const TRUNK_DANCE_CYCLE = 2000;
              if (elapsed < OPEN_PHASE_MS) {
                progress = Math.sin((elapsed / OPEN_PHASE_MS) * Math.PI / 2);
              } else {
                const danceElapsed = elapsed - OPEN_PHASE_MS;
                const phase = (danceElapsed / TRUNK_DANCE_CYCLE) * Math.PI * 2;
                progress = 0.75 + 0.25 * Math.cos(phase);
              }
            }
          }

          const ps = trunkData.parentSpace;
          if (progress === 0) {
            mesh.matrix.copy(trunkData.initMatrix);
            if (ps) {
              for (const a of ps.attached) a.mesh.matrix.copy(a.initMatrix);
            }
          } else if (ps) {
            // Parent-space rotation: shared matrix applied to trunk and
            // every attached mesh (rear taillights on Juniper) so they
            // pivot together around the real hinge.
            const p = ps.pivotParent;
            _tmpMat4a.makeTranslation(-p.x, -p.y, -p.z);
            _tmpMat4b.makeRotationAxis(ps.axisParent, TRUNK_OPEN_ANGLE * progress);
            _tmpMat4c.makeTranslation(p.x, p.y, p.z);
            _tmpMat4d.copy(_tmpMat4c).multiply(_tmpMat4b).multiply(_tmpMat4a);
            _tmpMat4e.multiplyMatrices(_tmpMat4d, trunkData.initMatrix);
            mesh.matrix.copy(_tmpMat4e);
            for (const a of ps.attached) {
              _tmpMat4e.multiplyMatrices(_tmpMat4d, a.initMatrix);
              a.mesh.matrix.copy(_tmpMat4e);
              a.mesh.matrixAutoUpdate = false;
            }
          } else {
            const p = trunkData.pivotLocal;
            _tmpMat4a.makeTranslation(-p.x, -p.y, -p.z);
            _tmpMat4b.makeRotationAxis(trunkData.rotationAxis, TRUNK_OPEN_ANGLE * progress);
            _tmpMat4c.makeTranslation(p.x, p.y, p.z);
            _tmpMat4e.copy(trunkData.initMatrix)
              .multiply(_tmpMat4c)
              .multiply(_tmpMat4b)
              .multiply(_tmpMat4a);
            mesh.matrix.copy(_tmpMat4e);
          }
          mesh.matrixAutoUpdate = false;
          if (ps) {
            for (const a of ps.attached) a.mesh.matrixAutoUpdate = false;
          }
        }

        // Animate flap (charge port)
        const flapData = flapNodeRef.current;
        if (flapData && flapData.mesh) {
          const flapMesh = flapData.mesh;
          const flapActive = _activeMap.get('flap');

          let flapRestOpen = false;
          for (let i = 0; i < sorted.length; i++) {
            const evt = sorted[i];
            if (evt.startMs > pos) break;
            if (evt.part !== 'flap') continue;
            if (evt.endMs <= pos) {
              if (evt.flapMode === 'flap_open' || evt.flapMode === 'flap_rainbow') flapRestOpen = true;
              else if (evt.flapMode === 'flap_close') flapRestOpen = false;
            }
          }

          let flapProgress = flapRestOpen ? 1 : 0;

          if (flapActive) {
            const elapsed = pos - flapActive.evt.startMs;
            const evtDuration = flapActive.evt.endMs - flapActive.evt.startMs;
            const t = evtDuration > 0 ? Math.min(elapsed / evtDuration, 1) : 0;
            const mode = flapActive.evt.flapMode || 'flap_open';

            if (mode === 'flap_open') {
              flapProgress = Math.sin(t * Math.PI / 2);
            } else if (mode === 'flap_close') {
              flapProgress = Math.cos(t * Math.PI / 2);
            } else if (mode === 'flap_rainbow') {
              if (!flapRestOpen) {
                const openT = Math.min(elapsed / 500, 1);
                flapProgress = Math.sin(openT * Math.PI / 2);
              } else {
                flapProgress = 1;
              }
            }
          }

          if (flapProgress === 0) {
            flapMesh.matrix.copy(flapData.initMatrix);
          } else {
            const p = flapData.pivotLocal;
            _tmpMat4a.makeTranslation(-p.x, -p.y, -p.z);
            _tmpMat4b.makeRotationAxis(_xAxis, FLAP_OPEN_ANGLE * flapProgress);
            _tmpMat4c.makeTranslation(p.x, p.y, p.z);
            _tmpMat4e.copy(flapData.initMatrix)
              .multiply(_tmpMat4c)
              .multiply(_tmpMat4b)
              .multiply(_tmpMat4a);
            flapMesh.matrix.copy(_tmpMat4e);
          }
          flapMesh.matrixAutoUpdate = false;

          // Rainbow plane effect
          if (flapData.rainbowMat) {
            const isRainbow = flapActive && flapActive.evt.flapMode === 'flap_rainbow';
            if (isRainbow) {
              const elapsed = pos - flapActive.evt.startMs;
              const rainbowStart = flapRestOpen ? 0 : 500;
              if (elapsed >= rainbowStart) {
                const rainbowElapsed = elapsed - rainbowStart;
                const phase = (rainbowElapsed % RAINBOW_CYCLE_MS) / RAINBOW_CYCLE_MS;
                const idx = phase * RAINBOW_COLORS.length;
                const i0 = Math.floor(idx) % RAINBOW_COLORS.length;
                const i1 = (i0 + 1) % RAINBOW_COLORS.length;
                const blend = idx - Math.floor(idx);
                _tmpColor.copy(RAINBOW_COLORS[i0]).lerp(RAINBOW_COLORS[i1], blend);
                flapData.rainbowMat.color.copy(_tmpColor);
                flapData.rainbowMat.opacity = 0.9;
              } else {
                flapData.rainbowMat.opacity = 0;
              }
            } else {
              flapData.rainbowMat.opacity = 0;
            }
          }
        }
      } // end if (modelRef.current)

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
              <TouchableOpacity
                style={[styles.selectionBadge, { top: insets.top + 2 }]}
                activeOpacity={0.7}
                onPress={() => selectPart(null)}
              >
                <View style={[styles.selectionDot, { backgroundColor: PART_COLORS[selectedPart] || '#44aaff' }]} />
                <Text style={styles.selectionText}>
                  {t(`parts.${selectedPart}`, { defaultValue: PART_LABELS[selectedPart] || selectedPart })}
                </Text>
                <Ionicons name="close" size={14} color="#888899" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            )}

            <View style={styles.zoomControls}>
              <TouchableOpacity style={styles.zoomButton} onPress={zoomIn}>
                <Text style={styles.zoomButtonText}>+</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.zoomButton} onPress={zoomOut}>
                <Text style={styles.zoomButtonText}>−</Text>
              </TouchableOpacity>
            </View>

            {carModel === 'model_y_juniper' && (
              <TouchableOpacity
                style={styles.viewToggleButton}
                activeOpacity={0.7}
                onPress={() => {
                  const next = !showInterior;
                  setShowInterior(next);
                  showInteriorRef.current = next;
                }}
              >
                <Ionicons
                  name={showInterior ? 'car-sport-outline' : 'body-outline'}
                  size={16}
                  color="#ccccee"
                />
                <Text style={styles.viewToggleText}>
                  {showInterior ? t('editor.showExterior') : t('editor.showInterior')}
                </Text>
              </TouchableOpacity>
            )}

            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#e94560" />
                <Text style={styles.loadingText}>{t('editor.loadingModel')}</Text>
              </View>
            )}

            {aiGenerating && (
              <View style={styles.aiLoadingOverlay}>
                <ActivityIndicator size="large" color="#a855f7" />
                <Text style={styles.aiLoadingTitle}>{t('editor.aiGenerating')}</Text>
                {aiProgressMsg !== '' && (
                  <Text style={styles.aiLoadingStep}>{aiProgressMsg}</Text>
                )}
                <Text style={styles.aiLoadingHint}>{t('editor.aiMayTakeMinutes')}</Text>
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
      <View style={styles.bottomSection}>
        {aiGenerating && <View style={styles.aiBottomOverlay} pointerEvents="auto" />}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.bottomContent} scrollEnabled={!aiGenerating} pointerEvents={aiGenerating ? 'none' : 'auto'}>
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
            flashRef={flashRef}
            onTrackSelected={handleTrackSelected}
            onEventsChange={(evts) => {
              // Push undo snapshot before applying the new events
              const prev = eventsRef.current;
              if (prev.length !== evts.length || prev !== evts) {
                pushUndo([...prev]);
              }
              eventsRef.current = evts;
              scheduleSave();
            }}
            onPlayingChange={(playing) => {
              isPlayingRef.current = playing;
              if (playing) selectPart(null);
            }}
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
                pulseSpeed: evt.pulseSpeed ?? 0,
                easeIn: evt.easeIn ?? false,
                easeOut: evt.easeOut ?? false,
                retroMode: evt.retroMode ?? 'roundtrip',
                windowMode: evt.windowMode ?? 'window_down',
                windowDurationMs: evt.windowDurationMs ?? 3000,
                trunkMode: evt.trunkMode ?? 'trunk_open',
                flapMode: evt.flapMode ?? 'flap_open',
                rgbColor: evt.rgbColor ?? '#ffffff',
                rgbRainbow: evt.rgbRainbow ?? false,
                rgbSync: evt.rgbSync ?? false,
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
              // Block trunk DANCE toggle if no prior OPEN exists before this event
              if (selectedEvent && isTrunk(selectedEvent.part) && newOpts.trunkMode === TRUNK_MODES.DANCE) {
                const hasPriorOpen = eventsRef.current.some(
                  (e) => e.id !== selectedEvent.id && e.part === 'trunk' && e.trunkMode === TRUNK_MODES.OPEN && e.endMs <= selectedEvent.startMs
                );
                if (!hasPriorOpen) {
                  const minSeconds = Math.ceil(TRUNK_DURATIONS[TRUNK_MODES.OPEN] / 1000);
                  flashRef?.current?.show(
                    t('flash.trunkDanceNeedsOpen', { seconds: minSeconds }),
                    'error',
                    4000
                  );
                  return; // reject the change
                }
              }
              setEventOptions(newOpts);
              if (selectedEvent) {
                pushUndo();
                // Update the selected event in the timeline
                const updatedEvt = {
                  ...selectedEvent,
                  endMs: selectedEvent.startMs + newOpts.durationMs,
                  effect: newOpts.effect,
                  power: newOpts.power,
                  blinkSpeed: newOpts.blinkSpeed,
                  pulseSpeed: newOpts.pulseSpeed,
                  easeIn: newOpts.easeIn,
                  easeOut: newOpts.easeOut,
                  retroMode: newOpts.retroMode,
                  windowMode: newOpts.windowMode,
                  windowDurationMs: newOpts.windowDurationMs,
                  trunkMode: newOpts.trunkMode,
                  flapMode: newOpts.flapMode,
                  rgbColor: newOpts.rgbColor,
                  rgbRainbow: newOpts.rgbRainbow,
                  rgbSync: newOpts.rgbSync,
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
      </View>

      {/* Undo / Redo buttons — top-left, symmetric to burger */}
      {(canUndo || canRedo) && (
        <View style={[styles.undoRedoRow, { top: insets.top + 8 }]}>
          <TouchableOpacity
            style={[styles.undoRedoBtn, !canUndo && styles.undoRedoBtnDisabled]}
            onPress={handleUndo}
            disabled={!canUndo}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-undo" size={18} color={canUndo ? '#ccccee' : '#444466'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.undoRedoBtn, !canRedo && styles.undoRedoBtnDisabled]}
            onPress={handleRedo}
            disabled={!canRedo}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-redo" size={18} color={canRedo ? '#ccccee' : '#444466'} />
          </TouchableOpacity>
        </View>
      )}

      {/* Burger menu button — native 3-bar icon */}
      <TouchableOpacity
        style={[styles.burgerButton, { top: insets.top + 8 }]}
        onPress={openDrawer}
        activeOpacity={0.7}
      >
        <View style={styles.burgerBar} />
        <View style={[styles.burgerBar, { width: 16 }]} />
        <View style={styles.burgerBar} />
      </TouchableOpacity>

      {/* Slide-in drawer from right */}
      {menuVisible && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <RNAnimated.View
            style={[styles.drawerOverlay, { opacity: overlayAnim }]}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={() => closeDrawer()} />
          </RNAnimated.View>
          <RNAnimated.View
            style={[
              styles.drawerContainer,
              { width: DRAWER_WIDTH, paddingTop: insets.top + 16 },
              { transform: [{ translateX: drawerAnim.interpolate({ inputRange: [0, 1], outputRange: [DRAWER_WIDTH, 0] }) }] },
            ]}
          >
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => closeDrawer(() => { if (onGoHome) onGoHome(); })}
            >
              <Ionicons name="home-outline" size={20} color="#e94560" />
              <Text style={styles.menuItemText}>{t('editor.home')}</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => closeDrawer(() => setSettingsVisible(true))}
            >
              <Ionicons name="settings-outline" size={20} color="#e94560" />
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
                        closeDrawer(() => {
                          pushUndo();
                          setSelectedEvent(null);
                          audioTimelineRef.current?.clearAllEvents();
                          eventsRef.current = [];
                          scheduleSave();
                        });
                      },
                    },
                  ]
                );
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#e94560" />
              <Text style={styles.menuItemText}>{t('editor.resetEvents')}</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleAIGenerate}
            >
              <Ionicons name="sparkles" size={20} color="#a855f7" />
              <Text style={[styles.menuItemText, { color: '#a855f7' }]}>{t('editor.aiGenerate')}</Text>
              <View style={styles.betaBadge}><Text style={styles.betaBadgeText}>Beta</Text></View>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => closeDrawer(() => setExportVisible(true))}
            >
              <Ionicons name="share-outline" size={20} color="#e94560" />
              <Text style={styles.menuItemText}>{t('editor.export')}</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => closeDrawer(() => setChatVisible(true))}
            >
              <Image source={require('../assets/guillaume.jpg')} style={styles.menuAvatar} />
              <Text style={[styles.menuItemText, { color: '#44aaff' }]}>{t('chat.menuLabel')}</Text>
              {chatUnread > 0 && (
                <View style={styles.chatBadge}>
                  <Text style={styles.chatBadgeText}>{chatUnread}</Text>
                </View>
              )}
            </TouchableOpacity>
          </RNAnimated.View>
        </View>
      )}

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
              style={[styles.settingsPanel, { maxHeight: Dimensions.get('window').height - insets.top - 20 }]}
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
                <Text style={styles.settingsSectionTitle}><Ionicons name="create-outline" size={18} color="#ccccee" />  {t('editor.projectName')}</Text>
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
                <Text style={styles.settingsSectionTitle}><Ionicons name="color-palette-outline" size={18} color="#ccccee" />  {t('editor.bodyColor')}</Text>
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
                <Text style={styles.settingsSectionTitle}><Ionicons name="time-outline" size={18} color="#ccccee" />  {t('editor.cursorOffset')}</Text>
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
                  <Text style={styles.settingsSectionTitle}><Ionicons name="bulb-outline" size={18} color="#ccccee" />  {t('editor.brightMode')}</Text>
                  <Text style={styles.brightToggleIcon}>{brightMode ? '☀️' : '🌙'}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.menuDivider} />

              {/* Vitesse de lecture */}
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}><Ionicons name="speedometer-outline" size={18} color="#ccccee" />  {t('editor.playbackSpeed')}</Text>
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
                <Text style={styles.settingsSectionTitle}><Ionicons name="resize-outline" size={18} color="#ccccee" />  {t('editor.timelineHeight')}</Text>
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
                <Text style={styles.settingsSectionTitle}><Ionicons name="globe-outline" size={18} color="#ccccee" />  {t('editor.community')}</Text>
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
              <View style={styles.contactDevSection}>
                <Text style={styles.contactDevText}>{t('editor.contactDev')}</Text>
                <View style={styles.contactDevRow}>
                  <TouchableOpacity
                    style={styles.contactDevBtn}
                    onPress={() => { setSettingsVisible(false); setTimeout(() => setChatVisible(true), 300); }}
                  >
                    <Text style={styles.contactDevBtnIcon}>💬</Text>
                    <Text style={styles.contactDevBtnText}>{t('editor.contactDevChat')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.contactDevBtnMail}
                    onPress={() => Linking.openURL('mailto:contact@lightshowstud.io?subject=LightShow Studio')}
                  >
                    <Text style={styles.contactDevBtnIcon}>✉️</Text>
                    <Text style={styles.contactDevBtnMailText}>{t('editor.contactDevMail')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
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
                      pushUndo();
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

      {/* AI Prompt modal */}
      <AiPromptModal
        visible={aiPromptModalVisible}
        onClose={() => setAiPromptModalVisible(false)}
        onGenerate={handleAIPromptSubmit}
      />

      {/* Export tutorial modal */}
      <ExportModal
        visible={exportVisible}
        onClose={() => setExportVisible(false)}
        trackInfo={audioTimelineRef.current?.getTrackInfo() || null}
        onExportFseq={async () => {
          try {
            const duration = playbackDurationRef.current;
            const carModel = showDataRef.current?.carModel || 'model_3';
            const result = await exportFseq(eventsRef.current, duration, { carModel });
            trackEvent('fseq_exported', { eventCount: eventsRef.current.length, carModel });
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
      <FlashMessage ref={flashRef} />
      <TutorialOverlay
        step={tutorialStep}
        insets={insets}
        onNext={handleTutorialNext}
        onSkip={handleTutorialSkip}
      />
      {/* Support Chat */}
      <Modal visible={chatVisible} animationType="slide" onRequestClose={() => { setChatVisible(false); setChatUnread(0); }}>
        <SupportChat onClose={() => { setChatVisible(false); setChatUnread(0); }} />
      </Modal>
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
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 15, 30, 0.75)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 8,
  },
  selectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  selectionText: {
    color: '#ccccdd',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.3,
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
  aiLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 15, 35, 0.85)',
    zIndex: 100,
    paddingHorizontal: 24,
  },
  aiLoadingTitle: {
    color: '#a855f7',
    marginTop: 14,
    fontSize: 18,
    fontWeight: '700',
  },
  aiLoadingStep: {
    color: '#c4b5fd',
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  aiLoadingHint: {
    color: '#555577',
    marginTop: 12,
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  aiBottomOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 50,
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
  viewToggleButton: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(30, 30, 60, 0.85)',
    borderWidth: 1,
    borderColor: '#3a3a5a',
  },
  viewToggleText: {
    color: '#ccccee',
    fontSize: 13,
    fontWeight: '500',
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
    right: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(20, 20, 40, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    zIndex: 10,
  },
  burgerBar: {
    width: 20,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#ccccee',
  },
  undoRedoRow: {
    position: 'absolute',
    left: 14,
    flexDirection: 'row',
    gap: 6,
    zIndex: 10,
  },
  undoRedoBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(20, 20, 40, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  undoRedoBtnDisabled: {
    opacity: 0.4,
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  drawerContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#141428',
    borderLeftWidth: 1,
    borderColor: '#2a2a4a',
    paddingHorizontal: 0,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
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
    marginBottom: 10,
  },
  contactDevRow: {
    flexDirection: 'row',
    gap: 10,
  },
  contactDevBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(68, 170, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(68, 170, 255, 0.3)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  contactDevBtnIcon: {
    fontSize: 16,
  },
  contactDevBtnText: {
    color: '#44aaff',
    fontSize: 13,
    fontWeight: '600',
  },
  contactDevBtnMail: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(136, 136, 170, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(136, 136, 170, 0.25)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  contactDevBtnMailText: {
    color: '#8888aa',
    fontSize: 13,
    fontWeight: '600',
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
    right: 12,
    top: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(60, 60, 90, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsCloseBtnText: {
    color: '#aaaacc',
    fontSize: 18,
    fontWeight: '700',
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
  menuAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  betaBadge: {
    backgroundColor: '#a855f7',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  betaBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  chatBadge: {
    backgroundColor: '#e94560',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  chatBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});
