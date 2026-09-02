const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const sql = require('mssql');
const mysql = require('mysql2/promise');
const whatsapp = require('./whatsapp');
const hostingDb = require('./hostingDb');
const renderApi = require('./renderApi');
const appPaths = require('./appPaths');
const licenseGenerator = require('./license-generator');
const licenseGeneratorFserp = require('./license-generator-fserp');

const PORT = Number(process.env.PORT) || 9006;

let server = null;

async function readConexiones() {
  try {
    const data = await fs.readFile(appPaths.conexionesPath(), 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(appPaths.conexionesPath(), '[]', 'utf-8');
      return [];
    }
    throw err;
  }
}

async function writeConexiones(conexiones) {
  await fs.writeFile(appPaths.conexionesPath(), JSON.stringify(conexiones, null, 2), 'utf-8');
}

async function readMantenimiento() {
  try {
    const data = await fs.readFile(appPaths.mantenimientoPath(), 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(appPaths.mantenimientoPath(), '[]', 'utf-8');
      return [];
    }
    throw err;
  }
}

async function writeMantenimiento(comandos) {
  await fs.writeFile(appPaths.mantenimientoPath(), JSON.stringify(comandos, null, 2), 'utf-8');
}

async function readAlarmas() {
  try {
    const data = await fs.readFile(appPaths.alarmasPath(), 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(appPaths.alarmasPath(), '[]', 'utf-8');
      return [];
    }
    throw err;
  }
}

async function writeAlarmas(alarmas) {
  await fs.writeFile(appPaths.alarmasPath(), JSON.stringify(alarmas, null, 2), 'utf-8');
}

async function readLicenseTemplates() {
  try {
    const data = await fs.readFile(appPaths.licenseTemplatesPath(), 'utf-8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(appPaths.licenseTemplatesPath(), '[]', 'utf-8');
      return [];
    }
    throw err;
  }
}

async function writeLicenseTemplates(templates) {
  await fs.writeFile(appPaths.licenseTemplatesPath(), JSON.stringify(templates, null, 2), 'utf-8');
}

async function readLicenseTemplatesFserp() {
  try {
    const data = await fs.readFile(appPaths.licenseTemplatesFserpPath(), 'utf-8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(appPaths.licenseTemplatesFserpPath(), '[]', 'utf-8');
      return [];
    }
    throw err;
  }
}

async function writeLicenseTemplatesFserp(templates) {
  await fs.writeFile(appPaths.licenseTemplatesFserpPath(), JSON.stringify(templates, null, 2), 'utf-8');
}

function parseAlarmaTime(body) {
  const hora = Number(body.hora);
  const minuto = Number(body.minuto);
  if (!body.fecha?.trim()) {
    throw new Error('La fecha es obligatoria');
  }
  if (!Number.isInteger(hora) || hora < 0 || hora > 23) {
    throw new Error('La hora debe estar entre 0 y 23');
  }
  if (!Number.isInteger(minuto) || minuto < 0 || minuto > 59) {
    throw new Error('El minuto debe estar entre 0 y 59');
  }
  if (!body.descripcion?.trim()) {
    throw new Error('La descripción es obligatoria');
  }
  return {
    fecha: body.fecha.trim(),
    hora,
    minuto,
    descripcion: body.descripcion.trim(),
  };
}

async function readServiciosOnline() {
  try {
    const data = await fs.readFile(appPaths.serviciosOnlinePath(), 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(appPaths.serviciosOnlinePath(), '[]', 'utf-8');
      return [];
    }
    throw err;
  }
}

async function writeServiciosOnline(servicios) {
  await fs.writeFile(appPaths.serviciosOnlinePath(), JSON.stringify(servicios, null, 2), 'utf-8');
}

async function getServiciosOnlineFromHosting() {
  const { conexion } = await resolveHostingConexion();
  let servicios = await hostingDb.listServiciosOnline(conexion);

  if (!servicios.length) {
    const legacy = await readServiciosOnline();
    if (legacy.length) {
      for (const item of legacy) {
        await hostingDb.createServicioOnline(conexion, {
          nombre: item.nombre,
          url: normalizeServicioUrl(item.url),
          pingIntervalMinutes: normalizePingInterval(item.pingIntervalMinutes),
        });
      }
      servicios = await hostingDb.listServiciosOnline(conexion);
      await writeServiciosOnline([]);
    }
  }

  return servicios;
}

function normalizeServicioUrl(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) throw new Error('La URL no puede estar vacía');
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function normalizePingInterval(minutes) {
  const value = parseInt(minutes, 10);
  if (Number.isNaN(value) || value < 5 || value > 120 || value % 5 !== 0) {
    return 5;
  }
  return value;
}

