import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, Switch, TouchableOpacity, TextInput, Modal, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import Slider from '@react-native-community/slider';
import { PART_ICONS, PART_LABELS, EFFECT_TYPES, BLINK_SPEEDS, RETRO_MODES, RETRO_DURATIONS, WINDOW_MAX_DANCE_MS, isLight, isBlinker, isRetro, isWindow } from './constants';

export default function PartOptionsPanel({ selectedPart, eventOptions, editingEvent, onOptionsChange, onDeselectEvent, onDeleteEvent }) {
  const { t } = useTranslation();
  const [durationInput, setDurationInput] = useState(null); // { field, value }

  const openDurationInput = (field, currentMs) => {
    setDurationInput({ field, value: (currentMs / 1000).toString() });
  };

  const confirmDuration = () => {
    if (!durationInput) return;
    const seconds = parseFloat(durationInput.value.replace(',', '.'));
    if (isNaN(seconds) || seconds <= 0) { setDurationInput(null); return; }
    const ms = Math.round(seconds * 1000);
    if (durationInput.field === 'durationMs') {
      onOptionsChange({ ...eventOptions, durationMs: ms });
    } else if (durationInput.field === 'windowDurationMs') {
      onOptionsChange({ ...eventOptions, windowDurationMs: ms, durationMs: ms });
    }
    setDurationInput(null);
  };

  if (!selectedPart) {
    return (
      <View style={styles.container}>
        <Text style={styles.hint}>{t('parts.selectHint')}</Text>
      </View>
    );
  }

  const icon = PART_ICONS[selectedPart];
  const label = t(`parts.${selectedPart}`, { defaultValue: PART_LABELS[selectedPart] || selectedPart });
  const lightPart = isLight(selectedPart) || isBlinker(selectedPart);
  const retroPart = isRetro(selectedPart);
  const windowPart = isWindow(selectedPart);
  const isBlink = eventOptions.effect === EFFECT_TYPES.BLINK;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Part header */}
        <View style={styles.header}>
          {icon && <Image source={icon} style={styles.headerIcon} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{label}</Text>
            {editingEvent && (
              <Text style={styles.editingHint}>{t('parts.editingEvent')}</Text>
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
              <Text style={styles.optionLabel}>{t('parts.duration')}</Text>
              <TouchableOpacity onPress={() => openDurationInput('durationMs', eventOptions.durationMs)}>
                <Text style={styles.optionValueTappable}>{(eventOptions.durationMs / 1000).toFixed(1)}s</Text>
              </TouchableOpacity>
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
              <Text style={styles.optionLabel}>{t('parts.power')}</Text>
              <Text style={styles.optionValue}>{eventOptions.power}%</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={80}
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
                <Text style={styles.optionLabel}>{t('parts.easeIn')}</Text>
                <Switch
                  value={!!eventOptions.easeIn}
                  onValueChange={(val) => onOptionsChange({ ...eventOptions, easeIn: val })}
                  trackColor={{ false: '#2a2a4a', true: 'rgba(68, 170, 255, 0.5)' }}
                  thumbColor={eventOptions.easeIn ? '#44aaff' : '#555577'}
                />
              </View>
              <View style={styles.easeItem}>
                <Text style={styles.optionLabel}>{t('parts.easeOut')}</Text>
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
              <Text style={styles.optionLabel}>{t('parts.blink')}</Text>
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
            <Text style={styles.optionLabel}>{t('parts.animation')}</Text>
            <View style={styles.retroModeRow}>
              <View style={styles.retroModeItem}>
                <Text style={styles.retroModeLabel}>{t('parts.retroClose')}</Text>
                <Switch
                  value={eventOptions.retroMode === RETRO_MODES.CLOSE}
                  onValueChange={() => onOptionsChange({ ...eventOptions, retroMode: RETRO_MODES.CLOSE, durationMs: RETRO_DURATIONS[RETRO_MODES.CLOSE] })}
                  trackColor={{ false: '#2a2a4a', true: 'rgba(170, 170, 204, 0.5)' }}
                  thumbColor={eventOptions.retroMode === RETRO_MODES.CLOSE ? '#aaaacc' : '#555577'}
                />
              </View>
              <View style={styles.retroModeItem}>
                <Text style={styles.retroModeLabel}>{t('parts.retroOpen')}</Text>
                <Switch
                  value={eventOptions.retroMode === RETRO_MODES.OPEN}
                  onValueChange={() => onOptionsChange({ ...eventOptions, retroMode: RETRO_MODES.OPEN, durationMs: RETRO_DURATIONS[RETRO_MODES.OPEN] })}
                  trackColor={{ false: '#2a2a4a', true: 'rgba(170, 170, 204, 0.5)' }}
                  thumbColor={eventOptions.retroMode === RETRO_MODES.OPEN ? '#aaaacc' : '#555577'}
                />
              </View>
              <View style={styles.retroModeItem}>
                <Text style={styles.retroModeLabel}>{t('parts.retroRoundTrip')}</Text>
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
            <Text style={styles.optionLabel}>{t('parts.windowDance')}</Text>
            <Text style={styles.windowHint}>{t('parts.windowHint')}</Text>

            <View style={[styles.optionRow, { marginTop: 10 }]}>
              <Text style={styles.optionLabel}>{t('parts.duration')}</Text>
              <TouchableOpacity onPress={() => openDurationInput('windowDurationMs', eventOptions.windowDurationMs)}>
                <Text style={styles.optionValueTappable}>{(eventOptions.windowDurationMs / 1000).toFixed(1)}s</Text>
              </TouchableOpacity>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={1000}
              maximumValue={WINDOW_MAX_DANCE_MS}
              step={1000}
              value={eventOptions.windowDurationMs}
              onValueChange={(val) => onOptionsChange({ ...eventOptions, windowDurationMs: val, durationMs: val })}
              minimumTrackTintColor="#44aaff"
              maximumTrackTintColor="#2a2a4a"
              thumbTintColor="#44aaff"
            />
            <Text style={styles.windowWarning}>{t('parts.windowWarning')}</Text>
          </View>
        )}

        {editingEvent && (
          <TouchableOpacity style={styles.deleteButton} onPress={onDeleteEvent}>
            <Text style={styles.deleteButtonText}>{t('parts.deleteEvent')}</Text>
          </TouchableOpacity>
        )}

        {/* Duration input modal */}
        <Modal visible={!!durationInput} transparent animationType="fade">
          <Pressable style={styles.durationOverlay} onPress={() => setDurationInput(null)}>
            <View style={styles.durationModal}>
              <Text style={styles.durationModalTitle}>{t('parts.durationSeconds')}</Text>
              <TextInput
                style={styles.durationTextInput}
                value={durationInput?.value || ''}
                onChangeText={(val) => setDurationInput((prev) => prev ? { ...prev, value: val } : null)}
                keyboardType="decimal-pad"
                autoFocus
                selectTextOnFocus
                onSubmitEditing={confirmDuration}
              />
              <TouchableOpacity style={styles.durationConfirmBtn} onPress={confirmDuration}>
                <Text style={styles.durationConfirmText}>OK</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
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
    fontSize: 15,
    textAlign: 'center',
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
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
  deleteButton: {
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(233, 69, 96, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(233, 69, 96, 0.4)',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#e94560',
    fontSize: 13,
    fontWeight: '600',
  },
  windowHint: {
    color: '#8888aa',
    fontSize: 12,
    marginTop: 4,
  },
  windowWarning: {
    color: '#aa8844',
    fontSize: 11,
    marginTop: 6,
    fontStyle: 'italic',
  },
  optionValueTappable: {
    color: '#e94560',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    backgroundColor: 'rgba(233, 69, 96, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  durationOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationModal: {
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    padding: 20,
    width: 220,
    alignItems: 'center',
  },
  durationModalTitle: {
    color: '#ccccee',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  durationTextInput: {
    backgroundColor: '#0f0f23',
    borderWidth: 1,
    borderColor: '#3a3a5a',
    borderRadius: 8,
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    width: '100%',
    marginBottom: 12,
  },
  durationConfirmBtn: {
    backgroundColor: '#e94560',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 30,
  },
  durationConfirmText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
