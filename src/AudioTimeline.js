import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  ScrollView,
  Animated,
} from 'react-native';
import { Audio } from 'expo-av';
import { MP3_TRACKS } from '../assets/mp3/index';
import { PART_EMOJIS, PART_COLORS, EFFECT_TYPES } from './constants';

const BAR_GAP = 1;
const ZOOM_LEVELS = [1, 2, 4, 8, 16];
const BAR_BASE_WIDTH = 1;
const PLAYBACK_UPDATE_MS = 100;

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function AudioTimeline({ selectedPart, eventOptions, onEventsChange, onPositionChange }, ref) {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [waveform, setWaveform] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [events, setEvents] = useState([]);
  const soundRef = useRef(null);
  const scrollRef = useRef(null);
  const containerWidthRef = useRef(1);
  const containerLeftRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const containerRef = useRef(null);
  const [zoomIndex, setZoomIndex] = useState(0);
  const touchStartRef = useRef({ x: 0, time: 0 });

  useImperativeHandle(ref, () => ({
    openTrackPicker: () => setModalVisible(true),
  }));

  // Cursor animation (Animated — no re-render)
  const cursorAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const selectTrack = async (track) => {
    setModalVisible(false);

    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }

    setSelectedTrack(track);
    setWaveform(track.waveform?.bars || []);
    setIsPlaying(false);
    setPosition(0);
    setEvents([]);
    cursorAnim.setValue(0);

    try {
      const { sound, status } = await Audio.Sound.createAsync(
        track.file,
        { shouldPlay: false, progressUpdateIntervalMillis: PLAYBACK_UPDATE_MS },
        onPlaybackStatusUpdate
      );
      soundRef.current = sound;
      if (status.durationMillis) {
        setDuration(status.durationMillis);
      }
    } catch (e) {
      console.error('Error loading audio:', e);
    }
  };

  const onPlaybackStatusUpdate = useCallback((status) => {
    if (status.isLoaded) {
      const newPos = status.positionMillis || 0;
      const dur = status.durationMillis || 1;

      setPosition(newPos);
      if (status.durationMillis) {
        setDuration(dur);
      }

      // Report position to parent via ref (no re-render)
      if (onPositionChange) {
        onPositionChange(newPos, dur);
      }

      // Cursor: animate smoothly to current position, predicting ahead
      const progress = newPos / dur;
      if (status.isPlaying) {
        const nextProgress = Math.min(1, (newPos + PLAYBACK_UPDATE_MS) / dur);
        Animated.timing(cursorAnim, {
          toValue: nextProgress,
          duration: PLAYBACK_UPDATE_MS,
          useNativeDriver: false,
        }).start();
      } else {
        cursorAnim.setValue(progress);
      }

      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
        cursorAnim.setValue(0);
      }
    }
  }, [cursorAnim, onPositionChange]);

  const togglePlay = async () => {
    if (!soundRef.current) return;

    if (isPlaying) {
      await soundRef.current.pauseAsync();
      setIsPlaying(false);
    } else {
      await soundRef.current.playAsync();
      setIsPlaying(true);
    }
  };

  const zoom = ZOOM_LEVELS[zoomIndex];
  const totalWaveWidth = waveform.length * (BAR_BASE_WIDTH * zoom + BAR_GAP);

  const seekToRatio = async (ratio) => {
    if (!soundRef.current || duration === 0) return;
    const clamped = Math.max(0, Math.min(1, ratio));
    const seekMs = Math.round(clamped * duration);
    await soundRef.current.setPositionAsync(seekMs);
    setPosition(seekMs);
    cursorAnim.setValue(clamped);
  };

  const waveZoomIn = () => {
    setZoomIndex((prev) => Math.min(ZOOM_LEVELS.length - 1, prev + 1));
  };

  const waveZoomOut = () => {
    setZoomIndex((prev) => Math.max(0, prev - 1));
  };

  const progress = duration > 0 ? position / duration : 0;

  const handleWaveTap = (localX) => {
    const ratio = localX / totalWaveWidth;
    const startMs = Math.round(ratio * duration);

    // If a mesh part is selected, place an event
    if (selectedPart && duration > 0) {
      const durationMs = eventOptions?.durationMs || 500;
      const endMs = Math.min(startMs + durationMs, duration);
      const newEvent = {
        id: Date.now().toString(),
        part: selectedPart,
        emoji: PART_EMOJIS[selectedPart] || '📍',
        startMs,
        endMs,
        effect: eventOptions?.effect || EFFECT_TYPES.SOLID,
        power: eventOptions?.power ?? 100,
        blinkSpeed: eventOptions?.blinkSpeed ?? 0,
      };
      setEvents((prev) => {
        const updated = [...prev, newEvent].sort((a, b) => a.startMs - b.startMs);
        if (onEventsChange) onEventsChange(updated);
        return updated;
      });
    }

    // Also seek to that position
    seekToRatio(ratio);
  };

  // Animated cursor left value
  const animatedCursorLeft = cursorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, totalWaveWidth],
  });

  // No track selected: show hint
  if (!selectedTrack) {
    return (
      <View style={styles.container}>
        <Text style={styles.noTrackHint}>Aucune musique sélectionnée</Text>
        <TrackModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          onSelect={selectTrack}
        />
      </View>
    );
  }

  // Track selected: show timeline
  return (
    <View style={styles.container}>
      {/* Waveform timeline */}
      <View
        ref={containerRef}
        style={styles.timelineContainer}
        onLayout={(e) => {
          containerWidthRef.current = e.nativeEvent.layout.width;
          setTimeout(() => {
            if (containerRef.current) {
              containerRef.current.measureInWindow((x) => {
                containerLeftRef.current = x;
              });
            }
          }, 50);
        }}
      >
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={zoom > 1}
          scrollEventThrottle={16}
          onScroll={(e) => {
            scrollOffsetRef.current = e.nativeEvent.contentOffset.x;
          }}
          onTouchStart={(e) => {
            if (containerRef.current) {
              containerRef.current.measureInWindow((x) => {
                containerLeftRef.current = x;
              });
            }
            touchStartRef.current = {
              x: e.nativeEvent.pageX,
              time: Date.now(),
            };
          }}
          onTouchEnd={(e) => {
            const dx = Math.abs(e.nativeEvent.pageX - touchStartRef.current.x);
            const dt = Date.now() - touchStartRef.current.time;
            if (dt < 250 && dx < 8) {
              const localX = e.nativeEvent.pageX - containerLeftRef.current + scrollOffsetRef.current;
              handleWaveTap(localX);
            }
          }}
        >
          <View style={[styles.waveformContainer, { width: totalWaveWidth }]}>
            {waveform.map((val, i) => {
              const barProgress = (i + 1) / waveform.length;
              const isPast = barProgress <= progress;
              return (
                <View
                  key={i}
                  style={[
                    styles.waveformBar,
                    {
                      width: BAR_BASE_WIDTH * zoom,
                      height: Math.max(2, val * 70),
                      backgroundColor: isPast ? '#e94560' : '#333355',
                    },
                  ]}
                />
              );
            })}

            {/* Events as colored rectangles */}
            {events.map((evt) => {
              const startRatio = evt.startMs / duration;
              const endRatio = evt.endMs / duration;
              const leftPx = startRatio * totalWaveWidth;
              const widthPx = Math.max(2, (endRatio - startRatio) * totalWaveWidth);
              const color = PART_COLORS[evt.part] || '#44aaff';
              return (
                <View
                  key={evt.id}
                  style={[
                    styles.eventBlock,
                    { left: leftPx, width: widthPx, backgroundColor: color + '40' },
                  ]}
                >
                  <View style={[styles.eventBlockBorder, { backgroundColor: color + '99' }]} />
                  <Text style={styles.eventEmoji}>{evt.emoji}</Text>
                </View>
              );
            })}

            {/* Playback cursor (smooth) */}
            <Animated.View
              style={[
                styles.cursor,
                { left: animatedCursorLeft },
              ]}
            />
          </View>
        </ScrollView>

        {/* Zoom controls */}
        <View style={styles.waveZoomControls}>
          <TouchableOpacity
            style={[styles.waveZoomBtn, zoomIndex >= ZOOM_LEVELS.length - 1 && styles.waveZoomBtnDisabled]}
            onPress={waveZoomIn}
            disabled={zoomIndex >= ZOOM_LEVELS.length - 1}
          >
            <Text style={styles.waveZoomBtnText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.waveZoomBtn, zoomIndex <= 0 && styles.waveZoomBtnDisabled]}
            onPress={waveZoomOut}
            disabled={zoomIndex <= 0}
          >
            <Text style={styles.waveZoomBtnText}>−</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <Text style={styles.timeText}>{formatTime(position)}</Text>

        <TouchableOpacity style={styles.playButton} onPress={togglePlay}>
          <Text style={styles.playButtonText}>
            {isPlaying ? '❚❚' : '▶'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>

      {/* Events count */}
      {events.length > 0 && (
        <Text style={styles.markerCount}>
          {events.length} événement{events.length > 1 ? 's' : ''} placé{events.length > 1 ? 's' : ''}
        </Text>
      )}

      <TrackModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSelect={selectTrack}
      />
    </View>
  );
}

