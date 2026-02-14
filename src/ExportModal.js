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

const PAGES = [
  {
    title: 'Importer dans ta Tesla',
    content: () => (
      <View>
        <Text style={s.paragraph}>
          Pour importer ton LightShow dans ta Tesla, suis bien ces conseils :
        </Text>

        <View style={s.noteBox}>
          <Text style={s.noteIcon}>⚠️</Text>
          <Text style={s.noteText}>
            Il n'est possible d'avoir qu'un seul LightShow personnalisé dans sa Tesla.{'\n'}
            Pour en avoir plusieurs, il faut multiplier les clés USB !
          </Text>
        </View>

        <View style={s.tipBox}>
          <Text style={s.tipIcon}>💡</Text>
          <Text style={s.tipText}>
            Nos Tesla sont capricieuses. Si tu veux augmenter tes chances que ça fonctionne du premier coup :{' '}
            <Text style={s.bold}>utilise une clé USB à part.</Text>
          </Text>
        </View>
      </View>
    ),
  },
  {
    title: 'Formater ta clé USB',
    content: () => (
      <View>
        <Text style={s.paragraph}>Formate ta clé USB :</Text>

        <View style={s.stepList}>
          <View style={s.step}>
            <Text style={s.stepNumber}>1</Text>
            <Text style={s.stepText}>Clique droit sur la clé</Text>
          </View>
          <View style={s.step}>
            <Text style={s.stepNumber}>2</Text>
            <Text style={s.stepText}>Formater</Text>
          </View>
          <View style={s.step}>
            <Text style={s.stepNumber}>3</Text>
            <View>
              <Text style={s.stepText}>Système de fichiers : <Text style={s.bold}>exFAT</Text></Text>
              <Text style={s.stepText}>Type d'allocation : <Text style={s.bold}>par défaut</Text></Text>
            </View>
          </View>
          <View style={s.step}>
            <Text style={s.stepNumber}>4</Text>
            <Text style={s.stepText}>Démarrer</Text>
          </View>
        </View>
      </View>
    ),
  },
  {
    title: 'Préparer les fichiers',
    content: () => (
      <View>
        <Text style={s.paragraph}>
          Crée un dossier à la racine de la clé, nomme-le :
        </Text>

        <View style={s.codeBox}>
          <Text style={s.codeText}>LightShow</Text>
        </View>

        <View style={s.warningBox}>
          <Text style={s.warningText}>
            Ne le nomme pas autrement, sans espace et respecte les majuscules/minuscules.
          </Text>
        </View>

        <Text style={s.paragraph}>
          Dépose le fichier MP3 et le fichier FSEQ dans ce dossier.{'\n'}
          Ils doivent obligatoirement avoir <Text style={s.bold}>le même nom</Text> :
        </Text>

        <View style={s.fileList}>
          <View style={s.fileItem}>
            <Text style={s.fileIcon}>🎵</Text>
            <Text style={s.fileName}>lightshow.mp3</Text>
          </View>
          <View style={s.fileItem}>
            <Text style={s.fileIcon}>📄</Text>
            <Text style={s.fileName}>lightshow.fseq</Text>
          </View>
        </View>

        <View style={s.warningBox}>
          <Text style={s.warningText}>
            Il ne faut rien déposer d'autre dans le dossier.
          </Text>
        </View>

        <View style={s.tipBox}>
          <Text style={s.tipIcon}>💡</Text>
          <Text style={s.tipText}>
            Dans Windows, si tu veux voir les extensions pour être certain : dans un dossier, clique sur{' '}
            <Text style={s.bold}>Afficher → Afficher → Extensions de noms de fichiers</Text>
          </Text>
        </View>
      </View>
    ),
  },
  {
    title: 'Brancher dans ta Tesla',
    content: null, // Will be rendered dynamically with the export button
  },
];

export default function ExportModal({ visible, onClose, onExportFseq, onExportMp3, trackInfo }) {
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportingMp3, setExportingMp3] = useState(false);

  const isBuiltinTrack = trackInfo?.isBuiltin === true;

  const isLastPage = page === PAGES.length - 1;
  const currentPage = PAGES[page];

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
            <Text style={s.headerTitle}>{currentPage.title}</Text>
            <TouchableOpacity style={s.closeBtn} onPress={handleClose}>
              <Text style={s.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Page indicator */}
          <View style={s.pageIndicator}>
            {PAGES.map((_, i) => (
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
            {isLastPage ? (
              <View>
                <Text style={s.paragraph}>
                  Branche ta clé dans ta Tesla.
                </Text>

                <View style={s.tipBox}>
                  <Text style={s.tipIcon}>🔌</Text>
                  <Text style={s.tipText}>
                    Utilise le <Text style={s.bold}>port USB principal</Text> et non un port USB dédié à la recharge.{'\n\n'}
                    La plupart du temps, sur les modèles d'après 2021, le port USB data se trouve dans la <Text style={s.bold}>boîte à gants</Text>.
                  </Text>
                </View>

                <Text style={s.paragraph}>
                  Va dans <Text style={s.bold}>LightShow</Text> : tu verras directement sélectionné "lightshow" comme show à lancer. C'est que tout est bon !
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
                      <Text style={s.exportBtnText}>Exporter le .fseq</Text>
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
                        <Text style={s.exportMp3BtnText}>Exporter le MP3</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              currentPage.content()
            )}
          </ScrollView>

          {/* Navigation */}
          <View style={s.nav}>
            {page > 0 ? (
              <TouchableOpacity style={s.navBtn} onPress={() => setPage(page - 1)}>
                <Text style={s.navBtnText}>← Précédent</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
            {!isLastPage && (
              <TouchableOpacity style={s.navBtnNext} onPress={() => setPage(page + 1)}>
                <Text style={s.navBtnNextText}>Suivant →</Text>
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
