/**
 * Comandos de voz: escucha continua solo para la palabra de activación
 * "Oye Mariandre". Después de eso, una ventana breve acepta el comando,
 * llama el endpoint y lee el resultado.
 */
import { api } from '../api.js';
import { speak, isTtsSpeaking } from '../tts.js';
import { showToast } from '../utils.js';

const STORAGE_KEY = 'mariandre-voz-on';
const COMMAND_WINDOW_MS = 8000;
const WAKE_ALIASES = [
  'oye mariandre',
  'oye maria andre',
  'oye mari andre',
  'hey mariandre',
  'hey maria andre',
  'ok mariandre',
  'hola mariandre',
];

let enabled = false;
let mode = 'wake';
let recognition = null;
let commandTimer = null;
let comandos = [];
let busy = false;
let restartTimer = null;

function RecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function vozSoportada() {
  return Boolean(RecognitionCtor());
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitWake(text) {
  const n = normalize(text);
  if (!n) return { found: false, rest: '' };
  for (const alias of WAKE_ALIASES) {
    const i = n.indexOf(alias);
    if (i >= 0) return { found: true, rest: stripNameTail(n.slice(i + alias.length).trim()) };
  }
  if (/\b(oye|hey|ei|ey|ok|hola)\b/.test(n) && /\bmari/.test(n)) {
    const idx = n.search(/\bmari\w*/);
    const afterName = n.slice(idx).replace(/^mari\w*/, '').trim();
    return { found: true, rest: stripNameTail(afterName) };
  }
  return { found: false, rest: '' };
}

function stripNameTail(rest) {
  return String(rest || '')
    .replace(/^(andre|andrea|andres|dre)\b\s*/i, '')
    .trim();
}

function wordsCovered(frase, heard) {
  const words = frase.split(' ').filter((w) => w.length > 2);
  if (!words.length) return false;
  const hits = words.filter((w) => heard.includes(w)).length;
  return hits / words.length >= 0.7;
}

function matchCommand(heard) {
  const h = normalize(heard);
  if (!h || h.length < 3) return null;
  let best = null;
  let bestScore = 0;
  for (const comando of comandos) {
    if (comando.activo === false) continue;
    const frase = normalize(comando.frase);
    if (!frase) continue;
    const included = h.includes(frase);
    const reverse = frase.includes(h) && h.length >= Math.min(8, Math.ceil(frase.length * 0.55));
    const covered = wordsCovered(frase, h);
    if (!included && !reverse && !covered) continue;
    const score = included ? frase.length + 20 : covered ? frase.length + 5 : h.length;
    if (score > bestScore) {
      best = comando;
      bestScore = score;
    }
  }
  return best;
}

function setBadge(state) {
  const btn = document.getElementById('btn-voz');
  if (!btn) return;
  btn.classList.remove('is-off', 'is-on', 'is-listen');
  const icon = btn.querySelector('.ma-voz-icon');
  if (state === 'off') {
    btn.classList.add('is-off');
    btn.setAttribute('aria-pressed', 'false');
    btn.title = 'Voz apagada. Clic para activar.';
    if (icon) icon.className = 'fa-solid fa-microphone-slash ma-voz-icon';
  } else if (state === 'listen') {
    btn.classList.add('is-listen');
    btn.setAttribute('aria-pressed', 'true');
    btn.title = 'Te escucho… di el comando.';
    if (icon) icon.className = 'fa-solid fa-microphone ma-voz-icon';
  } else {
    btn.classList.add('is-on');
    btn.setAttribute('aria-pressed', 'true');
    btn.title = 'Voz activa. Di: Oye Mariandre';
    if (icon) icon.className = 'fa-solid fa-microphone ma-voz-icon';
  }
}

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.06;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    /* ignore */
  }
}

function clearCommandWindow() {
  if (commandTimer) {
    clearTimeout(commandTimer);
    commandTimer = null;
  }
}

function enterWakeMode() {
  mode = 'wake';
  clearCommandWindow();
  if (enabled) setBadge('on');
}

function enterCommandMode() {
  mode = 'command';
  setBadge('listen');
  beep();
  clearCommandWindow();
  commandTimer = setTimeout(() => {
    if (mode !== 'command') return;
    showToast('No escuché un comando. Di de nuevo: Oye Mariandre', 'info');
    enterWakeMode();
  }, COMMAND_WINDOW_MS);
}

