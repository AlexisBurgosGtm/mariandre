const fs = require('fs').promises;
const qrcode = require('qrcode');
const pino = require('pino');
const appPaths = require('./appPaths');

const MAX_MESSAGES = 100;
const UNREAD_POLL_MS = 2500;
const logger = pino({ level: 'silent' });

const state = {
  status: 'idle',
  qr: null,
  error: null,
  info: null,
};

let sock = null;
let initializing = false;
let reconnecting = false;
let stopReconnect = false;
let unreadPollTimer = null;
let baileysLib = null;
let saveCreds = null;
const sseClients = new Set();
const messages = [];
const processedMessageIds = new Set();
const chatNameCache = new Map();
let initialUnreadSyncDone = false;

async function loadBaileys() {
  if (!baileysLib) {
    baileysLib = await import('@whiskeysockets/baileys');
  }
  return baileysLib;
}

function getAuthPath() {
  return appPaths.whatsappAuthPath();
}

function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  sseClients.forEach((res) => {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  });
}

function getPublicState() {
  return {
    status: state.status,
    qr: state.qr,
    error: state.error,
    info: state.info,
    messageCount: messages.length,
  };
}

function stripJid(value) {
  return (value || '').replace(/@.+$/, '').trim();
}

function looksLikePhone(value) {
  if (!value) return true;
  const s = stripJid(value);
  const digits = s.replace(/\D/g, '');
  return digits.length >= 8 && /^[\d+\s\-()]+$/.test(s);
}

function toMsTimestamp(value) {
  if (!value) return Date.now();
  if (typeof value === 'number') return value > 1e12 ? value : value * 1000;
  if (typeof value === 'bigint') return Number(value) * 1000;
  if (typeof value?.toNumber === 'function') return value.toNumber() * 1000;
  const n = Number(value);
  return Number.isFinite(n) ? (n > 1e12 ? n : n * 1000) : Date.now();
}

function getMessageText(message, extractMessageContent) {
  if (!message) return '';
  const content = extractMessageContent(message) || message;
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    content.buttonsResponseMessage?.selectedDisplayText ||
    content.listResponseMessage?.title ||
    content.templateButtonReplyMessage?.selectedDisplayText ||
    ''
  ).trim();
}

function resolveDisplayNames(msg, meta = {}) {
  const notifyName = msg.pushName || null;
  const contactName = meta.contactName || notifyName || null;
  const chatName = meta.chatName || null;

  let displayName = chatName || contactName || notifyName || null;
  if (displayName && looksLikePhone(displayName)) {
    displayName = contactName && !looksLikePhone(contactName) ? contactName : notifyName;
  }

  const senderJid = msg.key?.participant || msg.key?.remoteJid || '';
  const fromLabel = contactName || notifyName || stripJid(senderJid) || 'desconocido';

  return {
    from: fromLabel,
    chatName: displayName && !looksLikePhone(displayName) ? displayName : (chatName || fromLabel),
    contactName: contactName || notifyName || null,
  };
}

function addMessage(entry) {
  const existing = messages.find((m) => m.id === entry.id);
  if (existing) {
    Object.assign(existing, entry);
    broadcast({ type: 'message_update', message: existing });
    return existing;
  }

  messages.unshift(entry);
  if (messages.length > MAX_MESSAGES) messages.pop();
  broadcast({ type: 'message', message: entry });
  return entry;
}

function trimProcessedIds() {
  if (processedMessageIds.size <= 500) return;
  const keep = messages.slice(0, 200).map((m) => m.id);
  processedMessageIds.clear();
  keep.forEach((id) => processedMessageIds.add(id));
}

function isStatusJid(jid, isJidStatusBroadcast) {
  if (!jid) return false;
  if (typeof isJidStatusBroadcast === 'function' && isJidStatusBroadcast(jid)) return true;
  return String(jid).includes('status@broadcast');
}

function buildMessageEntry(msg, meta = {}, options = {}, helpers = {}) {
  const { extractMessageContent, getContentType } = helpers;
  const body = getMessageText(msg.message, extractMessageContent);
  const names = resolveDisplayNames(msg, meta);
  const remote = msg.key?.remoteJid || '';
  const type = getContentType?.(msg.message) || 'chat';

  return {
    id: msg.key?.id || `${Date.now()}-${Math.random()}`,
    remoteJid: stripJid(remote),
    from: names.from,
    chatName: names.chatName,
    contactName: names.contactName,
    body,
    type,
    timestamp: toMsTimestamp(msg.messageTimestamp),
    fromMe: false,
    unread: Boolean(options.unread),
  };
}

