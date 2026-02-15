import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';

const PAGE_COUNT = 4;

export default function ExportModal({ visible, onClose, onExportFseq, onExportMp3, trackInfo }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportingMp3, setExportingMp3] = useState(false);

  const isBuiltinTrack = trackInfo?.isBuiltin === true;

  const isLastPage = page === PAGE_COUNT - 1;

  const pageTitles = [
    t('export.page1Title'),
    t('export.page2Title'),
    t('export.page3Title'),
    t('export.page4Title'),
  ];

  const handleClose = () => {
    setPage(0);
    setExporting(false);
    onClose();
  };

  const handleExportFseq = async () => {
    setExporting(true);
    try {
      await onExportFseq();
    } catch (e) {
      // Error handled by parent
    } finally {
      setExporting(false);
    }
  };

  const handleExportMp3 = async () => {
    setExportingMp3(true);
    try {
      await onExportMp3();
    } catch (e) {
      // Error handled by parent
    } finally {
      setExportingMp3(false);
    }
  };

  const renderPage = () => {
    if (page === 0) return (
      <View>
        <Text style={s.paragraph}>{t('export.page1Intro')}</Text>
        <View style={s.noteBox}>
          <Text style={s.noteIcon}>⚠️</Text>
          <Text style={s.noteText}>{t('export.page1Note')}</Text>
        </View>
        <View style={s.tipBox}>
          <Text style={s.tipIcon}>💡</Text>
          <Text style={s.tipText}>
            {t('export.page1Tip')}<Text style={s.bold}>{t('export.page1TipBold')}</Text>
          </Text>
        </View>
      </View>
    );
    if (page === 1) return (
      <View>
        <Text style={s.paragraph}>{t('export.page2Intro')}</Text>
        <View style={s.stepList}>
          <View style={s.step}>
            <Text style={s.stepNumber}>1</Text>
            <Text style={s.stepText}>{t('export.page2Step1')}</Text>
          </View>
          <View style={s.step}>
            <Text style={s.stepNumber}>2</Text>
            <Text style={s.stepText}>{t('export.page2Step2')}</Text>
          </View>
          <View style={s.step}>
            <Text style={s.stepNumber}>3</Text>
            <View>
              <Text style={s.stepText}>{t('export.page2Step3a')}<Text style={s.bold}>{t('export.page2Step3aBold')}</Text></Text>
              <Text style={s.stepText}>{t('export.page2Step3b')}<Text style={s.bold}>{t('export.page2Step3bBold')}</Text></Text>
            </View>
          </View>
          <View style={s.step}>
            <Text style={s.stepNumber}>4</Text>
            <Text style={s.stepText}>{t('export.page2Step4')}</Text>
          </View>
        </View>
      </View>
    );
    if (page === 2) return (
      <View>
        <Text style={s.paragraph}>{t('export.page3Intro')}</Text>
        <View style={s.codeBox}>
          <Text style={s.codeText}>LightShow</Text>
        </View>
        <View style={s.warningBox}>
          <Text style={s.warningText}>{t('export.page3Warning1')}</Text>
        </View>
        <Text style={s.paragraph}>
          {t('export.page3FileIntro')}<Text style={s.bold}>{t('export.page3FileIntroBold')}</Text>{t('export.page3FileIntroEnd')}
        </Text>
        <View style={s.fileList}>
          <View style={s.fileItem}>
            <Text style={s.fileIcon}>🎵</Text>
            <Text style={s.fileName}>lightshow.mp3</Text>
          </View>
          <View style={s.fileItem}>
            <Text style={s.fileIcon}>�</Text>
            <Text style={s.fileName}>lightshow.fseq</Text>
          </View>
        </View>
        <View style={s.warningBox}>
          <Text style={s.warningText}>{t('export.page3Warning2')}</Text>
        </View>
        <View style={s.tipBox}>
          <Text style={s.tipIcon}>💡</Text>
          <Text style={s.tipText}>
            {t('export.page3Tip')}<Text style={s.bold}>{t('export.page3TipBold')}</Text>
          </Text>
        </View>
      </View>
    );
    // page === 3 (last page)
    return (
      <View>
        <Text style={s.paragraph}>{t('export.page4Intro')}</Text>
        <View style={s.tipBox}>
          <Text style={s.tipIcon}>🔌</Text>
          <Text style={s.tipText}>
            {t('export.page4Tip')}<Text style={s.bold}>{t('export.page4TipBold1')}</Text>{t('export.page4TipMid')}<Text style={s.bold}>{t('export.page4TipBold2')}</Text>{t('export.page4TipEnd')}
          </Text>
        </View>
        <Text style={s.paragraph}>
          {t('export.page4Outro')}<Text style={s.bold}>{t('export.page4OutroBold')}</Text>{t('export.page4OutroEnd')}
        </Text>
        {/* Export buttons */}
        <TouchableOpacity
          style={[s.exportBtn, exporting && s.exportBtnDisabled]}
          onPress={handleExportFseq}
          disabled={exporting || exportingMp3}
        >
          {exporting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Text style={s.exportBtnIcon}>📤</Text>
              <Text style={s.exportBtnText}>{t('export.exportFseq')}</Text>
            </>
          )}
        </TouchableOpacity>
        {isBuiltinTrack && (
          <TouchableOpacity
            style={[s.exportMp3Btn, exportingMp3 && s.exportBtnDisabled]}
            onPress={handleExportMp3}
            disabled={exporting || exportingMp3}
          >
            {exportingMp3 ? (
              <ActivityIndicator size="small" color="#44aaff" />
            ) : (
              <>
                <Text style={s.exportBtnIcon}>🎵</Text>
                <Text style={s.exportMp3BtnText}>{t('export.exportMp3')}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={s.overlay}>
        <View style={s.modal}>
          {/* Header */}
          <View style={s.header}>
            <Text style={s.headerTitle}>{pageTitles[page]}</Text>
            <TouchableOpacity style={s.closeBtn} onPress={handleClose}>
              <Text style={s.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Page indicator */}
          <View style={s.pageIndicator}>
            {Array.from({ length: PAGE_COUNT }).map((_, i) => (
              <View
                key={i}
                style={[s.pageDot, i === page && s.pageDotActive]}
              />
            ))}
          </View>

          {/* Content */}
          <ScrollView
            style={s.scrollContent}
            contentContainerStyle={s.scrollContentInner}
            showsVerticalScrollIndicator={true}
          >
            {renderPage()}
          </ScrollView>

          {/* Navigation */}
          <View style={s.nav}>
            {page > 0 ? (
              <TouchableOpacity style={s.navBtn} onPress={() => setPage(page - 1)}>
                <Text style={s.navBtnText}>{t('export.previous')}</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
            {!isLastPage && (
              <TouchableOpacity style={s.navBtnNext} onPress={() => setPage(page + 1)}>
                <Text style={s.navBtnNextText}>{t('export.next')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#1a1a2e',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    width: '100%',
    maxHeight: '85%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 4,
  },
  headerTitle: {
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
  pageIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  pageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2a2a4a',
  },
  pageDotActive: {
    backgroundColor: '#e94560',
    width: 20,
  },
  scrollContent: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContentInner: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  paragraph: {
    color: '#ccccee',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 14,
  },
  bold: {
    fontWeight: '700',
    color: '#ffffff',
  },
  noteBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(233, 69, 96, 0.3)',
    padding: 14,
    marginBottom: 14,
    gap: 10,
  },
  noteIcon: {
    fontSize: 18,
  },
  noteText: {
    color: '#ee8899',
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
  tipBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(68, 170, 255, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(68, 170, 255, 0.2)',
    padding: 14,
    marginBottom: 14,
    gap: 10,
  },
  tipIcon: {
    fontSize: 18,
  },
  tipText: {
    color: '#88bbee',
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
  warningBox: {
    backgroundColor: 'rgba(255, 170, 0, 0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 170, 0, 0.2)',
    padding: 12,
    marginBottom: 14,
  },
  warningText: {
    color: '#ddaa55',
    fontSize: 13,
    lineHeight: 20,
  },
  stepList: {
    gap: 10,
    marginBottom: 14,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
    color: '#e94560',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 26,
    overflow: 'hidden',
  },
  stepText: {
    color: '#ccccee',
    fontSize: 14,
    lineHeight: 26,
  },
  codeBox: {
    backgroundColor: 'rgba(40, 40, 70, 0.8)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a5a',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    marginBottom: 14,
  },
  codeText: {
    color: '#44aaff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  fileList: {
    gap: 8,
    marginBottom: 14,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(40, 40, 70, 0.5)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
  },
  fileIcon: {
    fontSize: 16,
  },
  fileName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e94560',
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 10,
    gap: 10,
  },
  exportBtnDisabled: {
    opacity: 0.6,
  },
  exportBtnIcon: {
    fontSize: 18,
  },
  exportBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  exportMp3Btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(68, 170, 255, 0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#44aaff',
    paddingVertical: 14,
    marginTop: 10,
    gap: 10,
  },
  exportMp3BtnText: {
    color: '#44aaff',
    fontSize: 15,
    fontWeight: '600',
  },
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#2a2a4a',
  },
  navBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  navBtnText: {
    color: '#8888aa',
    fontSize: 14,
  },
  navBtnNext: {
    backgroundColor: 'rgba(68, 170, 255, 0.15)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  navBtnNextText: {
    color: '#44aaff',
    fontSize: 14,
    fontWeight: '600',
  },
});
