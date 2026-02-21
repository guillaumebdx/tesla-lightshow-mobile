import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

const FLASH_DURATION = 3000;
const FADE_IN = 200;
const FADE_OUT = 400;

const TYPES = {
  error: { bg: 'rgba(233, 69, 96, 0.95)', icon: '⚠️' },
  success: { bg: 'rgba(46, 204, 113, 0.95)', icon: '✅' },
  info: { bg: 'rgba(68, 170, 255, 0.95)', icon: 'ℹ️' },
};

const FlashMessage = forwardRef((props, ref) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const [message, setMessage] = useState(null);
  const timerRef = useRef(null);

  const showFlash = (text, type = 'info', durationMs = FLASH_DURATION) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage({ text, type });
    Animated.timing(opacity, { toValue: 1, duration: FADE_IN, useNativeDriver: true }).start();
    timerRef.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_OUT, useNativeDriver: true }).start(() => {
        setMessage(null);
      });
    }, durationMs);
  };

  useImperativeHandle(ref, () => ({
    show: showFlash,
    error: (text, durationMs) => showFlash(text, 'error', durationMs),
    success: (text, durationMs) => showFlash(text, 'success', durationMs),
  }));

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  if (!message) return null;

  const config = TYPES[message.type] || TYPES.info;

  return (
    <Animated.View style={[styles.container, { opacity, backgroundColor: config.bg }]} pointerEvents="none">
      <Text style={styles.icon}>{config.icon}</Text>
      <Text style={styles.text}>{message.text}</Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 80,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  icon: {
    fontSize: 18,
    marginRight: 10,
  },
  text: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
});

export default FlashMessage;
