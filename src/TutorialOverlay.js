import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Known layout constants from ModelViewer styles
const CONTAINER_PT = 40;
const VIEWER_H = Math.round(SCREEN_H * 0.38);
const VIEWER_TOP = CONTAINER_PT;
const BOTTOM_TOP = VIEWER_TOP + VIEWER_H;
const TIMELINE_H = 175; // waveform (~80) + zoom btns + controls bar (~50) + padding
const DRAWER_W = 260;

/**
 * TutorialOverlay — 5-step onboarding overlay.
 *
 * Steps:
 *   0 — Tap white dot on car
 *   1 — Adjust parameters
 *   2 — Tap timeline to place
 *   3 — Long-press to drag/move
 *   4 — Export via menu
 */
export default function TutorialOverlay({ step, insets, onNext, onSkip }) {
  const { t } = useTranslation();
  if (step == null || step < 0 || step > 4) return null;

  const STEPS = [
    { text: t('tutorial.step1'), icon: 'hand-left-outline' },
    { text: t('tutorial.step2'), icon: 'options-outline' },
    { text: t('tutorial.step3'), icon: 'musical-notes-outline' },
    { text: t('tutorial.step3b'), icon: 'move-outline' },
    { text: t('tutorial.step4'), icon: 'download-outline' },
  ];

  // Compute highlight zone
  const computeZone = (s) => {
    switch (s) {
      case 0: // 3D car viewer
        return { x: 0, y: VIEWER_TOP, width: SCREEN_W, height: VIEWER_H };
      case 1: // Options panel — everything below the timeline
        return { x: 0, y: BOTTOM_TOP + TIMELINE_H, width: SCREEN_W, height: SCREEN_H - BOTTOM_TOP - TIMELINE_H };
      case 2: // Timeline waveform + controls
      case 3: // Same zone for drag tip
        return { x: 0, y: BOTTOM_TOP, width: SCREEN_W, height: TIMELINE_H };
      case 4: // Drawer panel visible — cut hole on the right side
        return { x: SCREEN_W - DRAWER_W, y: 0, width: DRAWER_W, height: SCREEN_H };
      default:
        return null;
    }
  };

  const current = STEPS[step];
  const zone = computeZone(step);
  const isLast = step === STEPS.length - 1;
  const isDrawerStep = step === 4;
  const hasZone = zone && zone.width > 0 && zone.height > 0;

  const hx = hasZone ? zone.x : 0;
  const hy = hasZone ? zone.y : 0;
  const hw = hasZone ? zone.width : 0;
  const hh = hasZone ? zone.height : 0;

  // Text bubble positioning
  let bubbleStyle;
  if (isDrawerStep) {
    // Drawer step: bubble below the drawer menu items, full width
    bubbleStyle = { top: SCREEN_H * 0.38, left: 20, right: 20 };
  } else if (hy < SCREEN_H * 0.45) {
    bubbleStyle = { top: hy + hh + 16, left: 20, right: 20 };
  } else {
    bubbleStyle = { bottom: SCREEN_H - hy + 16, left: 20, right: 20 };
  }

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }]} pointerEvents="box-none">
      {/* Dark overlay with hole */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={[styles.overlay, { top: 0, left: 0, right: 0, height: Math.max(0, hy) }]} pointerEvents="auto" />
        <View style={[styles.overlay, { top: hy + hh, left: 0, right: 0, bottom: 0 }]} pointerEvents="auto" />
        <View style={[styles.overlay, { top: hy, left: 0, width: Math.max(0, hx), height: hh }]} pointerEvents="auto" />
        <View style={[styles.overlay, { top: hy, left: hx + hw, right: 0, height: hh }]} pointerEvents="auto" />
      </View>

      {/* Highlight border — skip for drawer step */}
      {hasZone && !isDrawerStep && (
        <View
          style={[styles.highlightBorder, { top: hy, left: hx, width: hw, height: hh }]}
          pointerEvents="none"
        />
      )}

      {/* Text bubble */}
      <View style={[styles.textBubble, bubbleStyle]}>
        <View style={styles.textRow}>
          <Ionicons name={current.icon} size={22} color="#e94560" style={{ marginRight: 10 }} />
          <Text style={styles.stepText}>{current.text}</Text>
        </View>

        <View style={styles.dotsRow}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>

        <View style={styles.buttonsRow}>
          <TouchableOpacity onPress={onSkip} style={styles.skipBtn} activeOpacity={0.7}>
            <Text style={styles.skipText}>{t('tutorial.skip')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onNext} style={styles.nextBtn} activeOpacity={0.7}>
            <Text style={styles.nextText}>{isLast ? t('tutorial.done') : t('tutorial.next')}</Text>
            {!isLast && <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: 4 }} />}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
  },
  highlightBorder: {
    position: 'absolute',
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'rgba(233, 69, 96, 0.5)',
  },
  textBubble: {
    position: 'absolute',
    backgroundColor: 'rgba(20, 20, 42, 0.95)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(233, 69, 96, 0.3)',
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepText: {
    flex: 1,
    color: '#ddddf0',
    fontSize: 15,
    lineHeight: 22,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    marginBottom: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#333355',
  },
  dotActive: {
    backgroundColor: '#e94560',
  },
  buttonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  skipText: {
    color: '#666688',
    fontSize: 14,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e94560',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  nextText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
