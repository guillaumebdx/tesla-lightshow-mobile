import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { sendMessage, fetchMessages, getDeviceInfo } from './chatService';

const GUILLAUME_PHOTO = require('../assets/guillaume.jpg');

const MAX_MSG_LENGTH = 2000;
const POLL_INTERVAL_MS = 3000;

export default function SupportChat({ onClose }) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const flatListRef = useRef(null);
  const pollRef = useRef(null);
  const lastMsgIdRef = useRef(null);
  const mountedRef = useRef(true);
  const messagesRef = useRef([]);
  const isNearBottomRef = useRef(true);
  const initialScrollDone = useRef(false);

  // Keep messagesRef in sync with state
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Initial load + cleanup
  useEffect(() => {
    mountedRef.current = true;
    loadAllMessages();
    return () => {
      mountedRef.current = false;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, []);

  // Start polling after initial load
  useEffect(() => {
    if (!loading) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(pollNewMessages, POLL_INTERVAL_MS);
      return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    }
  }, [loading]);

  const loadAllMessages = async () => {
    try {
      setLoading(true);
      const data = await fetchMessages(null);
      if (!mountedRef.current) return;
      const msgs = data.messages || [];
      setMessages(msgs);
      if (msgs.length > 0) {
        lastMsgIdRef.current = msgs[msgs.length - 1].id;
      }
      setError(null);
      // Scroll to bottom after initial render
      initialScrollDone.current = false;
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
        initialScrollDone.current = true;
      }, 150);
    } catch (e) {
      if (mountedRef.current) setError(e.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const pollNewMessages = async () => {
    if (!mountedRef.current) return;
    try {
      const data = await fetchMessages(lastMsgIdRef.current);
      if (!mountedRef.current) return;
      const newMsgs = data.messages || [];
      if (newMsgs.length === 0) return;

      // Deduplicate: only keep messages with IDs we don't already have
      const existingIds = new Set(messagesRef.current.map(m => m.id));
      const uniqueNew = newMsgs.filter(m => !existingIds.has(m.id));
      if (uniqueNew.length === 0) return;

      setMessages(prev => {
        const filtered = prev.filter(m => typeof m.id === 'number' || String(m.id).startsWith('temp_'));
        return [...filtered, ...uniqueNew];
      });
      lastMsgIdRef.current = uniqueNew[uniqueNew.length - 1].id;
      // Auto-scroll only if user is near bottom
      if (isNearBottomRef.current) {
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (e) {
      // Silent fail — polling will retry next interval
    }
  };

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || sending) return;

    setSending(true);
    setInput('');

    // Optimistic UI
    const tempId = 'temp_' + Date.now();
    const tempMsg = {
      id: tempId,
      sender: 'user',
      content,
      created_at: new Date().toISOString().replace('T', ' ').replace('Z', '').split('.')[0],
      _pending: true,
    };
    setMessages(prev => [...prev, tempMsg]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const deviceInfo = { ...getDeviceInfo(), lang: i18n.language };
      const result = await sendMessage(content, deviceInfo);

      // Fetch the new message(s) from server to get real IDs
      const data = await fetchMessages(lastMsgIdRef.current);
      if (!mountedRef.current) return;
      const newMsgs = data.messages || [];

      if (newMsgs.length > 0) {
        // Remove temp, add real messages
        const existingIds = new Set(messagesRef.current.filter(m => typeof m.id === 'number').map(m => m.id));
        const uniqueNew = newMsgs.filter(m => !existingIds.has(m.id));

        setMessages(prev => {
          const withoutTemp = prev.filter(m => m.id !== tempId);
          return [...withoutTemp, ...uniqueNew];
        });
        lastMsgIdRef.current = newMsgs[newMsgs.length - 1].id;
      } else {
        // Fallback: remove temp, force reload all
        setMessages(prev => prev.filter(m => m.id !== tempId));
        await loadAllMessages();
      }
      setError(null);
    } catch (e) {
      if (!mountedRef.current) return;
      // Remove temp on error, restore input
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setInput(content);
      setError(e.message);
    } finally {
      if (mountedRef.current) setSending(false);
    }
  }, [input, sending, i18n.language]);

  const renderMessage = useCallback(({ item }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAdmin]}>
        {!isUser && (
          <Image source={GUILLAUME_PHOTO} style={styles.adminAvatar} />
        )}
        <View style={[styles.msgBubble, isUser ? styles.msgBubbleUser : styles.msgBubbleAdmin, item._pending && styles.msgPending]}>
          <Text style={[styles.msgText, isUser ? styles.msgTextUser : styles.msgTextAdmin]}>{item.content}</Text>
          <Text style={[styles.msgTime, isUser ? styles.msgTimeUser : styles.msgTimeAdmin]}>
            {item._pending ? '...' : formatTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  }, []);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color="#44aaff" />
        </TouchableOpacity>
        <Image source={GUILLAUME_PHOTO} style={styles.headerAvatar} />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('chat.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('chat.subtitle')}</Text>
        </View>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#44aaff" />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubble-ellipses-outline" size={48} color="#2a2a4a" />
          <Text style={styles.emptyTitle}>{t('chat.emptyTitle')}</Text>
          <Text style={styles.emptyText}>{t('chat.emptyText')}</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onLayout={() => {
            if (!initialScrollDone.current) {
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            isNearBottomRef.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 80;
          }}
          scrollEventThrottle={200}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* Error */}
      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Ionicons name="close" size={16} color="#e94560" />
          </TouchableOpacity>
        </View>
      )}

      {/* Input */}
      <View style={[styles.inputArea, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={(val) => setInput(val.slice(0, MAX_MSG_LENGTH))}
          placeholder={t('chat.placeholder')}
          placeholderTextColor="#444466"
          multiline
          maxLength={MAX_MSG_LENGTH}
          editable={!sending}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function formatTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString + (isoString.endsWith('Z') ? '' : 'Z'));
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${hours}:${mins}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4a',
    gap: 12,
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#6666aa',
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    color: '#6666aa',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    color: '#444466',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  messagesList: {
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'flex-end',
    gap: 8,
  },
  msgRowUser: {
    justifyContent: 'flex-end',
  },
  msgRowAdmin: {
    justifyContent: 'flex-start',
  },
  adminAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  msgBubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  msgBubbleUser: {
    backgroundColor: '#44aaff',
    borderBottomRightRadius: 4,
  },
  msgBubbleAdmin: {
    backgroundColor: '#1a1a35',
    borderBottomLeftRadius: 4,
  },
  msgPending: {
    opacity: 0.6,
  },
  msgText: {
    fontSize: 14,
    lineHeight: 20,
  },
  msgTextUser: {
    color: '#ffffff',
  },
  msgTextAdmin: {
    color: '#ccccee',
  },
  msgTime: {
    fontSize: 10,
    marginTop: 4,
  },
  msgTimeUser: {
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'right',
  },
  msgTimeAdmin: {
    color: '#6666aa',
  },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  errorText: {
    color: '#e94560',
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2a2a4a',
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#12122a',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    color: '#ffffff',
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#44aaff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#2a2a4a',
  },
});
