import React, { useState, useRef, useEffect, useCallback } from 'react';
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

const BAR_GAP = 1;
const ZOOM_LEVELS = [1, 2, 4, 8, 16];
const BAR_BASE_WIDTH = 1;
const PLAYBACK_UPDATE_MS = 100;

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

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default function AudioTimeline({ selectedPart, eventOptions, onMarkersChange, onPositionChange }) {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [waveform, setWaveform] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [markers, setMarkers] = useState([]);
  const soundRef = useRef(null);
  const scrollRef = useRef(null);
  const containerWidthRef = useRef(1);
  const containerLeftRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const containerRef = useRef(null);
  const [zoomIndex, setZoomIndex] = useState(0);
  const touchStartRef = useRef({ x: 0, time: 0 });

  // Smooth cursor animation
  const cursorAnim = useRef(new Animated.Value(0)).current;
  const lastPositionRef = useRef(0);
  const lastUpdateTimeRef = useRef(Date.now());

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
    setMarkers([]);
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
      const now = Date.now();
      const newPos = status.positionMillis || 0;
      const dur = status.durationMillis || 1;

      setPosition(newPos);
      if (status.durationMillis) {
        setDuration(status.durationMillis);
      }

      // Notify parent of position for light event triggers
      if (onPositionChange) {
        onPositionChange(newPos, dur);
      }

      // Smooth interpolation: animate from current to new position
      const targetProgress = newPos / dur;
      if (status.isPlaying) {
        // Predict next position for smooth animation
        const nextProgress = Math.min(1, (newPos + PLAYBACK_UPDATE_MS) / dur);
        Animated.timing(cursorAnim, {
          toValue: nextProgress,
          duration: PLAYBACK_UPDATE_MS,
          useNativeDriver: false,
        }).start();
      } else {
        cursorAnim.setValue(targetProgress);
      }

      lastPositionRef.current = newPos;
      lastUpdateTimeRef.current = now;

      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
        cursorAnim.setValue(0);
      }
    }
  }, [cursorAnim]);

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
    const timeMs = Math.round(ratio * duration);

    // If a mesh part is selected, place a marker
    if (selectedPart && duration > 0) {
      const newMarker = {
        id: Date.now().toString(),
        part: selectedPart,
        emoji: PART_EMOJIS[selectedPart] || '📍',
        timeMs,
        ratio,
        durationMs: eventOptions?.durationMs || 500,
        blink: eventOptions?.blink || false,
      };
      setMarkers((prev) => {
        const updated = [...prev, newMarker].sort((a, b) => a.timeMs - b.timeMs);
        if (onMarkersChange) onMarkersChange(updated);
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

  // No track selected: show button
  if (!selectedTrack) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.selectButton}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.selectButtonIcon}>♪</Text>
          <Text style={styles.selectButtonText}>Choisir une musique</Text>
        </TouchableOpacity>

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
      {/* Track info + change button */}
      <View style={styles.trackHeader}>
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle}>{selectedTrack.title}</Text>
          <Text style={styles.trackArtist}>{selectedTrack.artist}</Text>
        </View>
        {selectedPart && (
          <View style={styles.placingHint}>
            <Text style={styles.placingHintText}>
              {PART_EMOJIS[selectedPart] || '📍'} Tap la wave pour placer
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.changeButton}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.changeButtonText}>♪</Text>
        </TouchableOpacity>
      </View>

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

            {/* Markers */}
            {markers.map((m) => (
              <View
                key={m.id}
                style={[
                  styles.marker,
                  { left: m.ratio * totalWaveWidth },
                ]}
              >
                <Text style={styles.markerEmoji}>{m.emoji}</Text>
                <View style={styles.markerLine} />
              </View>
            ))}

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

      {/* Markers count */}
      {markers.length > 0 && (
        <Text style={styles.markerCount}>
          {markers.length} événement{markers.length > 1 ? 's' : ''} placé{markers.length > 1 ? 's' : ''}
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
    padding: 12,
  },

  // Select button (no track)
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(233, 69, 96, 0.15)',
    borderWidth: 1,
    borderColor: '#e94560',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 10,
  },
  selectButtonIcon: {
    color: '#e94560',
    fontSize: 20,
  },
  selectButtonText: {
    color: '#e94560',
    fontSize: 16,
    fontWeight: '600',
  },

  // Track header
  trackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  trackArtist: {
    color: '#6666aa',
    fontSize: 12,
    marginTop: 2,
  },
  placingHint: {
    backgroundColor: 'rgba(68, 170, 255, 0.2)',
    borderWidth: 1,
    borderColor: '#44aaff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
  },
  placingHintText: {
    color: '#44aaff',
    fontSize: 11,
    fontWeight: '500',
  },
  changeButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
    borderWidth: 1,
    borderColor: '#e94560',
    justifyContent: 'center',
    alignItems: 'center',
  },
  changeButtonText: {
    color: '#e94560',
    fontSize: 18,
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
  marker: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
  },
  markerEmoji: {
    fontSize: 12,
  },
  markerLine: {
    width: 1,
    height: 80,
    backgroundColor: '#44aaff',
    opacity: 0.6,
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