async function reloadComandos() {
  try {
    const data = await api.getComandosVoz();
    comandos = Array.isArray(data) ? data : [];
  } catch {
    /* se reintenta en el siguiente ciclo */
  }
}

async function runCommand(comando) {
  if (!comando || busy) return;
  busy = true;
  stopRecognition();
  enterWakeMode();
  showToast(`Comando: ${comando.frase}`, 'info');
  try {
    const result = await api.ejecutarComandoVoz(comando.id);
    const texto = String(result?.texto || '').trim();
    if (texto) await speak(texto);
    else showToast('El endpoint no devolvió texto para leer', 'error');
  } catch (err) {
    const msg = err.message || 'No se pudo ejecutar el comando';
    showToast(msg, 'error');
    await speak(msg);
  } finally {
    busy = false;
    if (enabled) {
      enterWakeMode();
      startRecognition();
    }
  }
}

function handleTranscript(text, isFinal) {
  if (!enabled || busy || isTtsSpeaking()) return;
  const wake = splitWake(text);
  if (mode === 'wake') {
    if (!wake.found) return;
    if (wake.rest) {
      const comando = matchCommand(wake.rest);
      if (comando) {
        runCommand(comando);
        return;
      }
    }
    if (isFinal) enterCommandMode();
    else setBadge('listen');
    return;
  }
  if (!isFinal) return;
  const heard = wake.found ? wake.rest || text : text;
  const comando = matchCommand(heard);
  if (comando) {
    runCommand(comando);
    return;
  }
  if (normalize(heard).length >= 3) {
    showToast('No reconozco ese comando', 'error');
    speak('No reconozco ese comando');
    enterWakeMode();
  }
}

function stopRecognition() {
  clearTimeout(restartTimer);
  restartTimer = null;
  if (!recognition) return;
  try {
    recognition.onend = null;
    recognition.stop();
  } catch {
    /* already stopped */
  }
  recognition = null;
}

function startRecognition() {
  const Ctor = RecognitionCtor();
  if (!Ctor || !enabled) return;
  stopRecognition();
  const rec = new Ctor();
  recognition = rec;
  rec.lang = 'es-GT';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 3;

  rec.onresult = (event) => {
    let chunk = '';
    let finalChunk = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const alt = result[0]?.transcript || '';
      chunk += ` ${alt}`;
      if (result.isFinal) finalChunk += ` ${alt}`;
    }
    if (finalChunk.trim()) handleTranscript(finalChunk, true);
    else if (chunk.trim()) handleTranscript(chunk, false);
  };

  rec.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      showToast('Permiso de micrófono denegado', 'error');
      setEnabled(false);
    }
  };

  rec.onend = () => {
    if (recognition !== rec || !enabled || busy || isTtsSpeaking()) return;
    restartTimer = setTimeout(() => {
      if (enabled && !busy) startRecognition();
    }, 250);
  };

  try {
    rec.start();
  } catch {
    /* start while already started */
  }
}

export function isVozEnabled() {
  return enabled;
}

export function setEnabled(next) {
  enabled = Boolean(next);
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
  clearCommandWindow();
  mode = 'wake';
  if (!enabled) {
    stopRecognition();
    setBadge('off');
    return;
  }
  if (!vozSoportada()) {
    enabled = false;
    setBadge('off');
    showToast('Este navegador no soporta reconocimiento de voz. Usa Chrome.', 'error');
    return;
  }
  setBadge('on');
  startRecognition();
}

function bindBadge() {
  const btn = document.getElementById('btn-voz');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => {
    if (!vozSoportada()) {
      showToast('Este navegador no soporta reconocimiento de voz. Usa Chrome.', 'error');
      return;
    }
    setEnabled(!enabled);
    showToast(enabled ? 'Voz activada. Di: Oye Mariandre' : 'Voz apagada', enabled ? 'success' : 'info');
  });
}

export async function initVoz() {
  bindBadge();
  await reloadComandos();
  setBadge('off');
  window.addEventListener('mariandre:comandos-voz-updated', () => {
    reloadComandos();
  });
  setInterval(reloadComandos, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopRecognition();
    else if (enabled && !busy) startRecognition();
  });
  try {
    if (localStorage.getItem(STORAGE_KEY) === '1') setEnabled(true);
  } catch {
    /* ignore */
  }
}
