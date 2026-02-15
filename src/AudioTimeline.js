import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  ScrollView,
  Animated,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { MP3_TRACKS } from '../assets/mp3/index';
import { PART_ICONS, PART_COLORS, EFFECT_TYPES, isAnimatable } from './constants';
import { pickAndImportAudio, loadCachedWaveform, resolveAudioUri } from './audioPicker';
import { useTranslation } from 'react-i18next';

const LONG_PRESS_MS = 350;
const SELECT_MS = 300;
const SHAKE_AMPLITUDE = 2;
const SHAKE_PERIOD = 30;

function DraggableEvent({ evt, color, isSelected, laneTop, laneHeight, leftPx, widthPx, isPlacementMode, onTap, onQuickTap, onDragEnd, totalWaveWidth, duration, onDragStart, onDragStop, onTouchCapture }) {
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const dragOffsetX = useRef(new Animated.Value(0)).current;
  const isDragging = useRef(false);
  const longPressTimer = useRef(null);
  const startX = useRef(0);
  const grantTime = useRef(0);
  const shakeLoop = useRef(null);
  const startShake = () => {
    shakeLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: SHAKE_AMPLITUDE, duration: SHAKE_PERIOD, useNativeDriver: false }),
        Animated.timing(shakeAnim, { toValue: -SHAKE_AMPLITUDE, duration: SHAKE_PERIOD, useNativeDriver: false }),
      ])
    );
    shakeLoop.current.start();
  };

  const stopShake = () => {
    if (shakeLoop.current) shakeLoop.current.stop();
    shakeAnim.setValue(0);
  };

  return (
    <Animated.View
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => isDragging.current}
      onResponderGrant={(e) => {
        startX.current = e.nativeEvent.pageX;
        grantTime.current = Date.now();
        isDragging.current = false;
        dragOffsetX.setValue(0);
        if (onTouchCapture) onTouchCapture();
        longPressTimer.current = setTimeout(() => {
          isDragging.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 80);
          startShake();
          if (onDragStart) onDragStart();
        }, LONG_PRESS_MS);
      }}
      onResponderMove={(e) => {
        const dx = e.nativeEvent.pageX - startX.current;
        if (isDragging.current) {
          if (shakeLoop.current) stopShake();
          dragOffsetX.setValue(dx);
        } else if (Math.abs(dx) > 8) {
          clearTimeout(longPressTimer.current);
        }
      }}
      onResponderRelease={(e) => {
        clearTimeout(longPressTimer.current);
        stopShake();
        const dx = e.nativeEvent.pageX - startX.current;
        if (isDragging.current) {
          isDragging.current = false;
          dragOffsetX.setValue(0);
          if (onDragStop) onDragStop();
          const dxMs = (dx / totalWaveWidth) * duration;
          if (onDragEnd) onDragEnd(evt, dxMs);
        } else if (Math.abs(dx) < 8) {
          const holdMs = Date.now() - grantTime.current;
          if (holdMs < SELECT_MS) {
            // Quick tap → pass through to waveform (seek cursor / place event)
            if (onQuickTap) onQuickTap(e.nativeEvent.pageX);
          } else {
            // Longer tap → select this event
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (onTap) onTap(evt);
          }
        }
      }}
      onResponderTerminate={() => {
        clearTimeout(longPressTimer.current);
        stopShake();
        isDragging.current = false;
        dragOffsetX.setValue(0);
      }}
      style={[
        styles.eventBlock,
        {
          left: leftPx,
          width: widthPx,
          top: laneTop,
          height: laneHeight,
          backgroundColor: color + (isSelected ? '70' : '35'),
          borderWidth: isSelected ? 1 : 0,
          borderColor: isSelected ? color : 'transparent',
          transform: [
            { translateX: Animated.add(shakeAnim, dragOffsetX) },
          ],
        },
      ]}
    >
      <View style={[styles.eventBlockBorder, { backgroundColor: color + 'AA' }]} />
      {laneHeight >= 16 && PART_ICONS[evt.part] && (
        <Image source={PART_ICONS[evt.part]} style={styles.eventIcon} />
      )}
    </Animated.View>
  );
}

