import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './src/HomeScreen';
import NewShowScreen from './src/NewShowScreen';
import ModelViewer from './src/ModelViewer';

export default function App() {
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
    <>
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
    </>
  );
}
