import React from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import Slider from '@react-native-community/slider';
import { PART_EMOJIS, PART_LABELS, EFFECT_TYPES, BLINK_SPEEDS, isLight } from './constants';

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
  const isBlink = eventOptions.effect === EFFECT_TYPES.BLINK;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Part header */}
        <View style={styles.header}>
          <Text style={styles.headerEmoji}>{emoji}</Text>
          <Text style={styles.headerTitle}>{label}</Text>
        </View>

        {lightPart && (
          <View style={styles.optionsSection}>
            {/* Duration slider */}
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>Durée</Text>
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

            {/* Power slider */}
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>Puissance</Text>
              <Text style={styles.optionValue}>{eventOptions.power}%</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={1}
              maximumValue={100}
              step={1}
              value={eventOptions.power}
              onValueChange={(val) => onOptionsChange({ ...eventOptions, power: val })}
              minimumTrackTintColor="#ffaa00"
              maximumTrackTintColor="#2a2a4a"
              thumbTintColor="#ffaa00"
            />

            {/* Blink toggle + speed on same line */}
            <View style={styles.blinkRow}>
              <Text style={styles.optionLabel}>Clignotement</Text>
              <View style={styles.blinkControls}>
                {isBlink && (
                  <View style={styles.speedButtons}>
                    {BLINK_SPEEDS.map((speed, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={[
                          styles.speedBtn,
                          eventOptions.blinkSpeed === idx && styles.speedBtnActive,
                        ]}
                        onPress={() => onOptionsChange({ ...eventOptions, blinkSpeed: idx })}
                      >
                        <Text style={[
                          styles.speedBtnText,
                          eventOptions.blinkSpeed === idx && styles.speedBtnTextActive,
                        ]}>{speed.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <Switch
                  value={isBlink}
                  onValueChange={(val) => onOptionsChange({
                    ...eventOptions,
                    effect: val ? EFFECT_TYPES.BLINK : EFFECT_TYPES.SOLID,
                  })}
                  trackColor={{ false: '#2a2a4a', true: 'rgba(233, 69, 96, 0.5)' }}
                  thumbColor={isBlink ? '#e94560' : '#555577'}
                />
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 12,
  },
  hint: {
    color: '#555577',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  headerEmoji: {
    fontSize: 22,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  optionsSection: {
    backgroundColor: 'rgba(20, 20, 40, 0.5)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    padding: 12,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  optionLabel: {
    color: '#ccccee',
    fontSize: 13,
    fontWeight: '500',
  },
  optionValue: {
    color: '#e94560',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  slider: {
    width: '100%',
    height: 34,
  },
  blinkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  blinkControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  speedButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  speedBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#1a1a3a',
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  speedBtnActive: {
    backgroundColor: 'rgba(233, 69, 96, 0.25)',
    borderColor: '#e94560',
  },
  speedBtnText: {
    color: '#555577',
    fontSize: 11,
    fontWeight: '600',
  },
  speedBtnTextActive: {
    color: '#e94560',
  },
});
