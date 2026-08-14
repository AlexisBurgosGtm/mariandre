/**
 * Cliente mínimo para la API pública de Render.com
 * Docs: https://api-docs.render.com
 *
 * Nota: el Billing "Free instance hours" NO está expuesto en la API pública.
 * Para plan free las métricas suelen venir vacías; nunca inventamos horas
 * asumiendo que el servicio estuvo encendido todo el mes.
 */
const RENDER_API_BASE = 'https://api.render.com/v1';
const FREE_INSTANCE_HOURS_LIMIT = 750;

async function renderFetch(apiToken, path, query = {}, options = {}) {
  const token = String(apiToken || '').trim();
  if (!token) throw new Error('APIKEY de Render no configurada');

  const url = new URL(`${RENDER_API_BASE}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '') continue;
    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(key, String(v)));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  const method = String(options.method || 'GET').toUpperCase();
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const msg = data?.message || data?.error || data?.msg || `Render API ${response.status}`;
    throw new Error(typeof msg === 'string' ? msg : `Render API ${response.status}`);
  }

  return data;
}

async function listOwners(apiToken) {
  const rows = await renderFetch(apiToken, '/owners', { limit: 100 });
  return (rows || []).map((row) => row.owner || row).filter(Boolean);
}

async function listServices(apiToken, { ownerId } = {}) {
  const query = { limit: 100 };
  if (ownerId) query.ownerId = ownerId;
  const rows = await renderFetch(apiToken, '/services', query);
  return (rows || []).map((row) => row.service || row).filter(Boolean);
}

function getServicePlan(service) {
  return service?.serviceDetails?.plan || null;
}

function getServiceUrl(service) {
  return service?.serviceDetails?.url || service?.dashboardUrl || '';
}

function monthBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  return { start, end: now };
}

function toIso(date) {
  return new Date(date).toISOString();
}

/**
 * Integra instance-count: solo suma tiempo cuando hay instancias > 0.
 * Usa el intervalo hasta el siguiente punto (o resolutionSeconds).
 */
function integrateInstanceHours(series = [], resolutionSeconds = 3600) {
  if (!Array.isArray(series) || !series.length) return 0;

  const sorted = [...series].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  let hours = 0;
  const defaultStepMs = Math.max(30, Number(resolutionSeconds) || 3600) * 1000;

  for (let i = 0; i < sorted.length; i++) {
    const point = sorted[i];
    const value = Number(point.value || 0);
    if (!(value > 0)) continue;

    const t0 = new Date(point.timestamp).getTime();
    if (!Number.isFinite(t0)) continue;

    let stepMs = defaultStepMs;
    if (i < sorted.length - 1) {
      const t1 = new Date(sorted[i + 1].timestamp).getTime();
      if (Number.isFinite(t1) && t1 > t0) stepMs = t1 - t0;
    }

    // Cap por si vienen gaps enormes (evita saltos absurdos)
    stepMs = Math.min(stepMs, defaultStepMs * 2);
    hours += value * (stepMs / 3600000);
  }

  return hours;
}

function extractMetricValues(data) {
  const buckets = Array.isArray(data) ? data : (data?.data || []);
  const values = [];
  for (const bucket of buckets) {
    const pts = bucket.values || bucket.datapoints || [];
    for (const pt of pts) {
      values.push({
        timestamp: pt.timestamp || pt.time,
        value: Number(pt.value ?? pt[1] ?? 0),
      });
    }
  }
  return values;
}

async function getInstanceCountSeries(apiToken, resourceId, start, end, resolutionSeconds = 3600) {
  const data = await renderFetch(apiToken, '/metrics/instance-count', {
    resource: resourceId,
    startTime: toIso(start),
    endTime: toIso(end),
    resolutionSeconds,
  });
  return extractMetricValues(data);
}

async function listServiceEvents(apiToken, serviceId, { start, end, types = [] } = {}) {
  const events = [];
  let cursor = null;

  do {
    const query = {
      limit: 100,
      startTime: toIso(start),
      endTime: toIso(end),
    };
    if (cursor) query.cursor = cursor;
    // La API acepta un solo type por request; si hay varios, pedimos sin filtro y filtramos
    if (types.length === 1) query.type = types[0];

    const rows = await renderFetch(apiToken, `/services/${serviceId}/events`, query);
    const batch = Array.isArray(rows) ? rows : [];
    for (const row of batch) {
      const event = row.event || row;
      if (!event) continue;
      if (types.length > 1 && !types.includes(event.type)) continue;
      events.push(event);
    }

    cursor = batch.length ? (batch[batch.length - 1].cursor || null) : null;
    if (batch.length < 100) break;
  } while (cursor);

  return events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

const RUN_START_TYPES = new Set([
  'server_available',
  'service_resumed',
]);
const RUN_STOP_TYPES = new Set([
  'service_suspended',
  'server_failed',
  'server_hardware_failure',
]);

/**
 * Estima horas en ejecución a partir de eventos resume/suspend del periodo.
 * Si no hay eventos de ciclo de vida en el mes, retorna null (desconocido).
 */
function estimateHoursFromEvents(events, start, end) {
  const relevant = (events || []).filter((e) => RUN_START_TYPES.has(e.type) || RUN_STOP_TYPES.has(e.type));
  if (!relevant.length) return null;

  const startMs = start.getTime();
  const endMs = end.getTime();
  let running = false;
  let openedAt = null;
  let hours = 0;

  for (const event of relevant) {
    const t = new Date(event.timestamp).getTime();
    if (!Number.isFinite(t) || t < startMs || t > endMs) continue;

    if (RUN_START_TYPES.has(event.type)) {
      if (!running) {
        running = true;
        openedAt = Math.max(t, startMs);
      }
    } else if (RUN_STOP_TYPES.has(event.type)) {
      if (running && openedAt != null) {
        hours += Math.max(0, (t - openedAt) / 3600000);
      }
      running = false;
      openedAt = null;
    }
  }

  if (running && openedAt != null) {
    hours += Math.max(0, (endMs - openedAt) / 3600000);
  }

  return hours;
}

async function estimateServiceHours(apiToken, service, start, end) {
  const resolutionSeconds = 3600;

  // 1) Métricas (funcionan mejor en planes pagos; free suele devolver [])
  try {
    const series = await getInstanceCountSeries(apiToken, service.id, start, end, resolutionSeconds);
    if (series.length) {
      return {
        hours: integrateInstanceHours(series, resolutionSeconds),
        method: 'metrics',
      };
    }
  } catch {
    // sigue con eventos
  }

  // 2) Eventos de ciclo de vida en el periodo
  try {
    const events = await listServiceEvents(apiToken, service.id, {
      start,
      end,
      types: [
        'server_available',
        'service_resumed',
        'service_suspended',
        'server_failed',
        'server_hardware_failure',
      ],
    });
    const fromEvents = estimateHoursFromEvents(events, start, end);
    if (fromEvents != null) {
      return { hours: fromEvents, method: 'events' };
    }
  } catch {
    // sin datos
  }

  // 3) Sin inventar: free idle / sin métricas = 0 horas medibles
  return { hours: 0, method: 'unavailable' };
}

/**
 * Consulta uso de Free instance hours del mes UTC actual.
 */
async function getAccountUsageHours(apiToken, { ownerId } = {}) {
  const owners = await listOwners(apiToken);
  const owner = ownerId
    ? owners.find((o) => o.id === ownerId) || null
    : owners[0] || null;

  const services = await listServices(apiToken, { ownerId: owner?.id || ownerId });
  const { start, end } = monthBounds();

  const serviceUsages = [];
  let freeHoursUsed = 0;
  let totalInstanceHours = 0;
  let measuredServices = 0;
  let unavailableServices = 0;

  for (const service of services) {
    const plan = getServicePlan(service);
    const isFreeWeb = plan === 'free' && service.type === 'web_service';

    // Solo los web services Free consumen Free instance hours
    if (!isFreeWeb && plan !== 'free') {
      serviceUsages.push({
        id: service.id,
        name: service.name,
        type: service.type,
        plan,
        url: getServiceUrl(service),
        suspended: service.suspended,
        hours: 0,
        method: 'skipped',
        countsTowardFreeHours: false,
      });
      continue;
    }

    const { hours, method } = await estimateServiceHours(apiToken, service, start, end);
    const rounded = Math.round(hours * 100) / 100;

    if (method === 'unavailable') unavailableServices += 1;
    else measuredServices += 1;

    if (plan === 'free' && service.type === 'web_service') {
      freeHoursUsed += rounded;
    }
    totalInstanceHours += rounded;

    serviceUsages.push({
      id: service.id,
      name: service.name,
      type: service.type,
      plan,
      url: getServiceUrl(service),
      suspended: service.suspended,
      hours: rounded,
      method,
      countsTowardFreeHours: plan === 'free' && service.type === 'web_service',
    });
  }

  freeHoursUsed = Math.round(freeHoursUsed * 100) / 100;
  totalInstanceHours = Math.round(totalInstanceHours * 100) / 100;

  const noteParts = [
    'Free instance hours del Billing de Render no están en la API pública.',
    'Se estiman solo con métricas/eventos del mes UTC; servicios Free idle (spin-down) no suman.',
  ];
  if (unavailableServices > 0) {
    noteParts.push(
      `${unavailableServices} servicio(s) Free sin métricas/eventos medibles en el periodo (se cuentan como 0). El valor exacto está en Dashboard → Billing.`
    );
  }

  return {
    source: 'render-api',
    note: noteParts.join(' '),
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
    owner: owner
      ? { id: owner.id, name: owner.name, email: owner.email, type: owner.type }
      : null,
    owners: owners.map((o) => ({ id: o.id, name: o.name, email: o.email, type: o.type })),
    freeInstanceHours: {
      used: freeHoursUsed,
      limit: FREE_INSTANCE_HOURS_LIMIT,
      remaining: Math.max(0, Math.round((FREE_INSTANCE_HOURS_LIMIT - freeHoursUsed) * 100) / 100),
      percentUsed: Math.min(100, Math.round((freeHoursUsed / FREE_INSTANCE_HOURS_LIMIT) * 1000) / 10),
    },
    totalInstanceHours,
    measurement: {
      measuredServices,
      unavailableServices,
    },
    services: serviceUsages,
  };
}

async function deleteService(apiToken, serviceId) {
  const id = String(serviceId || '').trim();
  if (!id) throw new Error('SERVICEID de Render requerido');
  await renderFetch(apiToken, `/services/${encodeURIComponent(id)}`, {}, { method: 'DELETE' });
  return { ok: true };
}

/** Solo web services (webapps) con URL y id. */
function listWebApps(services = []) {
  return (services || [])
    .filter((s) => s && s.type === 'web_service' && s.id)
    .map((s) => ({
      serviceId: String(s.id),
      name: s.name || '',
      url: getServiceUrl(s) || '',
      plan: getServicePlan(s),
      suspended: s.suspended,
    }));
}

module.exports = {
  FREE_INSTANCE_HOURS_LIMIT,
  listOwners,
  listServices,
  listWebApps,
  deleteService,
  getAccountUsageHours,
  getServicePlan,
  getServiceUrl,
};
