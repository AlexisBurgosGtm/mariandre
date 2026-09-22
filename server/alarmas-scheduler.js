const sseClients = new Set();

function pad2(n) {
  return String(n).padStart(2, '0');
}

function getAlarmTimestamp(alarma) {
  return new Date(`${alarma.fecha}T${pad2(alarma.hora)}:${pad2(alarma.minuto)}:00`).getTime();
}

function broadcastAlarma(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  sseClients.forEach((res) => {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  });
}

function attachAlarmaSse(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  sseClients.add(res);
  res.write(`data: ${JSON.stringify({ type: 'init', ok: true })}\n\n`);

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

async function checkDueAlarmas(readAlarmas, writeAlarmas) {
  const alarmas = await readAlarmas();
  const now = Date.now();
  let changed = false;
  const fired = [];

  for (const alarma of alarmas) {
    if (alarma.disparada) continue;
    const ts = getAlarmTimestamp(alarma);
    if (!Number.isFinite(ts)) continue;
    if (now >= ts) {
      alarma.disparada = true;
      alarma.disparadaEn = new Date().toISOString();
      fired.push({ ...alarma });
      changed = true;
    }
  }

  if (changed) {
    await writeAlarmas(alarmas);
    for (const alarma of fired) {
      broadcastAlarma({ type: 'alarm_fired', alarma });
    }
  }

  return fired;
}

function startAlarmaScheduler(readAlarmas, writeAlarmas, { intervalMs = 15000 } = {}) {
  checkDueAlarmas(readAlarmas, writeAlarmas).catch((err) => {
    console.warn('Alarmas scheduler:', err.message);
  });

  return setInterval(() => {
    checkDueAlarmas(readAlarmas, writeAlarmas).catch((err) => {
      console.warn('Alarmas scheduler:', err.message);
    });
  }, intervalMs);
}

module.exports = {
  attachAlarmaSse,
  broadcastAlarma,
  checkDueAlarmas,
  startAlarmaScheduler,
};
