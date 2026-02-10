import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView } from 'react-native';
import Slider from '@react-native-community/slider';

const PART_EMOJIS = {
  window_left_front: '🪟',
  window_right_front: '🪟',
  window_left_back: '🪟',
  window_right_back: '🪟',
  retro_left: '🪞',
  retro_right: '🪞',
  flap: '⚡',
  trunk: '📦',
  light_left_front: '💡',
  light_right_front: '💡',
  light_left_back: '🔴',
  light_right_back: '🔴',
};

const PART_LABELS = {
  window_left_front: 'Vitre AV gauche',
  window_right_front: 'Vitre AV droite',
  window_left_back: 'Vitre AR gauche',
  window_right_back: 'Vitre AR droite',
  retro_left: 'Rétro gauche',
  retro_right: 'Rétro droit',
  flap: 'Trappe de charge',
  trunk: 'Coffre',
  light_left_front: 'Phare AV gauche',
  light_right_front: 'Phare AV droit',
  light_left_back: 'Feu AR gauche',
  light_right_back: 'Feu AR droit',
};

const isLight = (part) => part && part.includes('light');

export default function PartOptionsPanel({ selectedPart, eventOptions, onOptionsChange }) {
  if (!selectedPart) {
    return (
      <View style={styles.container}>
        <Text style={styles.hint}>Sélectionne une pièce sur la Tesla</Text>
      </View>
    );
  }

  const emoji = PART_EMOJIS[selectedPart] || '📍';
  const label = PART_LABELS[selectedPart] || selectedPart;
  const lightPart = isLight(selectedPart);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Part header */}
      <View style={styles.header}>
        <Text style={styles.headerEmoji}>{emoji}</Text>
        <View>
          <Text style={styles.headerTitle}>{label}</Text>
          <Text style={styles.headerSub}>
            {lightPart ? 'Tap la wave pour placer un événement' : 'Événements non disponibles'}
          </Text>
        </View>
      </View>

      {lightPart && (
        <View style={styles.optionsSection}>
          {/* Duration slider */}
          <View style={styles.optionRow}>
            <Text style={styles.optionLabel}>Durée d'allumage</Text>
            <Text style={styles.optionValue}>{eventOptions.durationMs} ms</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={100}
            maximumValue={3000}
            step={50}
            value={eventOptions.durationMs}
            onValueChange={(val) => onOptionsChange({ ...eventOptions, durationMs: val })}
            minimumTrackTintColor="#e94560"
            maximumTrackTintColor="#2a2a4a"
            thumbTintColor="#e94560"
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>100ms</Text>
            <Text style={styles.sliderLabel}>3s</Text>
          </View>

          {/* Blink toggle */}
          <View style={styles.optionRowSwitch}>
            <View>
              <Text style={styles.optionLabel}>Clignotement</Text>
              <Text style={styles.optionSub}>Flash rapide pendant la durée</Text>
            </View>
            <Switch
              value={eventOptions.blink}
              onValueChange={(val) => onOptionsChange({ ...eventOptions, blink: val })}
              trackColor={{ false: '#2a2a4a', true: 'rgba(233, 69, 96, 0.5)' }}
              thumbColor={eventOptions.blink ? '#e94560' : '#555577'}
            />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  hint: {
    color: '#555577',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  headerEmoji: {
    fontSize: 28,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerSub: {
    color: '#6666aa',
    fontSize: 12,
    marginTop: 2,
  },
  optionsSection: {
    backgroundColor: 'rgba(20, 20, 40, 0.5)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    padding: 16,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  optionRowSwitch: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  optionLabel: {
    color: '#ccccee',
    fontSize: 14,
    fontWeight: '500',
  },
  optionValue: {
    color: '#e94560',
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  optionSub: {
    color: '#555577',
    fontSize: 11,
    marginTop: 2,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -6,
  },
  sliderLabel: {
    color: '#555577',
    fontSize: 10,
  },
});
