import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, Dimensions,
} from 'react-native';
import { listShows, deleteShow, duplicateShow } from './storage';
import { MP3_TRACKS } from '../assets/mp3/index';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function formatDate(ts) {
  const d = new Date(ts);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${mins}`;
}

function getTrackName(item) {
  if (item.trackId) {
    const track = MP3_TRACKS.find((t) => t.id === item.trackId);
    if (track) return track.title;
  }
  if (item.trackTitle) return item.trackTitle;
  return 'Aucune musique';
}

const CAR_MODEL_LABELS = {
  model_3: 'Model 3',
  model_s: 'Model S',
  model_x: 'Model X',
};

export default function HomeScreen({ onNewShow, onOpenShow }) {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await listShows();
    setShows(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = (show) => {
    Alert.alert(
      'Supprimer',
      `Supprimer "${show.name}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await deleteShow(show.id);
            refresh();
          },
        },
      ],
    );
  };

  const handleDuplicate = async (show) => {
    try {
      await duplicateShow(show.id);
      refresh();
    } catch (e) {
      Alert.alert('Erreur', e.message);
    }
  };

  const renderShow = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onOpenShow(item.id)}
      onLongPress={() => {
        Alert.alert(
          item.name,
          null,
          [
            { text: 'Ouvrir', onPress: () => onOpenShow(item.id) },
            { text: 'Dupliquer', onPress: () => handleDuplicate(item) },
            { text: 'Supprimer', style: 'destructive', onPress: () => handleDelete(item) },
            { text: 'Annuler', style: 'cancel' },
          ],
        );
      }}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.cardModel}>{CAR_MODEL_LABELS[item.carModel] || item.carModel}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTrack}>🎵  {getTrackName(item)}</Text>
        <Text style={styles.cardEvents}>{item.eventCount || 0} événement{(item.eventCount || 0) > 1 ? 's' : ''}</Text>
      </View>
      <Text style={styles.cardDate}>{formatDate(item.updatedAt)}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Light Studio</Text>
        <Text style={styles.subtitle}>for Tesla</Text>
      </View>

      {shows.length === 0 && !loading ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Aucun Light Show</Text>
          <Text style={styles.emptyHint}>Créez votre premier show !</Text>
        </View>
      ) : (
        <FlatList
          data={shows}
          keyExtractor={(item) => item.id}
          renderItem={renderShow}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <TouchableOpacity style={styles.newButton} onPress={onNewShow}>
        <Text style={styles.newButtonText}>+  Nouveau Light Show</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
    paddingTop: 60,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#6666aa',
    fontSize: 16,
    fontWeight: '400',
    marginTop: 2,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#12122a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e1e3a',
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardName: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },
  cardModel: {
    color: '#44aaff',
    fontSize: 12,
    fontWeight: '500',
    backgroundColor: 'rgba(68, 170, 255, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTrack: {
    color: '#8888aa',
    fontSize: 13,
  },
  cardEvents: {
    color: '#6666aa',
    fontSize: 12,
  },
  cardDate: {
    color: '#444466',
    fontSize: 11,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#6666aa',
    fontSize: 18,
    fontWeight: '500',
  },
  emptyHint: {
    color: '#444466',
    fontSize: 14,
    marginTop: 8,
  },
  newButton: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: '#44aaff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  newButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