async function pingServicioUrl(url) {
  const targetUrl = normalizeServicioUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'MariAndre/1.0' },
    });

    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        mensaje: `Servicio disponible (${response.status})`,
      };
    }

    return {
      ok: false,
      status: response.status,
      mensaje: `Error HTTP ${response.status}`,
    };
  } catch (err) {
    const message = err.name === 'AbortError'
      ? 'Tiempo de espera agotado'
      : (err.message || 'No se pudo contactar el servicio');
    return { ok: false, mensaje: message };
  } finally {
    clearTimeout(timeout);
  }
}

const DEFAULT_CONFIG = {
  whatsapp: {
    ttsAnnounceSenderOnly: false,
    omittedWords: '',
  },
  conexiones: {
    autoPing: true,
  },
  hosting: {
    principalConexionId: null,
  },
  mercadosEfectivos: {
    ventasConexionId: null,
  },
};

function mergeConfig(data) {
  return {
    ...DEFAULT_CONFIG,
    ...data,
    whatsapp: { ...DEFAULT_CONFIG.whatsapp, ...(data?.whatsapp || {}) },
    conexiones: { ...DEFAULT_CONFIG.conexiones, ...(data?.conexiones || {}) },
    hosting: { ...DEFAULT_CONFIG.hosting, ...(data?.hosting || {}) },
    mercadosEfectivos: { ...DEFAULT_CONFIG.mercadosEfectivos, ...(data?.mercadosEfectivos || {}) },
  };
}

async function resolveHostingConexion() {
  const config = await readConfig();
  const conexionId = config.hosting?.principalConexionId;
  if (!conexionId) {
    throw new Error('Configura el Hosting principal en Configuraciones');
  }

  const conexiones = await readConexiones();
  const conexion = conexiones.find((c) => String(c.id) === String(conexionId));
  if (!conexion) {
    throw new Error('La conexión de Hosting principal no existe');
  }

  return { conexion, config };
}

async function readConfig() {
  try {
    const data = await fs.readFile(appPaths.configPath(), 'utf-8');
    return mergeConfig(JSON.parse(data));
  } catch (err) {
    if (err.code === 'ENOENT') {
      await writeConfig(DEFAULT_CONFIG);
      return { ...DEFAULT_CONFIG };
    }
    throw err;
  }
}

async function writeConfig(config) {
  await fs.writeFile(appPaths.configPath(), JSON.stringify(mergeConfig(config), null, 2), 'utf-8');
}

function generateId(items) {
  const ids = items.map((c) => parseInt(c.id, 10)).filter((n) => !Number.isNaN(n));
  return String(ids.length ? Math.max(...ids) + 1 : 1);
}

function getMssqlConfig(conexion) {
  return {
    server: conexion.host,
    port: conexion.puerto || 1433,
    user: conexion.usuario,
    password: conexion.password,
    database: conexion.baseDatos,
    options: {
      encrypt: conexion.opciones?.encrypt ?? false,
      trustServerCertificate: conexion.opciones?.trustServerCertificate ?? true,
    },
    connectionTimeout: 10000,
    requestTimeout: 30000,
  };
}

function getMysqlConfig(conexion) {
  return {
    host: conexion.host,
    port: conexion.puerto || 3306,
    user: conexion.usuario,
    password: conexion.password,
    database: conexion.baseDatos,
    connectTimeout: 10000,
  };
}

async function getMssqlDatabaseSizeMb(pool, databaseName) {
  try {
    const result = await pool.request().query(`
      SELECT CAST(SUM(CAST(size AS BIGINT)) * 8.0 / 1024 AS DECIMAL(18, 2)) AS sizeMB
      FROM sys.database_files
    `);
    const sizeMB = result.recordset?.[0]?.sizeMB;
    if (sizeMB != null && !Number.isNaN(Number(sizeMB))) {
      return Number(sizeMB);
    }
  } catch {
    /* probar alternativa */
  }

  if (databaseName) {
    try {
      const result = await pool.request()
        .input('dbName', sql.NVarChar, databaseName)
        .query(`
          SELECT CAST(SUM(CAST(size AS BIGINT)) * 8.0 / 1024 AS DECIMAL(18, 2)) AS sizeMB
          FROM sys.master_files
          WHERE database_id = DB_ID(@dbName)
        `);
      const sizeMB = result.recordset?.[0]?.sizeMB;
      if (sizeMB != null && !Number.isNaN(Number(sizeMB))) {
        return Number(sizeMB);
      }
    } catch {
      /* sin tamaño */
    }
  }

  return null;
}

