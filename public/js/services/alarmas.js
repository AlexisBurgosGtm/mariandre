import { api } from '../api.js';
import { showToast } from '../utils.js';
import { speak } from '../tts.js';

const timers = new Map();
const firing = new Set();
let checkInterval = null;
let eventSource = null;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function getAlarmTimestamp(alarma) {
  return new Date(`${alarma.fecha}T${pad2(alarma.hora)}:${pad2(alarma.minuto)}:00`).getTime();
}

function clearTimers() {
  timers.forEach((timerId) => clearTimeout(timerId));
  timers.clear();
}

async function ensureNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

function showPushNotification(alarma) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    const notification = new Notification('Alarma — MariAndre', {
      body: alarma.descripcion,
      icon: '/logo.png',
      tag: `alarma-${alarma.id}`,
      requireInteraction: true,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    /* ignore */
  }
}

async function triggerAlarma(alarma, { fromServer = false } = {}) {
  if (firing.has(alarma.id)) return;
  firing.add(alarma.id);

  const text = `ALARMA: ${alarma.descripcion}`;
  showToast(text, 'warning');
  showPushNotification(alarma);
  speak(text);

  try {
    if (!fromServer && !alarma.disparada) {
      await api.dispararAlarma(alarma.id);
    }
    await refreshAlarmas();
    window.__reloadAlarmas?.();
  } catch {
    /* ya disparada o eliminada */
  } finally {
    firing.delete(alarma.id);
  }
}

function scheduleAlarma(alarma) {
  if (alarma.disparada || timers.has(alarma.id)) return;

  const delay = getAlarmTimestamp(alarma) - Date.now();
  if (delay <= 0) {
    triggerAlarma(alarma);
    return;
  }

  const maxDelay = 2147483647;
  if (delay > maxDelay) return;

  const timerId = setTimeout(() => {
    timers.delete(alarma.id);
    triggerAlarma(alarma);
  }, delay);
  timers.set(alarma.id, timerId);
}

function scheduleAlarmas(alarmas) {
  clearTimers();
  alarmas
    .filter((a) => !a.disparada)
    .forEach(scheduleAlarma);
}

function connectAlarmEvents() {
  if (eventSource) return eventSource;

  eventSource = new EventSource('/api/alarmas/events');

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'alarm_fired' && data.alarma) {
        triggerAlarma(data.alarma, { fromServer: true });
      }
    } catch {
      /* ignore */
    }
  };

  eventSource.onerror = () => {
    eventSource?.close();
    eventSource = null;
    setTimeout(connectAlarmEvents, 3000);
  };

  return eventSource;
}

export async function refreshAlarmas() {
  try {
    const alarmas = await api.getAlarmas();
    scheduleAlarmas(alarmas);
    return alarmas;
  } catch {
    return [];
  }
}

export function initAlarmas() {
  ensureNotificationPermission();
  connectAlarmEvents();
  refreshAlarmas();
  if (!checkInterval) {
    checkInterval = setInterval(refreshAlarmas, 30000);
  }
}