const BAR_GAP = 1;
const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 2, 4, 8, 16, 32, 64];
const BAR_BASE_WIDTH = 1;
const PLAYBACK_UPDATE_MS = 100;

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function AudioTimeline({ selectedPart, eventOptions, cursorOffsetMs = 0, playbackSpeed = 1, timelineScale = 1, selectedEventId, onEventsChange, onPositionChange, onEventSelect, onEventUpdate, onPlayingChange, onDeselectPart, isLoadingShow = false }, ref) {
  const { t } = useTranslation();
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
  const [zoomIndex, setZoomIndex] = useState(3);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const touchStartRef = useRef({ x: 0, time: 0 });
  const eventTappedRef = useRef(false);

  useImperativeHandle(ref, () => ({
    openTrackPicker: () => setModalVisible(true),
    updateEvent: (updatedEvt) => {
      setEvents((prev) => {
        const updated = prev.map((e) => e.id === updatedEvt.id ? updatedEvt : e);
        if (onEventsChange) onEventsChange(updated);
        return updated;
      });
    },
    clearAllEvents: () => {
      setEvents([]);
      if (onEventsChange) onEventsChange([]);
    },
    deleteEvent: (eventId) => {
      setEvents((prev) => {
        const updated = prev.filter((e) => e.id !== eventId);
        if (onEventsChange) onEventsChange(updated);
        return updated;
      });
    },
    stop: async () => {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.setPositionAsync(0);
      }
      setIsPlaying(false);
      setPosition(0);
      cursorAnim.setValue(0);
      if (onPlayingChange) onPlayingChange(false);
      if (onPositionChange) onPositionChange(0, duration);
    },
    // Load saved events into the timeline (without clearing the track)
    loadEvents: (savedEvents) => {
      const sorted = [...savedEvents].sort((a, b) => a.startMs - b.startMs);
      setEvents(sorted);
      if (onEventsChange) onEventsChange(sorted);
    },
    // Select a track by its ID (for loading saved shows — keeps events)
    selectTrackById: (trackId) => {
      const track = MP3_TRACKS.find((t) => t.id === trackId);
      if (track) selectTrack(track, { keepEvents: true });
    },
    // Load an imported track by URI + cached waveform (for saved shows)
    loadImportedTrack: async (trackUri, trackTitle) => {
      const resolvedUri = resolveAudioUri(trackUri);
      const waveform = await loadCachedWaveform(trackUri);
      const imported = {
        id: trackUri,
        title: trackTitle || 'Import',
        artist: t('timeline.importedFile'),
        uri: resolvedUri,
        waveform: waveform || { bars: [] },
      };
      selectTrack(imported, { keepEvents: true });
    },
    // Get the current track info for saving
    getTrackId: () => selectedTrack?.id || null,
    getTrackInfo: () => selectedTrack ? {
      id: selectedTrack.id,
      title: selectedTrack.title,
      uri: selectedTrack.uri || null,
      isBuiltin: !!selectedTrack.file,
    } : null,
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

  const selectTrack = async (track, { keepEvents = false } = {}) => {
    setModalVisible(false);

    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }

    setSelectedTrack(track);
    // Waveform: builtin tracks have .waveform.bars, imported tracks have .waveform.bars directly
    const bars = track.waveform?.bars || [];
    setWaveform(bars);
    setIsPlaying(false);
    setPosition(0);
    if (!keepEvents) setEvents([]);
    cursorAnim.setValue(0);

    try {
      // Builtin tracks use require() asset, imported tracks use { uri }
      const source = track.file ? track.file : { uri: track.uri };
      const { sound, status } = await Audio.Sound.createAsync(
        source,
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

  const cursorOffsetMsRef = useRef(cursorOffsetMs);
  cursorOffsetMsRef.current = cursorOffsetMs;

  const onPlaybackStatusUpdate = useCallback((status) => {
    if (status.isLoaded) {
      const newPos = status.positionMillis || 0;
      const dur = status.durationMillis || 1;
      const offset = cursorOffsetMsRef.current || 0;
      const offsetPos = Math.max(0, Math.min(newPos + offset, dur));

      setPosition(offsetPos);
      if (status.durationMillis) {
        setDuration(dur);
      }

      // Report offset position to parent (for lights sync)
      if (onPositionChange) {
        onPositionChange(offsetPos, dur);
      }

      // Cursor: animate smoothly with offset applied
      if (status.isPlaying) {
        const nextPos = Math.max(0, Math.min(newPos + offset + PLAYBACK_UPDATE_MS, dur));
        Animated.timing(cursorAnim, {
          toValue: nextPos / dur,
          duration: PLAYBACK_UPDATE_MS,
          useNativeDriver: false,
        }).start();

        // Auto-scroll to keep cursor visible
        const cursorPx = (offsetPos / dur) * totalWaveWidthRef.current;
        const scrollX = scrollOffsetRef.current;
        const viewW = containerWidthRef.current;
        if (cursorPx > scrollX + viewW - 30) {
          scrollRef.current?.scrollTo({ x: cursorPx - viewW * 0.3, animated: true });
        } else if (cursorPx < scrollX + 30) {
          scrollRef.current?.scrollTo({ x: Math.max(0, cursorPx - viewW * 0.3), animated: true });
        }
      } else {
        cursorAnim.setValue(offsetPos / dur);
      }

      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
        cursorAnim.setValue(0);
        if (onPlayingChange) onPlayingChange(false);
      }
    }
  }, [cursorAnim, onPositionChange]);

  const togglePlay = async () => {
    if (!soundRef.current) return;
    if (isPlaying) {
      await soundRef.current.pauseAsync();
      setIsPlaying(false);
      if (onPlayingChange) onPlayingChange(false);
    } else {
      await soundRef.current.setRateAsync(playbackSpeed, true);
      await soundRef.current.playAsync();
      setIsPlaying(true);
      if (onPlayingChange) onPlayingChange(true);
    }
  };

  // Update playback rate when speed changes during playback
  useEffect(() => {
    if (isPlaying && soundRef.current) {
      soundRef.current.setRateAsync(playbackSpeed, true);
    }
  }, [playbackSpeed, isPlaying]);

  const handleStop = async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.setPositionAsync(0);
    }
    setIsPlaying(false);
    setPosition(0);
    cursorAnim.setValue(0);
    if (onPlayingChange) onPlayingChange(false);
    if (onPositionChange) onPositionChange(0, duration);
  };

  const zoom = ZOOM_LEVELS[zoomIndex];
  const totalWaveWidth = waveform.length * (BAR_BASE_WIDTH * zoom + BAR_GAP);
  const totalWaveWidthRef = useRef(totalWaveWidth);
  totalWaveWidthRef.current = totalWaveWidth;

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

  // Compute overlap lanes for events
  const computeLanes = (evts) => {
    const lanes = new Map(); // eventId -> { lane, totalLanes }
    for (let i = 0; i < evts.length; i++) {
      const evt = evts[i];
      // Find all events overlapping with this one
      const overlapping = evts.filter(
        (other) => other.startMs < evt.endMs && other.endMs > evt.startMs
      );
      // Sort overlapping group consistently by startMs then id
      overlapping.sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
      const laneIdx = overlapping.findIndex((o) => o.id === evt.id);
      lanes.set(evt.id, { lane: laneIdx, totalLanes: overlapping.length });
    }
    return lanes;
  };

  const eventLanes = computeLanes(events);

  // Compute max overlapping lanes for dynamic height
  let maxLanes = 1;
  eventLanes.forEach((info) => { if (info.totalLanes > maxLanes) maxLanes = info.totalLanes; });
  const BASE_HEIGHT = 80 * timelineScale;
  const timelineHeight = Math.min(BASE_HEIGHT * 1.5, BASE_HEIGHT * (maxLanes > 1 ? 1 + (maxLanes - 1) * 0.25 : 1));

  const isPlacementMode = selectedPart && isAnimatable(selectedPart);

  const handleEventTap = (evt) => {
    eventTappedRef.current = true;
    if (onEventSelect) {
      onEventSelect(evt);
    }
  };

  const handleEventDragEnd = (evt, dxMs) => {
    const evtDuration = evt.endMs - evt.startMs;
    let newStart = Math.round(evt.startMs + dxMs);
    newStart = Math.max(0, Math.min(newStart, duration - evtDuration));
    const newEnd = newStart + evtDuration;
    const updated = { ...evt, startMs: newStart, endMs: newEnd };
    setEvents((prev) => {
      const newList = prev.map((e) => e.id === evt.id ? updated : e).sort((a, b) => a.startMs - b.startMs);
      if (onEventsChange) onEventsChange(newList);
      return newList;
    });
    if (onEventSelect) onEventSelect(updated);
    eventTappedRef.current = true;
  };

  const handleWaveTap = (localX) => {
    const ratio = localX / totalWaveWidth;
    const startMs = Math.round(ratio * duration);

    // If a mesh part is selected, place an event
    if (selectedPart && duration > 0) {
      const durationMs = eventOptions?.durationMs || 500;
      const endMs = Math.min(startMs + durationMs, duration);

      // Prevent overlap with same-part events
      const overlaps = events.some((e) =>
        e.part === selectedPart && startMs < e.endMs && endMs > e.startMs
      );
      if (overlaps) {
        // Can't place here — exit placement mode and seek to click position
        seekToRatio(ratio);
        if (onDeselectPart) onDeselectPart();
        return;
      }

      const newEvent = {
        id: Date.now().toString(),
        part: selectedPart,
        startMs,
        endMs,
        effect: eventOptions?.effect || EFFECT_TYPES.SOLID,
        power: eventOptions?.power ?? 100,
        blinkSpeed: eventOptions?.blinkSpeed ?? 0,
        easeIn: eventOptions?.easeIn ?? false,
        easeOut: eventOptions?.easeOut ?? false,
        retroMode: eventOptions?.retroMode ?? 'roundtrip',
        windowMode: eventOptions?.windowMode ?? 'window_down',
        windowDurationMs: eventOptions?.windowDurationMs ?? 3000,
      };
      setEvents((prev) => {
        const updated = [...prev, newEvent].sort((a, b) => a.startMs - b.startMs);
        if (onEventsChange) onEventsChange(updated);
        return updated;
      });

      // Auto-select the newly placed event so parameter changes apply to it
      if (onEventSelect) {
        onEventSelect(newEvent);
      }
    }

    // Also seek to that position
    seekToRatio(ratio);
  };

  // Animated cursor left value
  const animatedCursorLeft = cursorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, totalWaveWidth],
  });

  // No track selected
  if (!selectedTrack) {
    // Loading a saved show — show loader instead of "choose" button
    if (isLoadingShow) {
      return (
        <View style={styles.container}>
          <View style={styles.loadingTrackContainer}>
            <ActivityIndicator size="small" color="#44aaff" />
            <Text style={styles.loadingTrackText}>{t('timeline.loadingMusic')}</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.chooseTrackButton}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.chooseTrackIcon}>🎵</Text>
          <Text style={styles.chooseTrackText}>{t('timeline.chooseMusic')}</Text>
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
      {/* Waveform timeline */}
      <View
        ref={containerRef}
        style={[styles.timelineContainer, { height: timelineHeight }, isPlacementMode && styles.timelinePlacement]}
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
          scrollEnabled={scrollEnabled}
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
            if (eventTappedRef.current) {
              eventTappedRef.current = false;
              return;
            }
            const dx = Math.abs(e.nativeEvent.pageX - touchStartRef.current.x);
            const dt = Date.now() - touchStartRef.current.time;
            if (dt < 250 && dx < 8) {
              const localX = e.nativeEvent.pageX - containerLeftRef.current + scrollOffsetRef.current;
              handleWaveTap(localX);
            }
          }}
        >
          <View style={[styles.waveformContainer, { width: totalWaveWidth, height: timelineHeight }]}>
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

            {/* Events as colored rectangles with lane stacking */}
            {events.map((evt) => {
              const startRatio = evt.startMs / duration;
              const endRatio = evt.endMs / duration;
              const leftPx = startRatio * totalWaveWidth;
              const widthPx = Math.max(4, (endRatio - startRatio) * totalWaveWidth);
              const color = PART_COLORS[evt.part] || '#44aaff';
              const isSelected = evt.id === selectedEventId;
              const laneInfo = eventLanes.get(evt.id) || { lane: 0, totalLanes: 1 };
              const laneHeight = timelineHeight / laneInfo.totalLanes;
              const laneTop = laneInfo.lane * laneHeight;
              return (
                <DraggableEvent
                  key={evt.id}
                  evt={evt}
                  color={color}
                  isSelected={isSelected}
                  laneTop={laneTop}
                  laneHeight={laneHeight}
                  leftPx={leftPx}
                  widthPx={widthPx}
                  isPlacementMode={isPlacementMode}
                  onTap={handleEventTap}
                  onQuickTap={(pageX) => {
                    const localX = pageX - containerLeftRef.current + scrollOffsetRef.current;
                    handleWaveTap(localX);
                    eventTappedRef.current = true;
                  }}
                  onDragEnd={handleEventDragEnd}
                  onDragStart={() => setScrollEnabled(false)}
                  onDragStop={() => setScrollEnabled(true)}
                  onTouchCapture={() => { eventTappedRef.current = true; }}
                  totalWaveWidth={totalWaveWidth}
                  duration={duration}
                />
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

        <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
          <Text style={styles.stopButtonText}>■</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.playButton} onPress={togglePlay}>
          <Text style={styles.playButtonText}>{isPlaying ? '❚❚' : '▶'}</Text>
        </TouchableOpacity>

        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>

      {/* Events count */}
      {events.length > 0 && (
        <Text style={styles.markerCount}>
          {events.length > 1 ? t('timeline.eventsPlaced', { count: events.length }) : t('timeline.eventPlaced', { count: events.length })}
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

function WaveformLoader({ status }) {
  const NUM_LOADER_BARS = 40;
  // Generate musical pattern once
  const heights = useRef(
    Array.from({ length: NUM_LOADER_BARS }, (_, i) => {
      const base = Math.sin((i / NUM_LOADER_BARS) * Math.PI) * 0.6;
      const beat = (i % 4 === 0) ? 0.3 : (i % 2 === 0) ? 0.15 : 0;
      const noise = Math.random() * 0.25;
      return Math.min(1, base + beat + noise);
    })
  ).current;

  // Each bar springs in one by one (native driver for smooth animation even during JS block)
  const barsAnim = useRef(
    Array.from({ length: NUM_LOADER_BARS }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    // Stagger bars appearing — all animations use native driver
    barsAnim.forEach((anim, i) => {
      Animated.sequence([
        Animated.delay(i * 12),
        Animated.spring(anim, {
          toValue: 1,
          friction: 5,
          tension: 50,
          useNativeDriver: true,
        }),
      ]).start();
    });

    return () => barsAnim.forEach(a => a.stopAnimation());
  }, []);

  const { t } = useTranslation();

  return (
    <View style={loaderStyles.container}>
      <View style={loaderStyles.barsRow}>
        {barsAnim.map((anim, i) => {
          const h = Math.max(4, Math.round(heights[i] * 50));
          const color = heights[i] > 0.7 ? '#66ccff' : heights[i] > 0.4 ? '#44aaff' : '#2244aa';
          return (
            <Animated.View
              key={i}
              style={[
                loaderStyles.bar,
                {
                  height: h,
                  backgroundColor: color,
                  opacity: anim,
                  transform: [{
                    scaleY: anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.1, 1],
                    }),
                  }],
                },
              ]}
            />
          );
        })}
      </View>
      <Text style={loaderStyles.statusText}>{status || t('timeline.audioAnalysis')}</Text>
      <Text style={loaderStyles.statusHint}>{t('timeline.loadingHint')}</Text>
    </View>
  );
}

const loaderStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 56,
    gap: 2,
    marginBottom: 16,
  },
  bar: {
    width: 4,
    borderRadius: 2,
  },
  statusText: {
    color: '#44aaff',
    fontSize: 14,
    fontWeight: '500',
  },
  statusHint: {
    color: '#555577',
    fontSize: 12,
    marginTop: 6,
  },
});