async function getMysqlDatabaseSizeMb(connection, database) {
  const [rows] = await connection.query(
    `SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS sizeMB
     FROM information_schema.tables
     WHERE table_schema = ?`,
    [database]
  );
  const row = rows?.[0];
  return row?.sizeMB != null ? Number(row.sizeMB) : null;
}

async function testMssql(conexion) {
  const pool = await sql.connect(getMssqlConfig(conexion));
  await pool.request().query('SELECT 1 AS ok');
  let databaseSizeMb = null;
  try {
    databaseSizeMb = await getMssqlDatabaseSizeMb(pool, conexion.baseDatos);
  } catch {
    /* ignorar error de tamaño */
  }
  await pool.close();
  return { ok: true, mensaje: 'Conexión SQL Server exitosa', databaseSizeMb };
}

async function testMysql(conexion) {
  const connection = await mysql.createConnection(getMysqlConfig(conexion));
  await connection.query('SELECT 1 AS ok');
  let databaseSizeMb = null;
  try {
    databaseSizeMb = await getMysqlDatabaseSizeMb(connection, conexion.baseDatos);
  } catch {
    /* ignorar error de tamaño */
  }
  await connection.end();
  return { ok: true, mensaje: 'Conexión MySQL exitosa', databaseSizeMb };
}

async function testConexion(conexion) {
  if (conexion.tipo === 'mssql') {
    return testMssql(conexion);
  }
  if (conexion.tipo === 'mysql') {
    return testMysql(conexion);
  }
  throw new Error(`Tipo de base de datos no soportado: ${conexion.tipo}`);
}

async function executeQuery(conexion, query) {
  if (conexion.tipo === 'mssql') {
    const pool = await sql.connect(getMssqlConfig(conexion));
    const result = await pool.request().query(query);
    await pool.close();
    const rows = result.recordset || [];
    return {
      ok: true,
      rowCount: rows.length,
      rowsAffected: result.rowsAffected?.[0] ?? rows.length,
      rows: rows.slice(0, 100),
      mensaje: `Query ejecutada en SQL Server. ${result.rowsAffected?.[0] ?? rows.length} filas afectadas.`,
    };
  }

  if (conexion.tipo === 'mysql') {
    const connection = await mysql.createConnection(getMysqlConfig(conexion));
    const [rows, fields] = await connection.query(query);
    await connection.end();
    const rowCount = Array.isArray(rows) ? rows.length : 0;
    const affected = rows.affectedRows ?? rowCount;
    return {
      ok: true,
      rowCount,
      rowsAffected: affected,
      rows: Array.isArray(rows) ? rows.slice(0, 100) : [],
      mensaje: `Query ejecutada en MySQL. ${affected} filas afectadas.`,
    };
  }

  throw new Error(`Tipo de base de datos no soportado: ${conexion.tipo}`);
}

