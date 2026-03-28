import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, Dimensions,
  Modal, Pressable, Linking, ScrollView, Image,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { setAppLanguage } from './i18n';
import { listShows, deleteShow, duplicateShow, createDemoShow } from './storage';
import { MP3_TRACKS } from '../assets/mp3/index';
import DemoViewer from './DemoViewer';
import { Ionicons } from '@expo/vector-icons';
import SupportChat from './SupportChat';
import { hasEverSentMessage, fetchChatStatus } from './chatService';
import FlashMessage from './FlashMessage';

const LANGUAGES = [
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
];

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
  return null;
}

const CAR_MODEL_LABELS = {
  model_3: 'Model 3/Y',
  model_s: 'Model S',
  model_x: 'Model X',
  cybertruck: 'Cybertruck',
};

export default function HomeScreen({ onNewShow, onOpenShow }) {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const chatPollRef = useRef(null);
  const prevChatUnreadRef = useRef(0);
  const flashRef = useRef(null);
  const { t, i18n } = useTranslation();
  const [selectedLang, setSelectedLang] = useState(i18n.language);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await listShows();
    setShows(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Chat unread badge polling (30s, only if user has ever sent a message)
  useEffect(() => {
    let mounted = true;
    const checkUnread = async () => {
      const hasSent = await hasEverSentMessage();
      if (!hasSent || !mounted) return;
      try {
        const data = await fetchChatStatus();
        if (!mounted) return;
        const newUnread = data.unread || 0;
        if (newUnread > prevChatUnreadRef.current && !chatVisible) {
          flashRef.current?.show(t('chat.newReply'), 'info', 4000);
        }
        prevChatUnreadRef.current = newUnread;
        setChatUnread(newUnread);
      } catch {}
    };
    checkUnread();
    chatPollRef.current = setInterval(checkUnread, 30000);
    return () => { mounted = false; if (chatPollRef.current) clearInterval(chatPollRef.current); };
  }, [chatVisible]);

  const handleDelete = (show) => {
    Alert.alert(
      t('home.delete'),
      t('home.deleteConfirm', { name: show.name }),
      [
        { text: t('home.cancel'), style: 'cancel' },
        {
          text: t('home.delete'),
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
      Alert.alert(t('home.error'), e.message);
    }
  };

  const handleCreateDemo = async () => {
    try {
      const show = await createDemoShow('star_wars_battle', 'Star Wars Demo');
      setSettingsVisible(false);
      onOpenShow(show.id);
    } catch (e) {
      Alert.alert(t('home.error'), e.message);
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
            { text: t('home.open'), onPress: () => onOpenShow(item.id) },
            { text: t('home.duplicate'), onPress: () => handleDuplicate(item) },
            { text: t('home.delete'), style: 'destructive', onPress: () => handleDelete(item) },
            { text: t('home.cancel'), style: 'cancel' },
          ],
        );
      }}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.cardModel}>{CAR_MODEL_LABELS[item.carModel] || item.carModel}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTrack}><Ionicons name="musical-note" size={14} color="#8888aa" />  {getTrackName(item) || t('home.noMusic')}</Text>
        <Text style={styles.cardEvents}>{item.eventCount || 0} {(item.eventCount || 0) > 1 ? t('home.events') : t('home.event')}</Text>
      </View>
      <Text style={styles.cardDate}>{formatDate(item.updatedAt)}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>{t('app.title')}</Text>
          <Text style={styles.subtitle}>{t('app.subtitle')}</Text>
        </View>
        <TouchableOpacity style={styles.settingsBtn} onPress={() => setSettingsVisible(true)}>
          <Ionicons name="settings-outline" size={22} color="#8888aa" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.newButton} onPress={onNewShow}>
        <Text style={styles.newButtonText}>{t('home.newShow')}</Text>
      </TouchableOpacity>

      {shows.length === 0 && !loading ? (
        <View style={styles.emptyContainer}>
          <DemoViewer style={styles.demoViewer} />
          <Text style={styles.emptyText}>{t('home.noShows')}</Text>
          <TouchableOpacity onPress={onNewShow}>
            <Text style={styles.emptyHint}>{t('home.noShowsHint')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.demoButton} onPress={handleCreateDemo}>
            <Ionicons name="play-circle-outline" size={20} color="#e94560" />
            <Text style={styles.demoButtonText}>{t('home.demoShow')}</Text>
          </TouchableOpacity>
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

      {/* Settings modal */}
      <Modal visible={settingsVisible} transparent animationType="fade" onRequestClose={() => setSettingsVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSettingsVisible(false)}>
          <Pressable style={styles.settingsModal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.settingsHeader}>
              <Text style={styles.settingsTitle}>{t('settings.title')}</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setSettingsVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* About */}
              <TouchableOpacity style={styles.settingsItem} onPress={() => { setSettingsVisible(false); setTimeout(() => setAboutVisible(true), 300); }}>
                <Ionicons name="information-circle-outline" size={18} color="#8888aa" />
                <Text style={styles.settingsItemText}>{t('settings.about')}</Text>
                <Text style={styles.settingsItemArrow}>›</Text>
              </TouchableOpacity>

              {/* Support Chat */}
              <TouchableOpacity style={styles.settingsItem} onPress={() => { setSettingsVisible(false); setTimeout(() => setChatVisible(true), 300); }}>
                <Image source={require('../assets/guillaume.jpg')} style={styles.settingsAvatar} />
                <Text style={styles.settingsItemText}>{t('chat.settingsLabel')}</Text>
                {chatUnread > 0 && (
                  <View style={styles.chatBadge}>
                    <Text style={styles.chatBadgeText}>{chatUnread}</Text>
                  </View>
                )}
                <Text style={styles.settingsItemArrow}>›</Text>
              </TouchableOpacity>

              {/* Demo show */}
              <TouchableOpacity style={styles.settingsItem} onPress={handleCreateDemo}>
                <Ionicons name="play-circle-outline" size={18} color="#e94560" />
                <Text style={styles.settingsItemText}>{t('home.createDemo')}</Text>
                <Text style={styles.settingsItemArrow}>›</Text>
              </TouchableOpacity>

              {/* Languages */}
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>{t('settings.language')}</Text>
                <View style={styles.langRow}>
                  {LANGUAGES.map((lang) => (
                    <TouchableOpacity
                      key={lang.code}
                      style={[styles.langBtn, selectedLang === lang.code && styles.langBtnActive]}
                      onPress={() => { setSelectedLang(lang.code); setAppLanguage(lang.code); }}
                    >
                      <Text style={styles.langFlag}>{lang.flag}</Text>
                      <Text style={[styles.langLabel, selectedLang === lang.code && styles.langLabelActive]}>{lang.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <FlashMessage ref={flashRef} />

      {/* Support Chat modal */}
      <Modal visible={chatVisible} animationType="slide" onRequestClose={() => { setChatVisible(false); setChatUnread(0); }}>
        <SupportChat onClose={() => { setChatVisible(false); setChatUnread(0); }} />
      </Modal>

      {/* About modal */}
      <Modal visible={aboutVisible} transparent animationType="fade" onRequestClose={() => { setAboutVisible(false); setTimeout(() => setSettingsVisible(true), 300); }}>
        <Pressable style={styles.modalOverlay} onPress={() => { setAboutVisible(false); setTimeout(() => setSettingsVisible(true), 300); }}>
          <Pressable style={styles.aboutModal} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.aboutTitle}>{t('settings.about')}</Text>
            <Text style={styles.aboutText}>
              {t('settings.aboutText1')}{' '}
              <Text style={styles.aboutBold}>Guillaume HARARI</Text>.
            </Text>
            <Text style={styles.aboutText}>
              {t('settings.aboutText2')}
            </Text>
            <Text style={styles.aboutDisclaimer}>
              {t('settings.disclaimer')}
            </Text>
            <TouchableOpacity
              style={styles.aboutMailBtn}
              onPress={() => Linking.openURL('mailto:guillaumeharari@hotmail.com?subject=Light%20Studio%20-%20Suggestion')}
            >
              <Ionicons name="mail-outline" size={18} color="#44aaff" />
              <Text style={styles.aboutMailText}>guillaumeharari@hotmail.com</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.aboutCloseBtn} onPress={() => { setAboutVisible(false); setTimeout(() => setSettingsVisible(true), 300); }}>
              <Text style={styles.aboutCloseBtnText}>{t('settings.close')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsBtnIcon: {
    fontSize: 20,
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
    paddingBottom: 30,
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
    paddingHorizontal: 20,
  },
  demoViewer: {
    width: SCREEN_WIDTH - 40,
    height: 220,
    marginBottom: 24,
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
  demoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(233, 69, 96, 0.25)',
    gap: 10,
  },
  demoButtonText: {
    color: '#e94560',
    fontSize: 14,
    fontWeight: '600',
  },
  newButton: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#44aaff',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  newButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Modal overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  // Settings modal
  settingsModal: {
    backgroundColor: '#1a1a2e',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    width: '100%',
    maxHeight: '70%',
    overflow: 'hidden',
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4a',
  },
  settingsTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  closeBtn: {
    position: 'absolute',
    right: 14,
    top: 14,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#8888aa',
    fontSize: 14,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e3a',
    gap: 14,
  },
  settingsItemIcon: {
    fontSize: 18,
    marginRight: 14,
  },
  settingsItemText: {
    color: '#ccccee',
    fontSize: 15,
    flex: 1,
  },
  settingsItemArrow: {
    color: '#6666aa',
    fontSize: 22,
    fontWeight: '300',
  },
  settingsSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  settingsSectionTitle: {
    color: '#8888aa',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  langRow: {
    flexDirection: 'row',
    gap: 8,
  },
  langBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  langBtnActive: {
    borderColor: '#44aaff',
    backgroundColor: 'rgba(68, 170, 255, 0.1)',
  },
  langFlag: {
    fontSize: 22,
    marginBottom: 4,
  },
  langLabel: {
    color: '#6666aa',
    fontSize: 11,
    fontWeight: '500',
  },
  langLabelActive: {
    color: '#44aaff',
  },
  // About modal
  aboutModal: {
    backgroundColor: '#1a1a2e',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    width: '100%',
    padding: 24,
  },
  aboutTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 18,
  },
  aboutText: {
    color: '#ccccee',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 12,
  },
  aboutBold: {
    fontWeight: '700',
    color: '#ffffff',
  },
  aboutDisclaimer: {
    color: '#8888aa',
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  aboutMailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(68, 170, 255, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(68, 170, 255, 0.25)',
    paddingVertical: 14,
    marginTop: 6,
    marginBottom: 18,
    gap: 10,
  },
  aboutMailIcon: {
    fontSize: 16,
  },
  aboutMailText: {
    color: '#44aaff',
    fontSize: 14,
    fontWeight: '600',
  },
  aboutCloseBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  aboutCloseBtnText: {
    color: '#8888aa',
    fontSize: 14,
  },
  settingsAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  chatBadge: {
    backgroundColor: '#e94560',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  chatBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});
