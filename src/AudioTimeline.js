import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Dimensions,
} from 'react-native';
import { Audio } from 'expo-av';
import { MP3_TRACKS } from '../assets/mp3/index';

const BAR_GAP = 1;

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default function AudioTimeline() {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [waveform, setWaveform] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const soundRef = useRef(null);
  const timelineWidthRef = useRef(1);
  const timelineLeftRef = useRef(0);
  const waveformRef = useRef(null);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const selectTrack = async (track) => {
    setModalVisible(false);

    // Unload previous
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }

    setSelectedTrack(track);
    setWaveform(track.waveform?.bars || []);
    setIsPlaying(false);
    setPosition(0);

    try {
      const { sound, status } = await Audio.Sound.createAsync(
        track.file,
        { shouldPlay: false },
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
      setPosition(status.positionMillis || 0);
      if (status.durationMillis) {
        setDuration(status.durationMillis);
      }
      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
      }
    }
  }, []);

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

  const seekTo = async (pageX) => {
    if (!soundRef.current || duration === 0) return;
    const localX = pageX - timelineLeftRef.current;
    const ratio = Math.max(0, Math.min(1, localX / timelineWidthRef.current));
    const seekMs = Math.round(ratio * duration);
    await soundRef.current.setPositionAsync(seekMs);
    setPosition(seekMs);
  };

  const measureWaveform = () => {
    if (waveformRef.current) {
      waveformRef.current.measureInWindow((x, y, width, height) => {
        timelineLeftRef.current = x;
        timelineWidthRef.current = width;
      });
    }
  };

  const progress = duration > 0 ? position / duration : 0;

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
        <TouchableOpacity
          style={styles.changeButton}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.changeButtonText}>♪</Text>
        </TouchableOpacity>
      </View>

      {/* Waveform timeline */}
      <View style={styles.timelineContainer}>
        <View
          ref={waveformRef}
          style={styles.waveformContainer}
          onLayout={() => {
            setTimeout(measureWaveform, 100);
          }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => {
            measureWaveform();
            seekTo(e.nativeEvent.pageX);
          }}
          onResponderMove={(e) => {
            seekTo(e.nativeEvent.pageX);
          }}
        >
          {waveform.map((val, i) => {
            const barProgress = (i + 1) / waveform.length;
            const isPast = barProgress <= progress;
            return (
              <View
                key={i}
                style={[
                  styles.waveformBar,
                  {
                    height: Math.max(2, val * 60),
                    backgroundColor: isPast ? '#e94560' : '#333355',
                  },
                ]}
              />
            );
          })}

          {/* Playback cursor */}
          <View
            style={[
              styles.cursor,
              { left: `${progress * 100}%` },
            ]}
          />
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
    flex: 1,
    padding: 16,
    justifyContent: 'center',
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
    marginBottom: 12,
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
    flex: 1,
    minWidth: 1,
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

  // Controls
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
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
