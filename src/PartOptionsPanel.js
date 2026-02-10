import React from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import Slider from '@react-native-community/slider';
import { PART_EMOJIS, PART_LABELS, EFFECT_TYPES, BLINK_SPEEDS, RETRO_MODES, RETRO_DURATIONS, WINDOW_MODES, isLight, isRetro, isWindow } from './constants';

export default function PartOptionsPanel({ selectedPart, eventOptions, editingEvent, onOptionsChange, onDeselectEvent }) {
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
  const retroPart = isRetro(selectedPart);
  const windowPart = isWindow(selectedPart);
  const isBlink = eventOptions.effect === EFFECT_TYPES.BLINK;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Part header */}
        <View style={styles.header}>
          <Text style={styles.headerEmoji}>{emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{label}</Text>
            {editingEvent && (
              <Text style={styles.editingHint}>Modification de l'événement</Text>
            )}
          </View>
          {editingEvent && (
            <TouchableOpacity style={styles.deselectBtn} onPress={onDeselectEvent}>
              <Text style={styles.deselectBtnText}>✕</Text>
            </TouchableOpacity>
          )}
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

            {/* Ease in / Ease out */}
            <View style={styles.easeRow}>
              <View style={styles.easeItem}>
                <Text style={styles.optionLabel}>Ease in</Text>
                <Switch
                  value={!!eventOptions.easeIn}
                  onValueChange={(val) => onOptionsChange({ ...eventOptions, easeIn: val })}
                  trackColor={{ false: '#2a2a4a', true: 'rgba(68, 170, 255, 0.5)' }}
                  thumbColor={eventOptions.easeIn ? '#44aaff' : '#555577'}
                />
              </View>
              <View style={styles.easeItem}>
                <Text style={styles.optionLabel}>Ease out</Text>
                <Switch
                  value={!!eventOptions.easeOut}
                  onValueChange={(val) => onOptionsChange({ ...eventOptions, easeOut: val })}
                  trackColor={{ false: '#2a2a4a', true: 'rgba(68, 170, 255, 0.5)' }}
                  thumbColor={eventOptions.easeOut ? '#44aaff' : '#555577'}
                />
              </View>
            </View>

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

        {retroPart && (
          <View style={styles.optionsSection}>
            <Text style={styles.optionLabel}>Animation</Text>
            <View style={styles.retroModeRow}>
              <View style={styles.retroModeItem}>
                <Text style={styles.retroModeLabel}>Fermer</Text>
                <Switch
                  value={eventOptions.retroMode === RETRO_MODES.CLOSE}
                  onValueChange={() => onOptionsChange({ ...eventOptions, retroMode: RETRO_MODES.CLOSE, durationMs: RETRO_DURATIONS[RETRO_MODES.CLOSE] })}
                  trackColor={{ false: '#2a2a4a', true: 'rgba(170, 170, 204, 0.5)' }}
                  thumbColor={eventOptions.retroMode === RETRO_MODES.CLOSE ? '#aaaacc' : '#555577'}
                />
              </View>
              <View style={styles.retroModeItem}>
                <Text style={styles.retroModeLabel}>Ouvrir</Text>
                <Switch
                  value={eventOptions.retroMode === RETRO_MODES.OPEN}
                  onValueChange={() => onOptionsChange({ ...eventOptions, retroMode: RETRO_MODES.OPEN, durationMs: RETRO_DURATIONS[RETRO_MODES.OPEN] })}
                  trackColor={{ false: '#2a2a4a', true: 'rgba(170, 170, 204, 0.5)' }}
                  thumbColor={eventOptions.retroMode === RETRO_MODES.OPEN ? '#aaaacc' : '#555577'}
                />
              </View>
              <View style={styles.retroModeItem}>
                <Text style={styles.retroModeLabel}>Aller-retour</Text>
                <Switch
                  value={eventOptions.retroMode === RETRO_MODES.ROUND_TRIP}
                  onValueChange={() => onOptionsChange({ ...eventOptions, retroMode: RETRO_MODES.ROUND_TRIP, durationMs: RETRO_DURATIONS[RETRO_MODES.ROUND_TRIP] })}
                  trackColor={{ false: '#2a2a4a', true: 'rgba(170, 170, 204, 0.5)' }}
                  thumbColor={eventOptions.retroMode === RETRO_MODES.ROUND_TRIP ? '#aaaacc' : '#555577'}
                />
              </View>
            </View>
          </View>
        )}

        {windowPart && (
          <View style={styles.optionsSection}>
            <Text style={styles.optionLabel}>Animation</Text>
            <View style={styles.retroModeRow}>
              <View style={styles.retroModeItem}>
                <Text style={styles.retroModeLabel}>Descente</Text>
                <Switch
                  value={eventOptions.windowMode === WINDOW_MODES.DOWN}
                  onValueChange={() => onOptionsChange({ ...eventOptions, windowMode: WINDOW_MODES.DOWN })}
                  trackColor={{ false: '#2a2a4a', true: 'rgba(68, 170, 255, 0.5)' }}
                  thumbColor={eventOptions.windowMode === WINDOW_MODES.DOWN ? '#44aaff' : '#555577'}
                />
              </View>
              <View style={styles.retroModeItem}>
                <Text style={styles.retroModeLabel}>Montée</Text>
                <Switch
                  value={eventOptions.windowMode === WINDOW_MODES.UP}
                  onValueChange={() => onOptionsChange({ ...eventOptions, windowMode: WINDOW_MODES.UP })}
                  trackColor={{ false: '#2a2a4a', true: 'rgba(68, 170, 255, 0.5)' }}
                  thumbColor={eventOptions.windowMode === WINDOW_MODES.UP ? '#44aaff' : '#555577'}
                />
              </View>
            </View>

            <View style={[styles.optionRow, { marginTop: 10 }]}>
              <Text style={styles.optionLabel}>Durée</Text>
              <Text style={styles.optionValue}>{(eventOptions.windowDurationMs / 1000).toFixed(1)}s</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={500}
              maximumValue={3000}
              step={100}
              value={eventOptions.windowDurationMs}
              onValueChange={(val) => onOptionsChange({ ...eventOptions, windowDurationMs: val, durationMs: val })}
              minimumTrackTintColor="#44aaff"
              maximumTrackTintColor="#2a2a4a"
              thumbTintColor="#44aaff"
            />
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
  easeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 4,
  },
  easeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retroModeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  retroModeItem: {
    alignItems: 'center',
    gap: 4,
  },
  retroModeLabel: {
    color: '#aaaacc',
    fontSize: 11,
  },
  editingHint: {
    color: '#44aaff',
    fontSize: 11,
    marginTop: 2,
  },
  deselectBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(100, 100, 130, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deselectBtnText: {
    color: '#8888aa',
    fontSize: 14,
  },
});