function TrackModal({ visible, onClose, onSelect }) {
  const { t } = useTranslation();
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [previewId, setPreviewId] = useState(null);
  const previewSoundRef = useRef(null);

  const stopPreview = useCallback(async () => {
    if (previewSoundRef.current) {
      try {
        await previewSoundRef.current.stopAsync();
        await previewSoundRef.current.unloadAsync();
      } catch (_) {}
      previewSoundRef.current = null;
    }
    setPreviewId(null);
  }, []);

  const togglePreview = useCallback(async (track) => {
    if (previewId === track.id) {
      await stopPreview();
      return;
    }
    await stopPreview();
    try {
      const source = track.uri ? { uri: track.uri } : track.file;
      const { sound } = await Audio.Sound.createAsync(source, { shouldPlay: true });
      previewSoundRef.current = sound;
      setPreviewId(track.id);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          stopPreview();
        }
      });
    } catch (e) {
      console.error('Preview error:', e);
    }
  }, [previewId, stopPreview]);

  // Stop preview when modal closes or track is selected
  const handleSelect = useCallback(async (track) => {
    await stopPreview();
    onSelect(track);
  }, [onSelect, stopPreview]);

  const handleClose = useCallback(async () => {
    await stopPreview();
    onClose();
  }, [onClose, stopPreview]);

  const handleImport = async () => {
    try {
      await stopPreview();
      setImporting(true);
      const result = await pickAndImportAudio((status) => setImportStatus(status));
      if (result) {
        const track = {
          id: result.uri,
          title: result.name,
          artist: t('timeline.importedFile'),
          uri: resolveAudioUri(result.uri),
          waveform: result.waveform,
        };
        onSelect(track);
      }
    } catch (e) {
      if (e.message && e.message.startsWith('DURATION_TOO_LONG:')) {
        const duration = e.message.replace('DURATION_TOO_LONG:', '');
        Alert.alert(t('timeline.durationTooLong', { duration, max: '5:00' }));
      } else {
        console.error('Import error:', e);
        Alert.alert(t('timeline.importError'), e.message);
      }
    } finally {
      setImporting(false);
      setImportStatus('');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{t('timeline.chooseTrack')}</Text>

          {/* Import button on top */}
          {importing ? (
            <WaveformLoader status={importStatus} />
          ) : (
            <TouchableOpacity
              style={styles.importButton}
              onPress={handleImport}
            >
              <Text style={styles.importButtonText}>{t('timeline.importMp3')}</Text>
            </TouchableOpacity>
          )}

          {/* Separator */}
          <View style={styles.modalSeparator}>
            <View style={styles.modalSeparatorLine} />
            <Text style={styles.modalSeparatorText}>{t('timeline.orChooseFrom')}</Text>
            <View style={styles.modalSeparatorLine} />
          </View>

          {/* Scrollable track list */}
          <View style={styles.trackListContainer}>
            <ScrollView
              showsVerticalScrollIndicator={true}
              persistentScrollbar={true}
              style={styles.trackListScroll}
              contentContainerStyle={styles.trackListContent}
            >
              {MP3_TRACKS.map((item) => {
                const isPreviewing = previewId === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.trackItem}
                    onPress={() => handleSelect(item)}
                  >
                    <TouchableOpacity
                      style={styles.trackPreviewBtn}
                      onPress={(e) => { e.stopPropagation(); togglePreview(item); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.trackPreviewIcon}>
                        {isPreviewing ? '⏹' : '▶'}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.trackItemInfo}>
                      <Text style={styles.trackItemTitle}>{item.title}</Text>
                      <Text style={styles.trackItemArtist}>{item.artist}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {/* Fade at bottom to hint scrollability */}
            <View style={styles.trackListFadeBottom} pointerEvents="none" />
          </View>

          {!importing && (
            <TouchableOpacity style={styles.modalClose} onPress={handleClose}>
              <Text style={styles.modalCloseText}>{t('timeline.cancel')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 8,
  },
  loadingTrackContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20, 20, 40, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    paddingVertical: 18,
    gap: 10,
  },
  loadingTrackText: {
    color: '#44aaff',
    fontSize: 14,
  },
  chooseTrackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20, 20, 40, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#44aaff',
    borderStyle: 'dashed',
    paddingVertical: 18,
    gap: 10,
  },
  chooseTrackIcon: {
    fontSize: 20,
  },
  chooseTrackText: {
    color: '#44aaff',
    fontSize: 15,
    fontWeight: '600',
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
  timelinePlacement: {
    backgroundColor: 'rgba(68, 170, 255, 0.06)',
    borderColor: 'rgba(68, 170, 255, 0.3)',
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
  eventIcon: {
    width: 14,
    height: 14,
    marginTop: 2,
    marginLeft: 3,
    borderRadius: 2,
  },
  markerCount: {
    color: '#6666aa',
    fontSize: 14,
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
    width: 32,
    height: 32,
    borderRadius: 8,
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
    fontSize: 18,
    fontWeight: '300',
    lineHeight: 20,
  },

  // Controls
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 20,
  },
  stopButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a4a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButtonText: {
    color: '#ccccee',
    fontSize: 14,
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
    maxHeight: '70%',
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
  trackPreviewBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(233, 69, 96, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackPreviewIcon: {
    color: '#e94560',
    fontSize: 14,
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
  modalSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    gap: 10,
  },
  modalSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2a2a4a',
  },
  modalSeparatorText: {
    color: '#555577',
    fontSize: 12,
  },
  trackListContainer: {
    height: 220,
    borderRadius: 10,
    position: 'relative',
  },
  trackListScroll: {
  },
  trackListContent: {
    paddingBottom: 20,
  },
  trackListFadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 30,
    backgroundColor: 'transparent',
    borderBottomWidth: 2,
    borderBottomColor: '#2a2a4a',
  },
  importButton: {
    marginTop: 4,
    backgroundColor: '#1a1a3a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#44aaff',
    paddingVertical: 12,
    alignItems: 'center',
  },
  importButtonDisabled: {
    borderColor: '#2a2a4a',
    opacity: 0.6,
  },
  importButtonText: {
    color: '#44aaff',
    fontSize: 14,
    fontWeight: '600',
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