function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(appPaths.publicPath()));

  app.get('/api/license-gen/catalog', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      res.json(licenseGenerator.getCatalog());
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  app.post('/api/license-gen/issue', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      res.json(licenseGenerator.issueLicense(req.body || {}));
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  app.post('/api/license-gen/issue-and-upload', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const token = String(req.body?.token || '').trim();
      if (!token) {
        return res.status(400).json({ error: 'Seleccione un token (cliente / instalación)' });
      }
      const { conexion } = await resolveHostingConexion();
      const tokens = await hostingDb.listTokensAdmin(conexion);
      const row = tokens.find(
        (t) => String(t.TOKEN || '').trim().toUpperCase() === token.toUpperCase()
      );
      if (!row) {
        return res.status(404).json({ error: 'Token no encontrado en la tabla TOKENS' });
      }
      const customer =
        String(row.EMPRESA || '').trim() || String(row.TOKEN || '').trim();
      const issued = licenseGenerator.issueLicense({
        customer,
        expiresAt: req.body?.expiresAt || null,
        notes: req.body?.notes || '',
        menus: req.body?.menus || [],
        modules: req.body?.modules || [],
      });
      await hostingDb.uploadTokenLicencia(conexion, token, issued.license);
      res.json({
        ...issued,
        uploaded: true,
        token: row.TOKEN,
        empresa: row.EMPRESA,
      });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  app.get('/api/license-gen/token-license', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const token = String(req.query.token || '').trim();
      if (!token) {
        return res.status(400).json({ error: 'Indique el token' });
      }
      const { conexion } = await resolveHostingConexion();
      const data = await hostingDb.getTokenLicencia(conexion, token);
      res.json(data);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  app.get('/api/license-gen/public-key', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      res.type('text/plain').send(licenseGenerator.getPublicKeyPem());
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  app.get('/api/license-gen/templates', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const templates = await readLicenseTemplates();
      res.json(templates);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/license-gen/templates', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Indique el nombre de la plantilla' });
      const menus = Array.isArray(req.body?.menus)
        ? [...new Set(req.body.menus.map((m) => String(m || '').trim()).filter(Boolean))]
        : [];
      if (!menus.length) {
        return res.status(400).json({ error: 'Seleccione al menos una vista para guardar la plantilla' });
      }
      const templates = await readLicenseTemplates();
      const existingIdx = templates.findIndex(
        (t) => String(t.name || '').trim().toLowerCase() === name.toLowerCase()
      );
      const row = {
        id: existingIdx >= 0 ? templates[existingIdx].id : generateId(templates),
        name,
        menus,
        updatedAt: new Date().toISOString(),
      };
      if (existingIdx >= 0) templates[existingIdx] = { ...templates[existingIdx], ...row };
      else templates.push(row);
      await writeLicenseTemplates(templates);
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/license-gen/templates/:id', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const templates = await readLicenseTemplates();
      const next = templates.filter((t) => String(t.id) !== String(req.params.id));
      if (next.length === templates.length) {
        return res.status(404).json({ error: 'Plantilla no encontrada' });
      }
      await writeLicenseTemplates(next);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** Licencias FS ERP (El Salvador) — catálogo/claves/plantillas ajenas a OnneB. */
  app.get('/api/license-gen-fserp/catalog', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      res.json(licenseGeneratorFserp.getCatalog());
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  app.post('/api/license-gen-fserp/issue', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      res.json(licenseGeneratorFserp.issueLicense(req.body || {}));
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  app.post('/api/license-gen-fserp/issue-and-upload', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const token = String(req.body?.token || '').trim();
      if (!token) {
        return res.status(400).json({ error: 'Seleccione un token (cliente / instalación)' });
      }
      const { conexion } = await resolveHostingConexion();
      const tokens = await hostingDb.listTokensAdmin(conexion);
      const row = tokens.find(
        (t) => String(t.TOKEN || '').trim().toUpperCase() === token.toUpperCase()
      );
      if (!row) {
        return res.status(404).json({ error: 'Token no encontrado en la tabla TOKENS' });
      }
      const customer =
        String(row.EMPRESA || '').trim() || String(row.TOKEN || '').trim();
      const issued = licenseGeneratorFserp.issueLicense({
        customer,
        expiresAt: req.body?.expiresAt || null,
        notes: req.body?.notes || '',
        menus: req.body?.menus || [],
        modules: req.body?.modules || [],
      });
      await hostingDb.uploadTokenLicencia(conexion, token, issued.license);
      res.json({
        ...issued,
        uploaded: true,
        token: row.TOKEN,
        empresa: row.EMPRESA,
      });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  app.get('/api/license-gen-fserp/token-license', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const token = String(req.query.token || '').trim();
      if (!token) {
        return res.status(400).json({ error: 'Indique el token' });
      }
      const { conexion } = await resolveHostingConexion();
      const data = await hostingDb.getTokenLicencia(conexion, token);
      const product = String(data?.license?.payload?.product || data?.product || '').trim().toLowerCase();
      if (product && product !== 'fserp') {
        return res.status(409).json({
          error:
            'La licencia en nube de este token no es de FS ERP (parece OnneB u otro producto). Use el Generador Licencias de OnneB o emita una nueva FS ERP.',
          product,
        });
      }
      res.json(data);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  app.get('/api/license-gen-fserp/public-key', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      res.type('text/plain').send(licenseGeneratorFserp.getPublicKeyPem());
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  app.get('/api/license-gen-fserp/templates', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      res.json(await readLicenseTemplatesFserp());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/license-gen-fserp/templates', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Indique el nombre de la plantilla' });
      const menus = Array.isArray(req.body?.menus)
        ? [...new Set(req.body.menus.map((m) => String(m || '').trim()).filter(Boolean))]
        : [];
      if (!menus.length) {
        return res.status(400).json({ error: 'Seleccione al menos una vista para guardar la plantilla' });
      }
      const templates = await readLicenseTemplatesFserp();
      const existingIdx = templates.findIndex(
        (t) => String(t.name || '').trim().toLowerCase() === name.toLowerCase()
      );
      const row = {
        id: existingIdx >= 0 ? templates[existingIdx].id : generateId(templates),
        name,
        menus,
        updatedAt: new Date().toISOString(),
      };
      if (existingIdx >= 0) templates[existingIdx] = { ...templates[existingIdx], ...row };
      else templates.push(row);
      await writeLicenseTemplatesFserp(templates);
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/license-gen-fserp/templates/:id', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const templates = await readLicenseTemplatesFserp();
      const next = templates.filter((t) => String(t.id) !== String(req.params.id));
      if (next.length === templates.length) {
        return res.status(404).json({ error: 'Plantilla no encontrada' });
      }
      await writeLicenseTemplatesFserp(next);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/conexiones', async (_req, res) => {
    try {
      const conexiones = await readConexiones();
      res.json(conexiones);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/conexiones/:id', async (req, res) => {
    try {
      const conexiones = await readConexiones();
      const conexion = conexiones.find((c) => c.id === req.params.id);
      if (!conexion) {
        return res.status(404).json({ error: 'Conexión no encontrada' });
      }
      res.json(conexion);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/conexiones', async (req, res) => {
    try {
      const conexiones = await readConexiones();
      const nueva = {
        id: generateId(conexiones),
        nombre: req.body.nombre || 'Sin nombre',
        tipo: req.body.tipo,
        host: req.body.host || 'localhost',
        puerto: req.body.puerto,
        usuario: req.body.usuario || '',
        password: req.body.password || '',
        baseDatos: req.body.baseDatos || '',
        ...(req.body.opciones ? { opciones: req.body.opciones } : {}),
      };

      if (!['mssql', 'mysql'].includes(nueva.tipo)) {
        return res.status(400).json({ error: 'El tipo debe ser "mssql" o "mysql"' });
      }

      conexiones.push(nueva);
      await writeConexiones(conexiones);
      res.status(201).json(nueva);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/conexiones/:id', async (req, res) => {
    try {
      const conexiones = await readConexiones();
      const index = conexiones.findIndex((c) => c.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Conexión no encontrada' });
      }

      conexiones[index] = {
        ...conexiones[index],
        ...req.body,
        id: req.params.id,
      };

      await writeConexiones(conexiones);
      res.json(conexiones[index]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/conexiones/:id', async (req, res) => {
    try {
      const conexiones = await readConexiones();
      const filtered = conexiones.filter((c) => c.id !== req.params.id);
      if (filtered.length === conexiones.length) {
        return res.status(404).json({ error: 'Conexión no encontrada' });
      }
      await writeConexiones(filtered);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/conexiones/:id/test', async (req, res) => {
    try {
      const conexiones = await readConexiones();
      const conexion = conexiones.find((c) => c.id === req.params.id);
      if (!conexion) {
        return res.status(404).json({ error: 'Conexión no encontrada' });
      }
      const result = await testConexion(conexion);
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, mensaje: err.message });
    }
  });

  app.post('/api/conexiones/test', async (req, res) => {
    try {
      const result = await testConexion(req.body);
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, mensaje: err.message });
    }
  });

  app.post('/api/conexiones/:id/query', async (req, res) => {
    try {
      const query = (req.body?.query || '').trim();
      if (!query) {
        return res.status(400).json({ error: 'La consulta SQL no puede estar vacía' });
      }

      const conexiones = await readConexiones();
      const conexion = conexiones.find((c) => c.id === req.params.id);
      if (!conexion) {
        return res.status(404).json({ error: 'Conexión no encontrada' });
      }

      const result = await executeQuery(conexion, query);
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message, mensaje: err.message });
    }
  });

  app.get('/api/mantenimiento', async (_req, res) => {
    try {
      const comandos = await readMantenimiento();
      res.json(comandos);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mantenimiento', async (req, res) => {
    try {
      const comandos = await readMantenimiento();
      const conexiones = await readConexiones();
      const conexion = conexiones.find((c) => c.id === req.body.conexionId);

      if (!conexion) {
        return res.status(400).json({ error: 'Conexión no válida' });
      }
      if (!req.body.query?.trim()) {
        return res.status(400).json({ error: 'La query es obligatoria' });
      }

      const nuevo = {
        id: generateId(comandos),
        conexionId: req.body.conexionId,
        nombre: req.body.nombre?.trim() || 'Comando SQL',
        query: req.body.query.trim(),
      };

      comandos.push(nuevo);
      await writeMantenimiento(comandos);
      res.status(201).json(nuevo);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/mantenimiento/:id', async (req, res) => {
    try {
      const comandos = await readMantenimiento();
      const index = comandos.findIndex((c) => c.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Comando no encontrado' });
      }

      if (req.body.conexionId) {
        const conexiones = await readConexiones();
        if (!conexiones.find((c) => c.id === req.body.conexionId)) {
          return res.status(400).json({ error: 'Conexión no válida' });
        }
      }

      comandos[index] = {
        ...comandos[index],
        ...req.body,
        id: req.params.id,
        query: req.body.query?.trim() ?? comandos[index].query,
      };

      await writeMantenimiento(comandos);
      res.json(comandos[index]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/mantenimiento/:id', async (req, res) => {
    try {
      const comandos = await readMantenimiento();
      const filtered = comandos.filter((c) => c.id !== req.params.id);
      if (filtered.length === comandos.length) {
        return res.status(404).json({ error: 'Comando no encontrado' });
      }
      await writeMantenimiento(filtered);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mantenimiento/:id/ejecutar', async (req, res) => {
    try {
      const comandos = await readMantenimiento();
      const comando = comandos.find((c) => c.id === req.params.id);
      if (!comando) {
        return res.status(404).json({ error: 'Comando no encontrado' });
      }

      const conexiones = await readConexiones();
      const conexion = conexiones.find((c) => c.id === comando.conexionId);
      if (!conexion) {
        return res.status(404).json({ error: 'Conexión asociada no encontrada' });
      }

      const result = await executeQuery(conexion, comando.query);
      res.json({ ...result, comando: comando.nombre });
    } catch (err) {
      res.status(500).json({ ok: false, mensaje: err.message });
    }
  });

  app.get('/api/servicios-online', async (_req, res) => {
    try {
      res.json(await getServiciosOnlineFromHosting());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/servicios-online/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const servicio = await hostingDb.getServicioOnline(conexion, parseInt(req.params.id, 10));
      if (!servicio) {
        return res.status(404).json({ error: 'Servicio no encontrado' });
      }
      res.json(servicio);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/servicios-online', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const nuevo = await hostingDb.createServicioOnline(conexion, {
        nombre: (req.body.nombre || 'Sin nombre').trim(),
        url: normalizeServicioUrl(req.body.url),
        pingIntervalMinutes: normalizePingInterval(req.body.pingIntervalMinutes),
      });
      res.status(201).json(nuevo);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/servicios-online/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const updated = await hostingDb.updateServicioOnline(conexion, parseInt(req.params.id, 10), {
        nombre: req.body.nombre,
        url: req.body.url !== undefined ? normalizeServicioUrl(req.body.url) : undefined,
        pingIntervalMinutes: req.body.pingIntervalMinutes,
      });
      res.json(updated);
    } catch (err) {
      const status = err.message === 'Servicio no encontrado' ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  });

  app.delete('/api/servicios-online/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      await hostingDb.deleteServicioOnline(conexion, parseInt(req.params.id, 10));
      res.json({ ok: true });
    } catch (err) {
      const status = err.message === 'Servicio no encontrado' ? 404 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  app.post('/api/servicios-online/:id/ping', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const servicio = await hostingDb.getServicioOnline(conexion, parseInt(req.params.id, 10));
      if (!servicio) {
        return res.status(404).json({ error: 'Servicio no encontrado' });
      }

      const result = await pingServicioUrl(servicio.url);
      if (result.ok) {
        res.json(result);
      } else {
        res.status(502).json(result);
      }
    } catch (err) {
      res.status(500).json({ ok: false, mensaje: err.message });
    }
  });

  app.get('/api/config', async (_req, res) => {
    try {
      res.json(await readConfig());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/config', async (req, res) => {
    try {
      const current = await readConfig();
      const updated = mergeConfig({
        ...current,
        ...req.body,
        whatsapp: { ...current.whatsapp, ...(req.body?.whatsapp || {}) },
        conexiones: { ...current.conexiones, ...(req.body?.conexiones || {}) },
        hosting: { ...current.hosting, ...(req.body?.hosting || {}) },
        mercadosEfectivos: { ...current.mercadosEfectivos, ...(req.body?.mercadosEfectivos || {}) },
      });
      await writeConfig(updated);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/hosting/status', async (_req, res) => {
    try {
      const config = await readConfig();
      const conexiones = await readConexiones();
      const principalId = config.hosting?.principalConexionId;
      const conexion = conexiones.find((c) => String(c.id) === String(principalId));
      res.json({
        principalConexionId: principalId || null,
        conexion: conexion ? { id: conexion.id, nombre: conexion.nombre, tipo: conexion.tipo, host: conexion.host } : null,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/soporte/anydesk', async (_req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const rows = await hostingDb.listSoporteAnydesk(conexion);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/soporte/tokens', async (_req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const rows = await hostingDb.listTokens(conexion);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/soporte/anydesk', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.createSoporteAnydesk(conexion, req.body);
      res.status(201).json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/soporte/anydesk/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.updateSoporteAnydesk(conexion, parseInt(req.params.id, 10), req.body);
      res.json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/soporte/anydesk/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      await hostingDb.deleteSoporteAnydesk(conexion, parseInt(req.params.id, 10));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/updater/queries', async (_req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const rows = await hostingDb.listUpdateQueries(conexion);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/updater/queries', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.createUpdateQuery(conexion, req.body);
      res.status(201).json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/updater/queries/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.updateUpdateQuery(conexion, parseInt(req.params.id, 10), req.body);
      res.json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/updater/queries/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      await hostingDb.deleteUpdateQuery(conexion, parseInt(req.params.id, 10));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/tokens/admin', async (_req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const rows = await hostingDb.listTokensAdmin(conexion);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/tokens/admin', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.createTokenAdmin(conexion, req.body);
      res.status(201).json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/tokens/admin/:token', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.updateTokenAdmin(conexion, decodeURIComponent(req.params.token), req.body);
      res.json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch('/api/tokens/admin/:token/activo', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.toggleTokenActivo(conexion, decodeURIComponent(req.params.token));
      res.json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/tokens/admin/:token', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      await hostingDb.deleteTokenAdmin(conexion, decodeURIComponent(req.params.token));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/tokens/community', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const token = (req.query.token || '').trim();
      if (!token) return res.status(400).json({ error: 'TOKEN requerido' });
      const rows = await hostingDb.listCommunityEmpresas(conexion, token, req.query.search || '');
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/tokens/community', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.createCommunityEmpresa(conexion, req.body);
      res.status(201).json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/tokens/community/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.updateCommunityEmpresa(conexion, parseInt(req.params.id, 10), req.body);
      res.json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/tokens/community/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      await hostingDb.deleteCommunityEmpresa(conexion, parseInt(req.params.id, 10));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/render/cuentas', async (_req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const rows = await hostingDb.listRenderCuentas(conexion);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/render/cuentas', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.createRenderCuenta(conexion, req.body);
      res.status(201).json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/render/cuentas/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.updateRenderCuenta(conexion, parseInt(req.params.id, 10), req.body);
      res.json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/render/cuentas/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      await hostingDb.deleteRenderCuenta(conexion, parseInt(req.params.id, 10));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/render/cuentas/:id/usage', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const cuenta = await hostingDb.getRenderCuenta(conexion, parseInt(req.params.id, 10));
      if (!cuenta.APIKEY) {
        return res.status(400).json({ error: 'La cuenta no tiene APIKEY configurada' });
      }
      const usage = await renderApi.getAccountUsageHours(cuenta.APIKEY);
      res.json({
        cuenta: {
          IDRENDER: cuenta.IDRENDER,
          EMAIL: cuenta.EMAIL,
        },
        ...usage,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/render/apps', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const idRender = parseInt(req.query.idRender, 10);
      if (!Number.isFinite(idRender)) {
        return res.status(400).json({ error: 'idRender requerido' });
      }
      const rows = await hostingDb.listRenderApps(conexion, idRender, req.query.search || '');
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/render/apps/search', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const rows = await hostingDb.listRenderAppsAll(conexion, req.query.search || '');
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/render/cuentas/:id/sync-webapps', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const idRender = parseInt(req.params.id, 10);
      if (!Number.isFinite(idRender)) {
        return res.status(400).json({ error: 'ID de cuenta inválido' });
      }
      const cuenta = await hostingDb.getRenderCuenta(conexion, idRender);
      if (!cuenta.APIKEY) {
        return res.status(400).json({ error: 'La cuenta no tiene APIKEY configurada' });
      }
      const services = await renderApi.listServices(cuenta.APIKEY);
      const webapps = renderApi.listWebApps(services);
      const rows = await hostingDb.replaceRenderAppsForCuenta(conexion, idRender, webapps);
      res.json({
        ok: true,
        loaded: rows.length,
        rows,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/render/apps', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.createRenderApp(conexion, req.body);
      res.status(201).json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/render/apps/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.updateRenderApp(conexion, parseInt(req.params.id, 10), req.body);
      res.json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/render/apps/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: 'ID de app inválido' });
      }
      const appRow = await hostingDb.getRenderApp(conexion, id);
      const cuenta = await hostingDb.getRenderCuenta(conexion, appRow.IDRENDER);
      const serviceId = String(appRow.SERVICEID || '').trim();
      if (!serviceId) {
        return res.status(400).json({
          error: 'La app no tiene SERVICEID. Cargue las webapps desde Render antes de eliminar en la nube.',
        });
      }
      if (!cuenta.APIKEY) {
        return res.status(400).json({ error: 'La cuenta no tiene APIKEY configurada' });
      }
      await renderApi.deleteService(cuenta.APIKEY, serviceId).catch((err) => {
        const msg = String(err?.message || '');
        // Si ya no existe en Render, igual limpiamos la fila local.
        if (!/\b404\b|\b410\b|not found|gone/i.test(msg)) throw err;
      });
      await hostingDb.deleteRenderApp(conexion, id);
      res.json({ ok: true, deletedFromRender: true, serviceId });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/status', (_req, res) => {
    res.json({ ok: true, puerto: PORT, servicio: 'mariandre' });
  });

  app.get('/api/app/info', (_req, res) => {
    res.json(appPaths.getAppInfo());
  });

  app.get('/api/whatsapp/status', (_req, res) => {
    res.json(whatsapp.getPublicState());
  });

  app.get('/api/whatsapp/messages', (_req, res) => {
    res.json(whatsapp.getMessages());
  });

  app.get('/api/whatsapp/events', (req, res) => {
    whatsapp.attachSse(req, res);
  });

  app.post('/api/whatsapp/start', async (_req, res) => {
    try {
      const result = await whatsapp.startSession();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/whatsapp/refresh', async (_req, res) => {
    try {
      const result = await whatsapp.refreshSession();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/whatsapp/logout', async (_req, res) => {
    try {
      const result = await whatsapp.logoutSession();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/alarmas', async (_req, res) => {
    try {
      const alarmas = await readAlarmas();
      res.json(alarmas);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/alarmas', async (req, res) => {
    try {
      const alarmas = await readAlarmas();
      const parsed = parseAlarmaTime(req.body);
      const nueva = {
        id: generateId(alarmas),
        ...parsed,
        disparada: false,
        creadaEn: new Date().toISOString(),
      };
      alarmas.push(nueva);
      await writeAlarmas(alarmas);
      res.status(201).json(nueva);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/alarmas/:id', async (req, res) => {
    try {
      const alarmas = await readAlarmas();
      const index = alarmas.findIndex((a) => a.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Alarma no encontrada' });
      }
      const parsed = parseAlarmaTime(req.body);
      alarmas[index] = {
        ...alarmas[index],
        ...parsed,
        id: req.params.id,
        disparada: false,
        disparadaEn: null,
      };
      await writeAlarmas(alarmas);
      res.json(alarmas[index]);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/alarmas/:id/disparar', async (req, res) => {
    try {
      const alarmas = await readAlarmas();
      const index = alarmas.findIndex((a) => a.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Alarma no encontrada' });
      }
      if (alarmas[index].disparada) {
        return res.json(alarmas[index]);
      }
      alarmas[index] = {
        ...alarmas[index],
        disparada: true,
        disparadaEn: new Date().toISOString(),
      };
      await writeAlarmas(alarmas);
      res.json(alarmas[index]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/alarmas/:id', async (req, res) => {
    try {
      const alarmas = await readAlarmas();
      const filtered = alarmas.filter((a) => a.id !== req.params.id);
      if (filtered.length === alarmas.length) {
        return res.status(404).json({ error: 'Alarma no encontrada' });
      }
      await writeAlarmas(filtered);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('*', (_req, res) => {
    res.sendFile(path.join(appPaths.publicPath(), 'index.html'));
  });

  return app;
}

function startServer() {
  return new Promise((resolve, reject) => {
    if (server) {
      return resolve(server);
    }

    const app = createApp();
    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Servidor activo en http://localhost:${PORT}`);
      whatsapp.startSession().catch((err) => {
        console.warn('WhatsApp auto-start:', err.message);
      });
      resolve(server);
    });

    server.on('error', reject);
  });
}

function stopServer() {
  return new Promise((resolve) => {
    whatsapp.destroyWhatsApp().finally(() => {
      if (!server) {
        return resolve();
      }
      server.close(() => {
        server = null;
        resolve();
      });
    });
  });
}

module.exports = { startServer, stopServer, PORT };

if (require.main === module) {
  (async () => {
    try {
      appPaths.initPaths();
      await appPaths.ensureDataFiles();
      await startServer();
    } catch (err) {
      console.error('No se pudo iniciar el servidor:', err);
      process.exit(1);
    }
  })();

  const shutdown = async () => {
    await stopServer();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