async function resolveChatName(remoteJid, isJidGroup) {
  if (!remoteJid || !sock) return null;
  if (chatNameCache.has(remoteJid)) return chatNameCache.get(remoteJid);

  if (typeof isJidGroup === 'function' && isJidGroup(remoteJid)) {
    try {
      const meta = await Promise.race([
        sock.groupMetadata(remoteJid),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
      ]);
      const subject = meta?.subject || null;
      if (subject) chatNameCache.set(remoteJid, subject);
      return subject;
    } catch {
      return null;
    }
  }

  return null;
}

async function enrichAndStore(msg, entry, helpers) {
  const remoteJid = msg.key?.remoteJid || '';
  const chatName = await resolveChatName(remoteJid, helpers.isJidGroup);
  const enriched = buildMessageEntry(
    msg,
    {
      chatName,
      contactName: msg.pushName || entry.contactName || null,
    },
    { unread: entry.unread },
    helpers
  );
  enriched.id = entry.id;
  enriched.timestamp = entry.timestamp;
  addMessage(enriched);
}

function broadcastMessagesSync() {
  broadcast({ type: 'messages_sync', messages: [...messages], ...getPublicState() });
}

async function handleIncomingMessage(msg, options = {}, helpers) {
  if (!msg?.message || msg.key?.fromMe) return;
  if (isStatusJid(msg.key?.remoteJid, helpers.isJidStatusBroadcast)) return;

  const body = getMessageText(msg.message, helpers.extractMessageContent);
  if (!body) return;

  const entry = buildMessageEntry(msg, { contactName: msg.pushName || null }, options, helpers);
  if (processedMessageIds.has(entry.id)) return;

  processedMessageIds.add(entry.id);
  trimProcessedIds();

  addMessage(entry);
  enrichAndStore(msg, entry, helpers).catch(() => {
    /* ya guardado con datos básicos */
  });
}

function bindMessageEvents(waSock, helpers) {
  waSock.ev.removeAllListeners('messages.upsert');
  waSock.ev.on('messages.upsert', ({ messages: incoming, type }) => {
    const unread = type === 'notify';
    for (const msg of incoming || []) {
      handleIncomingMessage(msg, { unread }, helpers);
    }
  });
}

async function pollUnreadMessages() {
  if (!sock || state.status !== 'ready') return;

  try {
    // Baileys entrega mensajes en vivo vía messages.upsert; este poller
    // solo sincroniza el estado público al front (equivalente al backup anterior).
    if (!initialUnreadSyncDone) {
      initialUnreadSyncDone = true;
      broadcastMessagesSync();
    }
  } catch (err) {
    console.warn('WhatsApp poll:', err.message);
  }
}

function startUnreadPoller() {
  stopUnreadPoller();
  unreadPollTimer = setInterval(pollUnreadMessages, UNREAD_POLL_MS);
  pollUnreadMessages();
}

function stopUnreadPoller() {
  if (unreadPollTimer) {
    clearInterval(unreadPollTimer);
    unreadPollTimer = null;
  }
}