function TrackModal({ visible, onClose, onSelect }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Choisir une musique</Text>

          <FlatList
            data={MP3_TRACKS}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.trackItem}
                onPress={() => onSelect(item)}
              >
                <Text style={styles.trackItemIcon}>♪</Text>
                <View style={styles.trackItemInfo}>
                  <Text style={styles.trackItemTitle}>{item.title}</Text>
                  <Text style={styles.trackItemArtist}>{item.artist}</Text>
                </View>
              </TouchableOpacity>
            )}
          />

          <TouchableOpacity style={styles.modalClose} onPress={onClose}>
            <Text style={styles.modalCloseText}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 8,
  },
  noTrackHint: {
    color: '#555577',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 12,
  },

  // Timeline / Waveform
  timelineContainer: {
    height: 80,
    backgroundColor: 'rgba(20, 20, 40, 0.6)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 80,
    gap: BAR_GAP,
    paddingHorizontal: 4,
  },
  waveformBar: {
    borderRadius: 1,
  },
  cursor: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 5,
  },
  eventBlock: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 2,
    justifyContent: 'flex-start',
    alignItems: 'center',
    overflow: 'hidden',
  },
  eventBlockBorder: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 2,
  },
  eventEmoji: {
    fontSize: 10,
    marginTop: 2,
    marginLeft: 4,
  },
  markerCount: {
    color: '#6666aa',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
  },
  waveZoomControls: {
    position: 'absolute',
    right: 6,
    top: 6,
    flexDirection: 'row',
    gap: 4,
  },
  waveZoomBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(30, 30, 60, 0.9)',
    borderWidth: 1,
    borderColor: '#3a3a5a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  waveZoomBtnDisabled: {
    opacity: 0.3,
  },
  waveZoomBtnText: {
    color: '#ccccee',
    fontSize: 14,
    fontWeight: '300',
    lineHeight: 16,
  },

  // Controls
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 20,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e94560',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonText: {
    color: '#ffffff',
    fontSize: 18,
  },
  timeText: {
    color: '#8888aa',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    minWidth: 40,
    textAlign: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 30,
    paddingHorizontal: 20,
    maxHeight: '60%',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(40, 40, 70, 0.5)',
    marginBottom: 8,
    gap: 12,
  },
  trackItemIcon: {
    color: '#e94560',
    fontSize: 22,
  },
  trackItemInfo: {
    flex: 1,
  },
  trackItemTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
  trackItemArtist: {
    color: '#6666aa',
    fontSize: 12,
    marginTop: 2,
  },
  modalClose: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalCloseText: {
    color: '#6666aa',
    fontSize: 15,
  },
});

export default forwardRef(AudioTimeline);
