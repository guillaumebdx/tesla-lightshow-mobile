import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

const MAX_PROMPT_LENGTH = 500;

const SUGGESTION_ICONS = ['🎆', '🌊', '🎉', '👻', '💖', '🔥'];

export default function AiPromptModal({ visible, onClose, onGenerate }) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');

  const suggestions = [
    { key: 'fireworks', icon: SUGGESTION_ICONS[0], label: t('aiPrompt.suggFireworks'), text: t('aiPrompt.suggFireworksText') },
    { key: 'wave', icon: SUGGESTION_ICONS[1], label: t('aiPrompt.suggWave'), text: t('aiPrompt.suggWaveText') },
    { key: 'party', icon: SUGGESTION_ICONS[2], label: t('aiPrompt.suggParty'), text: t('aiPrompt.suggPartyText') },
    { key: 'spooky', icon: SUGGESTION_ICONS[3], label: t('aiPrompt.suggSpooky'), text: t('aiPrompt.suggSpookyText') },
    { key: 'romantic', icon: SUGGESTION_ICONS[4], label: t('aiPrompt.suggRomantic'), text: t('aiPrompt.suggRomanticText') },
    { key: 'aggressive', icon: SUGGESTION_ICONS[5], label: t('aiPrompt.suggAggressive'), text: t('aiPrompt.suggAggressiveText') },
  ];

  const handleSuggestion = useCallback((text) => {
    setPrompt(text.slice(0, MAX_PROMPT_LENGTH));
  }, []);

  const handleGenerate = useCallback(() => {
    onGenerate(prompt.trim());
    setPrompt('');
  }, [prompt, onGenerate]);

  const handleClose = useCallback(() => {
    setPrompt('');
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Ionicons name="sparkles" size={20} color="#a855f7" />
                <Text style={styles.title}>{t('aiPrompt.title')}</Text>
              </View>
              <TouchableOpacity onPress={handleClose} hitSlop={12}>
                <Ionicons name="close" size={22} color="#888" />
              </TouchableOpacity>
            </View>

            {/* Textarea */}
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.textInput}
                placeholder={t('aiPrompt.placeholder')}
                placeholderTextColor="#666"
                multiline
                maxLength={MAX_PROMPT_LENGTH}
                value={prompt}
                onChangeText={setPrompt}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>
                {prompt.length}/{MAX_PROMPT_LENGTH}
              </Text>
            </View>

            {/* Suggestions */}
            <Text style={styles.suggestionsLabel}>{t('aiPrompt.ideas')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.suggestionsRow}
            >
              {suggestions.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={styles.suggestionChip}
                  onPress={() => handleSuggestion(s.text)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.suggestionIcon}>{s.icon}</Text>
                  <Text style={styles.suggestionLabel}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Generate button */}
            <TouchableOpacity
              style={styles.generateBtn}
              onPress={handleGenerate}
              activeOpacity={0.8}
            >
              <Ionicons name="sparkles" size={18} color="#fff" />
              <Text style={styles.generateBtnText}>{t('aiPrompt.generate')}</Text>
            </TouchableOpacity>

            <Text style={styles.hint}>{t('aiPrompt.hint')}</Text>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: {
    width: '100%',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    maxWidth: 420,
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  inputWrapper: {
    backgroundColor: '#12122a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    marginBottom: 14,
  },
  textInput: {
    color: '#fff',
    fontSize: 14,
    minHeight: 90,
    maxHeight: 140,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 28,
  },
  charCount: {
    position: 'absolute',
    bottom: 8,
    right: 12,
    color: '#555',
    fontSize: 11,
  },
  suggestionsLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  suggestionsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 16,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252545',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: '#333360',
  },
  suggestionIcon: {
    fontSize: 14,
  },
  suggestionLabel: {
    color: '#c4b5fd',
    fontSize: 12,
    fontWeight: '600',
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7c3aed',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 8,
  },
  generateBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  hint: {
    color: '#555',
    fontSize: 11,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
