import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import './src/i18n'; // Initialize i18n
import { initAppCheck } from './src/firebase';
import { initAnalytics } from './src/analyticsService';
import HomeScreen from './src/HomeScreen';
import NewShowScreen from './src/NewShowScreen';
import ModelViewer from './src/ModelViewer';

export default function App() {
  useEffect(() => {
    initAppCheck();
    initAnalytics();
    // Play audio even when iOS silent switch is on (light show needs its music)
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});
  }, []);

  // Simple state-based navigation: 'home' | 'new' | 'editor'
  const [screen, setScreen] = useState('home');
  const [currentShowId, setCurrentShowId] = useState(null);

  const goHome = () => {
    setCurrentShowId(null);
    setScreen('home');
  };

  const goNew = () => setScreen('new');

  const openShow = (showId) => {
    setCurrentShowId(showId);
    setScreen('editor');
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {screen === 'home' && (
        <HomeScreen onNewShow={goNew} onOpenShow={openShow} />
      )}
      {screen === 'new' && (
        <NewShowScreen onBack={goHome} onCreated={openShow} />
      )}
      {screen === 'editor' && (
        <ModelViewer showId={currentShowId} onGoHome={goHome} />
      )}
    </SafeAreaProvider>
  );
}
