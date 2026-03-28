const express = require('express');
const router = express.Router();
const { getAllConversations, getMessages, addMessage, markReadByAdmin, setConversationStatus } = require('../services/database');
const OpenAI = require('openai');

const SUPPORT_SYSTEM_PROMPT = `Tu es l'assistant support de LightShow Studio, une application mobile (iOS & Android) qui permet de créer des light shows personnalisés pour les véhicules Tesla (Model 3/Y compatibles).

Fonctionnalités principales de l'app :
- Éditeur visuel avec modèle 3D interactif de la Tesla
- 21 éléments contrôlables : phares, clignotants, répétiteurs, plaque, feux stop, antibrouillard, vitres (4), rétroviseurs (2), coffre, trappe de charge
- Timeline audio synchronisée avec import de musiques MP3 ou bibliothèque intégrée
- Effets : solid, blink (3 vitesses), puissance variable, ease in/out
- Closures : ouverture/fermeture vitres, rétros, coffre, trappe avec limites hardware Tesla
- Génération automatique par IA synchronisée à la musique
- Export en fichier .fseq compatible Tesla (transfert via clé USB)
- Partage communautaire de shows en JSON
- 4 langues : FR, EN, ES, DE

Procédure d'utilisation sur le véhicule :
1. Exporter le .fseq + le .mp3 depuis l'app
2. Les copier sur une clé USB dans un dossier "LightShow"
3. Brancher la clé USB dans le véhicule
4. Aller dans Toybox > Light Show sur l'écran Tesla

Tu génères un brouillon de réponse que l'admin (Guillaume) relira et éditera avant envoi. Sois concis, amical et utile. Réponds dans la langue du dernier message de l'utilisateur.`;

// GET /admin/chat/conversations — List all conversations
router.get('/conversations', (req, res) => {
  try {
    const conversations = getAllConversations();
    res.json({ conversations });
  } catch (e) {
    console.error('[AdminChat] List error:', e.message);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// GET /admin/chat/conversations/:id/messages — Get messages for a conversation
router.get('/conversations/:id/messages', (req, res) => {
  try {
    const sinceId = req.query.since_id ? parseInt(req.query.since_id, 10) : null;
    const messages = getMessages(req.params.id, sinceId);
    markReadByAdmin(req.params.id);
    res.json({ messages });
  } catch (e) {
    console.error('[AdminChat] Messages error:', e.message);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// POST /admin/chat/conversations/:id/messages — Admin sends a reply
router.post('/conversations/:id/messages', (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Message content required' });
    if (content.length > 5000) return res.status(400).json({ error: 'Message too long' });

    const msgId = addMessage(req.params.id, 'admin', content.trim());
    res.json({ ok: true, messageId: msgId });
  } catch (e) {
    console.error('[AdminChat] Reply error:', e.message);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

// PATCH /admin/chat/conversations/:id — Update conversation status
router.patch('/conversations/:id', (req, res) => {
  try {
    const { status } = req.body;
    if (!['open', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    setConversationStatus(req.params.id, status);
    res.json({ ok: true });
  } catch (e) {
    console.error('[AdminChat] Status error:', e.message);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// POST /admin/chat/conversations/:id/generate — Generate AI draft reply
router.post('/conversations/:id/generate', async (req, res) => {
  try {
    const model = process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OpenAI API key not configured' });

    const messages = getMessages(req.params.id);
    if (messages.length === 0) return res.status(400).json({ error: 'No messages in conversation' });

    const chatMessages = [
      { role: 'system', content: SUPPORT_SYSTEM_PROMPT },
      ...messages.map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.content,
      })),
    ];

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model,
      messages: chatMessages,
      max_tokens: 500,
      temperature: 0.7,
    });

    const draft = completion.choices?.[0]?.message?.content || '';
    res.json({ draft, model, tokens: completion.usage?.total_tokens || 0 });
  } catch (e) {
    console.error('[AdminChat] AI generate error:', e.message);
    res.status(500).json({ error: 'AI generation failed: ' + e.message });
  }
});

// POST /admin/chat/translate — Translate text to target language via LLM
router.post('/translate', async (req, res) => {
  try {
    const model = process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OpenAI API key not configured' });

    const { text, targetLang } = req.body;
    if (!text || !targetLang) return res.status(400).json({ error: 'Missing text or targetLang' });

    const langNames = { en: 'English', de: 'German', es: 'Spanish', fr: 'French' };
    const langName = langNames[targetLang] || targetLang;

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: `You are a translator. Translate the user's message to ${langName}. Rules:
- Use simple, clear words that anyone can understand.
- Keep the same tone and style (casual, friendly, technical — match the original).
- Do NOT add or remove information. Just translate.
- Output ONLY the translated text, nothing else.`,
        },
        { role: 'user', content: text },
      ],
      max_tokens: 500,
      temperature: 0.3,
    });

    const translation = completion.choices?.[0]?.message?.content?.trim() || '';
    res.json({ translation, tokens: completion.usage?.total_tokens || 0 });
  } catch (e) {
    console.error('[AdminChat] Translate error:', e.message);
    res.status(500).json({ error: 'Translation failed: ' + e.message });
  }
});

module.exports = router;