async function clearAuthFolder() {
  const authPath = getAuthPath();
  try {
    await fs.rm(authPath, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  try {
    await fs.mkdir(authPath, { recursive: true });
  } catch {
    /* ignore */
  }
}

function endSocket() {
  if (!sock) return;
  try {
    sock.ev.removeAllListeners('connection.update');
    sock.ev.removeAllListeners('creds.update');
    sock.ev.removeAllListeners('messages.upsert');
  } catch {
    /* ignore */
  }
  try {
    sock.end(undefined);
  } catch {
    /* ignore */
  }
  sock = null;
  saveCreds = null;
}

function resetClientOnError(err) {
  state.status = 'error';
  state.error = err?.message || String(err);
  endSocket();
  initializing = false;
  reconnecting = false;
  stopUnreadPoller();
  console.error('WhatsApp error:', err);
  broadcast({ type: 'status', ...getPublicState() });
}

async function createClient() {
  if (sock || initializing) return;

  initializing = true;
  reconnecting = false;
  stopReconnect = false;
  state.status = 'initializing';
  state.error = null;
  state.qr = null;
  broadcast({ type: 'status', ...getPublicState() });

  try {
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      fetchLatestBaileysVersion,
      makeCacheableSignalKeyStore,
      Browsers,
      extractMessageContent,
      getContentType,
      isJidStatusBroadcast,
      isJidGroup,
    } = await loadBaileys();

    const helpers = { extractMessageContent, getContentType, isJidStatusBroadcast, isJidGroup };
    const authPath = getAuthPath();
    await fs.mkdir(authPath, { recursive: true });

    const { state: authState, saveCreds: persistCreds } = await useMultiFileAuthState(authPath);
    saveCreds = persistCreds;

    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch {
      version = undefined;
    }

    sock = makeWASocket({
      version,
      auth: {
        creds: authState.creds,
        keys: makeCacheableSignalKeyStore(authState.keys, logger),
      },
      logger,
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
    });

    sock.ev.on('creds.update', persistCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        state.status = 'qr';
        state.qr = await qrcode.toDataURL(qr);
        state.error = null;
        broadcast({ type: 'status', ...getPublicState() });
      }

      if (connection === 'connecting') {
        if (state.status !== 'qr') {
          state.status = authState.creds?.me ? 'authenticated' : 'initializing';
          broadcast({ type: 'status', ...getPublicState() });
        }
      }

      if (connection === 'open') {
        state.status = 'ready';
        state.qr = null;
        state.error = null;
        initialUnreadSyncDone = false;
        const user = sock.user || {};
        state.info = {
          pushname: user.name || user.verifiedName || user.notify || null,
          wid: stripJid(user.id || user.lid || ''),
        };
        bindMessageEvents(sock, helpers);
        startUnreadPoller();
        initializing = false;
        reconnecting = false;
        broadcast({ type: 'status', ...getPublicState() });
      }

      if (connection === 'close') {
        stopUnreadPoller();
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        const reason =
          lastDisconnect?.error?.message ||
          (loggedOut ? 'Sesión cerrada' : 'Desconectado');

        endSocket();
        initializing = false;

        if (stopReconnect || loggedOut) {
          state.status = loggedOut ? 'idle' : 'disconnected';
          state.error = loggedOut ? null : reason;
          state.info = null;
          state.qr = null;
          reconnecting = false;
          broadcast({ type: 'status', ...getPublicState() });
          return;
        }

        state.status = 'disconnected';
        state.error = reason;
        state.info = null;
        broadcast({ type: 'status', ...getPublicState() });

        if (!reconnecting) {
          reconnecting = true;
          setTimeout(() => {
            reconnecting = false;
            if (!stopReconnect && !sock && !initializing) {
              createClient().catch((err) => resetClientOnError(err));
            }
          }, 2000);
        }
      }
    });

    bindMessageEvents(sock, helpers);
    initializing = false;
  } catch (err) {
    resetClientOnError(err);
  }
}

function attachSse(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  sseClients.add(res);
  res.write(`data: ${JSON.stringify({ type: 'init', ...getPublicState(), messages })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
}

async function startSession() {
  if (sock || initializing) {
    return getPublicState();
  }
  stopReconnect = false;
  await createClient();
  return getPublicState();
}

async function logoutSession() {
  stopReconnect = true;
  stopUnreadPoller();

  if (sock) {
    try {
      await sock.logout();
    } catch {
      /* ignore */
    }
    endSocket();
  }

  await clearAuthFolder();
  chatNameCache.clear();

  initializing = false;
  reconnecting = false;
  state.status = 'idle';
  state.qr = null;
  state.error = null;
  state.info = null;
  messages.length = 0;
  processedMessageIds.clear();
  initialUnreadSyncDone = false;
  broadcast({ type: 'status', ...getPublicState() });
  return getPublicState();
}

async function destroyWhatsApp() {
  stopReconnect = true;
  stopUnreadPoller();
  sseClients.forEach((res) => {
    try {
      res.end();
    } catch {
      /* ignore */
    }
  });
  sseClients.clear();
  endSocket();
  initializing = false;
  reconnecting = false;
}

function getMessages() {
  return [...messages];
}

async function refreshSession() {
  if (!sock || state.status !== 'ready') {
    return getPublicState();
  }

  const helpers = {
    extractMessageContent: (await loadBaileys()).extractMessageContent,
    getContentType: (await loadBaileys()).getContentType,
    isJidStatusBroadcast: (await loadBaileys()).isJidStatusBroadcast,
    isJidGroup: (await loadBaileys()).isJidGroup,
  };
  bindMessageEvents(sock, helpers);
  await pollUnreadMessages();
  broadcastMessagesSync();
  broadcast({ type: 'status', ...getPublicState() });
  return getPublicState();
}

module.exports = {
  attachSse,
  startSession,
  logoutSession,
  destroyWhatsApp,
  getPublicState,
  getMessages,
  refreshSession,
};
