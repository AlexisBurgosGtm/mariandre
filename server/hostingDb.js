const sql = require('mssql');
const mysql = require('mysql2/promise');

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

async function withHostingConnection(conexion, fn) {
  if (conexion.tipo === 'mssql') {
    const pool = await sql.connect(getMssqlConfig(conexion));
    try {
      return await fn(pool, 'mssql');
    } finally {
      await pool.close();
    }
  }

  if (conexion.tipo === 'mysql') {
    const connection = await mysql.createConnection(getMysqlConfig(conexion));
    try {
      return await fn(connection, 'mysql');
    } finally {
      await connection.end();
    }
  }

  throw new Error(`Tipo de base de datos no soportado: ${conexion.tipo}`);
}

const SOPORTE_COLUMNS = 'ID, TOKEN, SUCURSAL, TIPO, ANYDESK, PASS, VENDEDOR, LASTUPDATE';

async function ensureSoporteTable(conexion) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      await db.request().query(`
        IF NOT EXISTS (
          SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SOPORTE_ANYDESK'
        )
        BEGIN
          CREATE TABLE SOPORTE_ANYDESK (
            ID INT IDENTITY(1,1) PRIMARY KEY,
            TOKEN VARCHAR(100) NULL,
            SUCURSAL VARCHAR(200) NULL,
            TIPO VARCHAR(100) NULL,
            ANYDESK VARCHAR(200) NULL,
            PASS VARCHAR(200) NULL,
            VENDEDOR VARCHAR(200) NULL,
            LASTUPDATE DATE NULL
          )
        END

        IF NOT EXISTS (
          SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = 'SOPORTE_ANYDESK' AND COLUMN_NAME = 'VENDEDOR'
        )
          ALTER TABLE SOPORTE_ANYDESK ADD VENDEDOR VARCHAR(200) NULL;

        IF NOT EXISTS (
          SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = 'SOPORTE_ANYDESK' AND COLUMN_NAME = 'LASTUPDATE'
        )
          ALTER TABLE SOPORTE_ANYDESK ADD LASTUPDATE DATE NULL;
      `);
      return;
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS SOPORTE_ANYDESK (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        TOKEN VARCHAR(100) NULL,
        SUCURSAL VARCHAR(200) NULL,
        TIPO VARCHAR(100) NULL,
        ANYDESK VARCHAR(200) NULL,
        PASS VARCHAR(200) NULL,
        VENDEDOR VARCHAR(200) NULL,
        LASTUPDATE DATE NULL
      )
    `);

    const [cols] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SOPORTE_ANYDESK'`
    );
    const names = new Set((cols || []).map((c) => String(c.COLUMN_NAME || '').toUpperCase()));
    if (!names.has('VENDEDOR')) {
      await db.query('ALTER TABLE SOPORTE_ANYDESK ADD COLUMN VENDEDOR VARCHAR(200) NULL');
    }
    if (!names.has('LASTUPDATE')) {
      await db.query('ALTER TABLE SOPORTE_ANYDESK ADD COLUMN LASTUPDATE DATE NULL');
    }
  });
}

function normalizeRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (value instanceof Date) {
      out[key] = value.toISOString().slice(0, 10);
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function listSoporteAnydesk(conexion) {
  await ensureSoporteTable(conexion);
  return withHostingConnection(conexion, async (db, tipo) => {
    const query = `SELECT ${SOPORTE_COLUMNS} FROM SOPORTE_ANYDESK ORDER BY ID DESC`;
    if (tipo === 'mssql') {
      const result = await db.request().query(query);
      return (result.recordset || []).map(normalizeRow);
    }
    const [rows] = await db.query(query);
    return rows.map(normalizeRow);
  });
}

async function listTokens(conexion) {
  return withHostingConnection(conexion, async (db, tipo) => {
    const query = 'SELECT TOKEN, EMPRESA FROM TOKENS ORDER BY EMPRESA';
    if (tipo === 'mssql') {
      const result = await db.request().query(query);
      return result.recordset || [];
    }
    const [rows] = await db.query(query);
    return rows;
  });
}

async function createSoporteAnydesk(conexion, data) {
  await ensureSoporteTable(conexion);
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('token', sql.VarChar(100), data.TOKEN || '')
        .input('sucursal', sql.VarChar(200), data.SUCURSAL || '')
        .input('tipo', sql.VarChar(100), data.TIPO || '')
        .input('anydesk', sql.VarChar(200), data.ANYDESK || '')
        .input('pass', sql.VarChar(200), data.PASS || '')
        .input('vendedor', sql.VarChar(200), data.VENDEDOR || '')
        .query(`
          INSERT INTO SOPORTE_ANYDESK (TOKEN, SUCURSAL, TIPO, ANYDESK, PASS, VENDEDOR, LASTUPDATE)
          OUTPUT INSERTED.ID, INSERTED.TOKEN, INSERTED.SUCURSAL, INSERTED.TIPO, INSERTED.ANYDESK, INSERTED.PASS, INSERTED.VENDEDOR, INSERTED.LASTUPDATE
          VALUES (@token, @sucursal, @tipo, @anydesk, @pass, @vendedor, CAST(GETDATE() AS DATE))
        `);
      return normalizeRow(result.recordset[0]);
    }

    const [result] = await db.query(
      `INSERT INTO SOPORTE_ANYDESK (TOKEN, SUCURSAL, TIPO, ANYDESK, PASS, VENDEDOR, LASTUPDATE)
       VALUES (?, ?, ?, ?, ?, ?, CURDATE())`,
      [data.TOKEN || '', data.SUCURSAL || '', data.TIPO || '', data.ANYDESK || '', data.PASS || '', data.VENDEDOR || '']
    );
    const [rows] = await db.query(
      `SELECT ${SOPORTE_COLUMNS} FROM SOPORTE_ANYDESK WHERE ID = ?`,
      [result.insertId]
    );
    return normalizeRow(rows[0]);
  });
}

async function updateSoporteAnydesk(conexion, id, data) {
  await ensureSoporteTable(conexion);
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('id', sql.Int, id)
        .input('token', sql.VarChar(100), data.TOKEN || '')
        .input('sucursal', sql.VarChar(200), data.SUCURSAL || '')
        .input('tipo', sql.VarChar(100), data.TIPO || '')
        .input('anydesk', sql.VarChar(200), data.ANYDESK || '')
        .input('pass', sql.VarChar(200), data.PASS || '')
        .input('vendedor', sql.VarChar(200), data.VENDEDOR || '')
        .query(`
          UPDATE SOPORTE_ANYDESK
          SET TOKEN = @token, SUCURSAL = @sucursal, TIPO = @tipo, ANYDESK = @anydesk, PASS = @pass,
              VENDEDOR = @vendedor, LASTUPDATE = CAST(GETDATE() AS DATE)
          OUTPUT INSERTED.ID, INSERTED.TOKEN, INSERTED.SUCURSAL, INSERTED.TIPO, INSERTED.ANYDESK, INSERTED.PASS, INSERTED.VENDEDOR, INSERTED.LASTUPDATE
          WHERE ID = @id
        `);
      if (!result.recordset.length) throw new Error('Registro no encontrado');
      return normalizeRow(result.recordset[0]);
    }

    const [result] = await db.query(
      `UPDATE SOPORTE_ANYDESK
       SET TOKEN=?, SUCURSAL=?, TIPO=?, ANYDESK=?, PASS=?, VENDEDOR=?, LASTUPDATE=CURDATE()
       WHERE ID=?`,
      [data.TOKEN || '', data.SUCURSAL || '', data.TIPO || '', data.ANYDESK || '', data.PASS || '', data.VENDEDOR || '', id]
    );
    if (!result.affectedRows) throw new Error('Registro no encontrado');
    const [rows] = await db.query(
      `SELECT ${SOPORTE_COLUMNS} FROM SOPORTE_ANYDESK WHERE ID = ?`,
      [id]
    );
    return normalizeRow(rows[0]);
  });
}

async function deleteSoporteAnydesk(conexion, id) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM SOPORTE_ANYDESK WHERE ID = @id');
      if (!result.rowsAffected[0]) throw new Error('Registro no encontrado');
      return { ok: true };
    }

    const [result] = await db.query('DELETE FROM SOPORTE_ANYDESK WHERE ID = ?', [id]);
    if (!result.affectedRows) throw new Error('Registro no encontrado');
    return { ok: true };
  });
}

async function listUpdateQueries(conexion) {
  return withHostingConnection(conexion, async (db, tipo) => {
    const query = 'SELECT ID, QRY, FECHA, VERSION, DB FROM UPDATE_QUERIES ORDER BY ID DESC';
    if (tipo === 'mssql') {
      const result = await db.request().query(query);
      return (result.recordset || []).map(normalizeRow);
    }
    const [rows] = await db.query(query);
    return rows.map(normalizeRow);
  });
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function validateUpdaterPayload(data, { isCreate = false } = {}) {
  const db = (data.DB || '').toUpperCase();
  if (!['P', 'T'].includes(db)) {
    throw new Error('DB debe ser P o T');
  }

  const version = parseInt(data.VERSION, 10);
  if (Number.isNaN(version) || version < 2024 || version > 2030) {
    throw new Error('VERSION debe estar entre 2024 y 2030');
  }

  const qry = (data.QRY || '').trim();
  if (!qry) throw new Error('QRY no puede estar vacía');

  const fecha = isCreate ? todayIsoDate() : (data.FECHA || todayIsoDate());

  return { DB: db, VERSION: version, QRY: qry, FECHA: fecha };
}

async function createUpdateQuery(conexion, data) {
  const payload = validateUpdaterPayload(data, { isCreate: true });
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('qry', sql.VarChar(sql.MAX), payload.QRY)
        .input('fecha', sql.Date, payload.FECHA)
        .input('version', sql.Int, payload.VERSION)
        .input('db', sql.VarChar(1), payload.DB)
        .query(`
          INSERT INTO UPDATE_QUERIES (QRY, FECHA, VERSION, DB)
          OUTPUT INSERTED.ID, INSERTED.QRY, INSERTED.FECHA, INSERTED.VERSION, INSERTED.DB
          VALUES (@qry, @fecha, @version, @db)
        `);
      return normalizeRow(result.recordset[0]);
    }

    const [result] = await db.query(
      'INSERT INTO UPDATE_QUERIES (QRY, FECHA, VERSION, DB) VALUES (?, ?, ?, ?)',
      [payload.QRY, payload.FECHA, payload.VERSION, payload.DB]
    );
    const [rows] = await db.query(
      'SELECT ID, QRY, FECHA, VERSION, DB FROM UPDATE_QUERIES WHERE ID = ?',
      [result.insertId]
    );
    return normalizeRow(rows[0]);
  });
}

async function updateUpdateQuery(conexion, id, data) {
  const payload = validateUpdaterPayload(data);
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('id', sql.Int, id)
        .input('qry', sql.VarChar(sql.MAX), payload.QRY)
        .input('fecha', sql.Date, payload.FECHA)
        .input('version', sql.Int, payload.VERSION)
        .input('db', sql.VarChar(1), payload.DB)
        .query(`
          UPDATE UPDATE_QUERIES
          SET QRY = @qry, FECHA = @fecha, VERSION = @version, DB = @db
          OUTPUT INSERTED.ID, INSERTED.QRY, INSERTED.FECHA, INSERTED.VERSION, INSERTED.DB
          WHERE ID = @id
        `);
      if (!result.recordset.length) throw new Error('Registro no encontrado');
      return normalizeRow(result.recordset[0]);
    }

    const [result] = await db.query(
      'UPDATE UPDATE_QUERIES SET QRY=?, FECHA=?, VERSION=?, DB=? WHERE ID=?',
      [payload.QRY, payload.FECHA, payload.VERSION, payload.DB, id]
    );
    if (!result.affectedRows) throw new Error('Registro no encontrado');
    const [rows] = await db.query(
      'SELECT ID, QRY, FECHA, VERSION, DB FROM UPDATE_QUERIES WHERE ID = ?',
      [id]
    );
    return normalizeRow(rows[0]);
  });
}

async function deleteUpdateQuery(conexion, id) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM UPDATE_QUERIES WHERE ID = @id');
      if (!result.rowsAffected[0]) throw new Error('Registro no encontrado');
      return { ok: true };
    }

    const [result] = await db.query('DELETE FROM UPDATE_QUERIES WHERE ID = ?', [id]);
    if (!result.affectedRows) throw new Error('Registro no encontrado');
    return { ok: true };
  });
}

function normalizeActivo(value) {
  return String(value || 'NO').trim().toUpperCase() === 'SI' ? 'SI' : 'NO';
}

async function listTokensAdmin(conexion) {
  return withHostingConnection(conexion, async (db, tipo) => {
    // Incluye indicador de licencia si la columna LICENCIA existe; si no, solo TOKEN/EMPRESA/ACTIVO.
    const queryWithLic = `
      SELECT TOKEN, EMPRESA, ACTIVO,
        CASE WHEN LICENCIA IS NULL OR LTRIM(RTRIM(CAST(LICENCIA AS NVARCHAR(MAX)))) = '' THEN 0 ELSE 1 END AS HAS_LICENCIA
      FROM TOKENS
      ORDER BY EMPRESA
    `;
    const queryBasic = 'SELECT TOKEN, EMPRESA, ACTIVO FROM TOKENS ORDER BY EMPRESA';

    const mapRows = (rows) =>
      (rows || []).map((row) => ({
        ...normalizeRow(row),
        ACTIVO: normalizeActivo(row.ACTIVO),
        HAS_LICENCIA: Number(row.HAS_LICENCIA) === 1,
      }));

    if (tipo === 'mssql') {
      try {
        const result = await db.request().query(queryWithLic);
        return mapRows(result.recordset);
      } catch (err) {
        const msg = String(err.message || '');
        if (!/LICENCIA|Invalid column/i.test(msg)) throw err;
        const result = await db.request().query(queryBasic);
        return mapRows(result.recordset);
      }
    }

    try {
      const [rows] = await db.query(queryWithLic);
      return mapRows(rows);
    } catch (err) {
      const msg = String(err.message || '');
      if (!/LICENCIA|Unknown column/i.test(msg)) throw err;
      const [rows] = await db.query(queryBasic);
      return mapRows(rows);
    }
  });
}

async function uploadTokenLicencia(conexion, tokenKey, licenseDoc) {
  const token = String(tokenKey || '').trim();
  if (!token) throw new Error('TOKEN requerido');
  if (!licenseDoc || typeof licenseDoc !== 'object') {
    throw new Error('Documento de licencia inválido');
  }
  if (!licenseDoc.payload || !licenseDoc.signature) {
    throw new Error('La licencia debe incluir payload y signature');
  }
  const licenciaJson = JSON.stringify(licenseDoc);

  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('token', sql.VarChar(100), token)
        .input('licencia', sql.NVarChar(sql.MAX), licenciaJson)
        .query(`
          UPDATE TOKENS
          SET LICENCIA = @licencia
          WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@token))
        `);
      if (!result.rowsAffected[0]) throw new Error('Token no encontrado');
      return { ok: true, token };
    }

    const [result] = await db.query(
      'UPDATE TOKENS SET LICENCIA = ? WHERE TRIM(TOKEN) = TRIM(?)',
      [licenciaJson, token]
    );
    if (!result.affectedRows) throw new Error('Token no encontrado');
    return { ok: true, token };
  });
}

/**
 * Lee TOKENS.LICENCIA (documento firmado) para un token.
 * @returns {{ token, empresa, activo, license, menus, modules, expiresAt, notes, licenseId }}
 */
async function getTokenLicencia(conexion, tokenKey) {
  const token = String(tokenKey || '').trim();
  if (!token) throw new Error('TOKEN requerido');

  return withHostingConnection(conexion, async (db, tipo) => {
    const query = `
      SELECT TOKEN, EMPRESA, ACTIVO, CAST(LICENCIA AS NVARCHAR(MAX)) AS LICENCIA
      FROM TOKENS
      WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@token))
    `;
    const queryMysql = `
      SELECT TOKEN, EMPRESA, ACTIVO, CAST(LICENCIA AS CHAR) AS LICENCIA
      FROM TOKENS
      WHERE TRIM(TOKEN) = TRIM(?)
    `;

    let row;
    if (tipo === 'mssql') {
      try {
        const result = await db
          .request()
          .input('token', sql.VarChar(100), token)
          .query(query);
        row = result.recordset[0];
      } catch (err) {
        const msg = String(err.message || '');
        if (/LICENCIA|Invalid column/i.test(msg)) {
          const err2 = new Error('La columna TOKENS.LICENCIA no existe en la base Hosting');
          err2.statusCode = 503;
          throw err2;
        }
        throw err;
      }
    } else {
      try {
        const [rows] = await db.query(queryMysql, [token]);
        row = rows[0];
      } catch (err) {
        const msg = String(err.message || '');
        if (/LICENCIA|Unknown column/i.test(msg)) {
          const err2 = new Error('La columna TOKENS.LICENCIA no existe en la base Hosting');
          err2.statusCode = 503;
          throw err2;
        }
        throw err;
      }
    }

    if (!row) {
      const err = new Error('Token no encontrado');
      err.statusCode = 404;
      throw err;
    }

    const raw = String(row.LICENCIA ?? '').trim();
    if (!raw) {
      const err = new Error('Este token no tiene licencia en la nube');
      err.statusCode = 404;
      throw err;
    }

    let license;
    try {
      license = typeof row.LICENCIA === 'object' && row.LICENCIA !== null
        ? row.LICENCIA
        : JSON.parse(raw);
    } catch {
      const err = new Error('LICENCIA en nube no es un JSON válido');
      err.statusCode = 422;
      throw err;
    }

    const payload = license?.payload && typeof license.payload === 'object' ? license.payload : null;
    if (!payload) {
      const err = new Error('La licencia en nube no tiene payload');
      err.statusCode = 422;
      throw err;
    }

    const menus = Array.isArray(payload.menus)
      ? payload.menus.map((m) => String(m || '').trim()).filter(Boolean)
      : [];
    const modules = Array.isArray(payload.modules)
      ? payload.modules.map((m) => String(m || '').trim()).filter(Boolean)
      : [];

    return {
      ok: true,
      token: String(row.TOKEN || '').trim(),
      empresa: String(row.EMPRESA || '').trim(),
      activo: normalizeActivo(row.ACTIVO),
      license,
      menus,
      modules,
      expiresAt: payload.expiresAt || null,
      notes: String(payload.notes || '').trim(),
      licenseId: payload.licenseId || null,
      customer: String(payload.customer || '').trim(),
    };
  });
}

async function createTokenAdmin(conexion, data) {
  const token = (data.TOKEN || '').trim();
  if (!token) throw new Error('TOKEN no puede estar vacío');

  return withHostingConnection(conexion, async (db, tipo) => {
    const payload = {
      token,
      empresa: (data.EMPRESA || '').trim(),
      activo: normalizeActivo(data.ACTIVO),
    };

    if (tipo === 'mssql') {
      const result = await db.request()
        .input('token', sql.VarChar(100), payload.token)
        .input('empresa', sql.VarChar(200), payload.empresa)
        .input('activo', sql.VarChar(2), payload.activo)
        .query(`
          INSERT INTO TOKENS (TOKEN, EMPRESA, ACTIVO)
          OUTPUT INSERTED.TOKEN, INSERTED.EMPRESA, INSERTED.ACTIVO
          VALUES (@token, @empresa, @activo)
        `);
      const row = result.recordset[0];
      return { ...normalizeRow(row), ACTIVO: normalizeActivo(row.ACTIVO) };
    }

    await db.query(
      'INSERT INTO TOKENS (TOKEN, EMPRESA, ACTIVO) VALUES (?, ?, ?)',
      [payload.token, payload.empresa, payload.activo]
    );
    const [rows] = await db.query(
      'SELECT TOKEN, EMPRESA, ACTIVO FROM TOKENS WHERE TOKEN = ?',
      [payload.token]
    );
    return { ...normalizeRow(rows[0]), ACTIVO: normalizeActivo(rows[0].ACTIVO) };
  });
}

async function updateTokenAdmin(conexion, tokenKey, data) {
  return withHostingConnection(conexion, async (db, tipo) => {
    const payload = {
      empresa: (data.EMPRESA || '').trim(),
      activo: normalizeActivo(data.ACTIVO),
    };

    if (tipo === 'mssql') {
      const result = await db.request()
        .input('token', sql.VarChar(100), tokenKey)
        .input('empresa', sql.VarChar(200), payload.empresa)
        .input('activo', sql.VarChar(2), payload.activo)
        .query(`
          UPDATE TOKENS SET EMPRESA = @empresa, ACTIVO = @activo
          OUTPUT INSERTED.TOKEN, INSERTED.EMPRESA, INSERTED.ACTIVO
          WHERE TOKEN = @token
        `);
      if (!result.recordset.length) throw new Error('Token no encontrado');
      const row = result.recordset[0];
      return { ...normalizeRow(row), ACTIVO: normalizeActivo(row.ACTIVO) };
    }

    const [result] = await db.query(
      'UPDATE TOKENS SET EMPRESA=?, ACTIVO=? WHERE TOKEN=?',
      [payload.empresa, payload.activo, tokenKey]
    );
    if (!result.affectedRows) throw new Error('Token no encontrado');
    const [rows] = await db.query(
      'SELECT TOKEN, EMPRESA, ACTIVO FROM TOKENS WHERE TOKEN = ?',
      [tokenKey]
    );
    return { ...normalizeRow(rows[0]), ACTIVO: normalizeActivo(rows[0].ACTIVO) };
  });
}

async function toggleTokenActivo(conexion, tokenKey) {
  return withHostingConnection(conexion, async (db, tipo) => {
    let current;
    if (tipo === 'mssql') {
      const found = await db.request()
        .input('token', sql.VarChar(100), tokenKey)
        .query('SELECT TOKEN, EMPRESA, ACTIVO FROM TOKENS WHERE TOKEN = @token');
      if (!found.recordset.length) throw new Error('Token no encontrado');
      current = found.recordset[0];
    } else {
      const [rows] = await db.query('SELECT TOKEN, EMPRESA, ACTIVO FROM TOKENS WHERE TOKEN = ?', [tokenKey]);
      if (!rows.length) throw new Error('Token no encontrado');
      current = rows[0];
    }

    const nextActivo = normalizeActivo(current.ACTIVO) === 'SI' ? 'NO' : 'SI';
    return updateTokenAdmin(conexion, tokenKey, { EMPRESA: current.EMPRESA, ACTIVO: nextActivo });
  });
}

async function deleteTokenAdmin(conexion, tokenKey) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('token', sql.VarChar(100), tokenKey)
        .query('DELETE FROM TOKENS WHERE TOKEN = @token');
      if (!result.rowsAffected[0]) throw new Error('Token no encontrado');
      return { ok: true };
    }

    const [result] = await db.query('DELETE FROM TOKENS WHERE TOKEN = ?', [tokenKey]);
    if (!result.affectedRows) throw new Error('Token no encontrado');
    return { ok: true };
  });
}

async function ensureCommunityEmpresasSyncTable(conexion) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      await db.request().query(`
        IF NOT EXISTS (
          SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'COMMUNITY_EMPRESAS_SYNC'
        )
        BEGIN
          CREATE TABLE COMMUNITY_EMPRESAS_SYNC (
            ID INT IDENTITY(1,1) PRIMARY KEY,
            TOKEN VARCHAR(100) NOT NULL,
            EMPNIT VARCHAR(50) NULL,
            EMPNOMBRE VARCHAR(200) NULL,
            VPN_CODE VARCHAR(100) NULL,
            SERVER_IP VARCHAR(200) NULL,
            SERVER_DB VARCHAR(200) NULL,
            SERVER_USER VARCHAR(200) NULL,
            SERVER_PASS VARCHAR(200) NULL
          )
        END
      `);
      return;
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS COMMUNITY_EMPRESAS_SYNC (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        TOKEN VARCHAR(100) NOT NULL,
        EMPNIT VARCHAR(50) NULL,
        EMPNOMBRE VARCHAR(200) NULL,
        VPN_CODE VARCHAR(100) NULL,
        SERVER_IP VARCHAR(200) NULL,
        SERVER_DB VARCHAR(200) NULL,
        SERVER_USER VARCHAR(200) NULL,
        SERVER_PASS VARCHAR(200) NULL
      )
    `);
  });
}

async function listCommunityEmpresas(conexion, token, search = '') {
  await ensureCommunityEmpresasSyncTable(conexion);
  const term = `%${(search || '').trim()}%`;

  return withHostingConnection(conexion, async (db, tipo) => {
    const fields = 'ID, TOKEN, EMPNIT, EMPNOMBRE, VPN_CODE, SERVER_IP, SERVER_DB, SERVER_USER, SERVER_PASS';

    if (tipo === 'mssql') {
      const result = await db.request()
        .input('token', sql.VarChar(100), token)
        .input('search', sql.VarChar(200), term)
        .query(`
          SELECT ${fields} FROM COMMUNITY_EMPRESAS_SYNC
          WHERE TOKEN = @token
          AND (
            @search = '%%' OR EMPNIT LIKE @search OR EMPNOMBRE LIKE @search
            OR VPN_CODE LIKE @search OR SERVER_IP LIKE @search OR SERVER_DB LIKE @search
          )
          ORDER BY EMPNOMBRE, EMPNIT
        `);
      return (result.recordset || []).map(normalizeRow);
    }

    const [rows] = await db.query(
      `SELECT ${fields} FROM COMMUNITY_EMPRESAS_SYNC
       WHERE TOKEN = ?
       AND (? = '%%' OR EMPNIT LIKE ? OR EMPNOMBRE LIKE ?
            OR VPN_CODE LIKE ? OR SERVER_IP LIKE ? OR SERVER_DB LIKE ?)
       ORDER BY EMPNOMBRE, EMPNIT`,
      [token, term, term, term, term, term, term, term]
    );
    return rows.map(normalizeRow);
  });
}

async function createCommunityEmpresa(conexion, data) {
  await ensureCommunityEmpresasSyncTable(conexion);
  const token = (data.TOKEN || '').trim();
  if (!token) throw new Error('TOKEN es obligatorio');

  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('token', sql.VarChar(100), token)
        .input('empnit', sql.VarChar(50), data.EMPNIT || '')
        .input('empnombre', sql.VarChar(200), data.EMPNOMBRE || '')
        .input('vpn', sql.VarChar(100), data.VPN_CODE || '')
        .input('ip', sql.VarChar(200), data.SERVER_IP || '')
        .input('db', sql.VarChar(200), data.SERVER_DB || '')
        .input('user', sql.VarChar(200), data.SERVER_USER || '')
        .input('pass', sql.VarChar(200), data.SERVER_PASS || '')
        .query(`
          INSERT INTO COMMUNITY_EMPRESAS_SYNC
            (TOKEN, EMPNIT, EMPNOMBRE, VPN_CODE, SERVER_IP, SERVER_DB, SERVER_USER, SERVER_PASS)
          OUTPUT INSERTED.ID, INSERTED.TOKEN, INSERTED.EMPNIT, INSERTED.EMPNOMBRE,
                 INSERTED.VPN_CODE, INSERTED.SERVER_IP, INSERTED.SERVER_DB, INSERTED.SERVER_USER, INSERTED.SERVER_PASS
          VALUES (@token, @empnit, @empnombre, @vpn, @ip, @db, @user, @pass)
        `);
      return normalizeRow(result.recordset[0]);
    }

    const [result] = await db.query(
      `INSERT INTO COMMUNITY_EMPRESAS_SYNC
        (TOKEN, EMPNIT, EMPNOMBRE, VPN_CODE, SERVER_IP, SERVER_DB, SERVER_USER, SERVER_PASS)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [token, data.EMPNIT || '', data.EMPNOMBRE || '', data.VPN_CODE || '',
        data.SERVER_IP || '', data.SERVER_DB || '', data.SERVER_USER || '', data.SERVER_PASS || '']
    );
    const [rows] = await db.query(
      'SELECT ID, TOKEN, EMPNIT, EMPNOMBRE, VPN_CODE, SERVER_IP, SERVER_DB, SERVER_USER, SERVER_PASS FROM COMMUNITY_EMPRESAS_SYNC WHERE ID = ?',
      [result.insertId]
    );
    return normalizeRow(rows[0]);
  });
}

async function updateCommunityEmpresa(conexion, id, data) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('id', sql.Int, id)
        .input('token', sql.VarChar(100), data.TOKEN || '')
        .input('empnit', sql.VarChar(50), data.EMPNIT || '')
        .input('empnombre', sql.VarChar(200), data.EMPNOMBRE || '')
        .input('vpn', sql.VarChar(100), data.VPN_CODE || '')
        .input('ip', sql.VarChar(200), data.SERVER_IP || '')
        .input('db', sql.VarChar(200), data.SERVER_DB || '')
        .input('user', sql.VarChar(200), data.SERVER_USER || '')
        .input('pass', sql.VarChar(200), data.SERVER_PASS || '')
        .query(`
          UPDATE COMMUNITY_EMPRESAS_SYNC
          SET TOKEN=@token, EMPNIT=@empnit, EMPNOMBRE=@empnombre, VPN_CODE=@vpn,
              SERVER_IP=@ip, SERVER_DB=@db, SERVER_USER=@user, SERVER_PASS=@pass
          OUTPUT INSERTED.ID, INSERTED.TOKEN, INSERTED.EMPNIT, INSERTED.EMPNOMBRE,
                 INSERTED.VPN_CODE, INSERTED.SERVER_IP, INSERTED.SERVER_DB, INSERTED.SERVER_USER, INSERTED.SERVER_PASS
          WHERE ID = @id
        `);
      if (!result.recordset.length) throw new Error('Registro no encontrado');
      return normalizeRow(result.recordset[0]);
    }

    const [result] = await db.query(
      `UPDATE COMMUNITY_EMPRESAS_SYNC
       SET TOKEN=?, EMPNIT=?, EMPNOMBRE=?, VPN_CODE=?, SERVER_IP=?, SERVER_DB=?, SERVER_USER=?, SERVER_PASS=?
       WHERE ID=?`,
      [data.TOKEN || '', data.EMPNIT || '', data.EMPNOMBRE || '', data.VPN_CODE || '',
        data.SERVER_IP || '', data.SERVER_DB || '', data.SERVER_USER || '', data.SERVER_PASS || '', id]
    );
    if (!result.affectedRows) throw new Error('Registro no encontrado');
    const [rows] = await db.query(
      'SELECT ID, TOKEN, EMPNIT, EMPNOMBRE, VPN_CODE, SERVER_IP, SERVER_DB, SERVER_USER, SERVER_PASS FROM COMMUNITY_EMPRESAS_SYNC WHERE ID = ?',
      [id]
    );
    return normalizeRow(rows[0]);
  });
}

async function deleteCommunityEmpresa(conexion, id) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM COMMUNITY_EMPRESAS_SYNC WHERE ID = @id');
      if (!result.rowsAffected[0]) throw new Error('Registro no encontrado');
      return { ok: true };
    }

    const [result] = await db.query('DELETE FROM COMMUNITY_EMPRESAS_SYNC WHERE ID = ?', [id]);
    if (!result.affectedRows) throw new Error('Registro no encontrado');
    return { ok: true };
  });
}

function mapServicioOnlineRow(row) {
  const normalized = normalizeRow(row);
  return {
    id: String(normalized.ID),
    nombre: normalized.NOMBRE || '',
    url: normalized.URL || '',
    pingIntervalMinutes: normalized.PING_INTERVAL_MINUTES ?? 5,
  };
}

async function ensureServiciosOnlineTable(conexion) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      await db.request().query(`
        IF NOT EXISTS (
          SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SERVICIOS_ONLINE'
        )
        BEGIN
          CREATE TABLE SERVICIOS_ONLINE (
            ID INT IDENTITY(1,1) PRIMARY KEY,
            NOMBRE VARCHAR(200) NOT NULL,
            URL VARCHAR(500) NOT NULL,
            PING_INTERVAL_MINUTES INT NOT NULL DEFAULT 5
          )
        END
      `);
      return;
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS SERVICIOS_ONLINE (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        NOMBRE VARCHAR(200) NOT NULL,
        URL VARCHAR(500) NOT NULL,
        PING_INTERVAL_MINUTES INT NOT NULL DEFAULT 5
      )
    `);
  });
}

async function listServiciosOnline(conexion) {
  await ensureServiciosOnlineTable(conexion);
  return withHostingConnection(conexion, async (db, tipo) => {
    const query = 'SELECT ID, NOMBRE, URL, PING_INTERVAL_MINUTES FROM SERVICIOS_ONLINE ORDER BY ID DESC';
    if (tipo === 'mssql') {
      const result = await db.request().query(query);
      return (result.recordset || []).map(mapServicioOnlineRow);
    }
    const [rows] = await db.query(query);
    return rows.map(mapServicioOnlineRow);
  });
}

async function getServicioOnline(conexion, id) {
  await ensureServiciosOnlineTable(conexion);
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('id', sql.Int, id)
        .query('SELECT ID, NOMBRE, URL, PING_INTERVAL_MINUTES FROM SERVICIOS_ONLINE WHERE ID = @id');
      if (!result.recordset.length) return null;
      return mapServicioOnlineRow(result.recordset[0]);
    }

    const [rows] = await db.query(
      'SELECT ID, NOMBRE, URL, PING_INTERVAL_MINUTES FROM SERVICIOS_ONLINE WHERE ID = ?',
      [id]
    );
    return rows.length ? mapServicioOnlineRow(rows[0]) : null;
  });
}

async function createServicioOnline(conexion, data) {
  await ensureServiciosOnlineTable(conexion);
  const nombre = (data.nombre || 'Sin nombre').trim();
  const url = (data.url || '').trim();
  const pingIntervalMinutes = parseInt(data.pingIntervalMinutes, 10) || 5;

  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('nombre', sql.VarChar(200), nombre)
        .input('url', sql.VarChar(500), url)
        .input('ping', sql.Int, pingIntervalMinutes)
        .query(`
          INSERT INTO SERVICIOS_ONLINE (NOMBRE, URL, PING_INTERVAL_MINUTES)
          OUTPUT INSERTED.ID, INSERTED.NOMBRE, INSERTED.URL, INSERTED.PING_INTERVAL_MINUTES
          VALUES (@nombre, @url, @ping)
        `);
      return mapServicioOnlineRow(result.recordset[0]);
    }

    const [result] = await db.query(
      'INSERT INTO SERVICIOS_ONLINE (NOMBRE, URL, PING_INTERVAL_MINUTES) VALUES (?, ?, ?)',
      [nombre, url, pingIntervalMinutes]
    );
    const [rows] = await db.query(
      'SELECT ID, NOMBRE, URL, PING_INTERVAL_MINUTES FROM SERVICIOS_ONLINE WHERE ID = ?',
      [result.insertId]
    );
    return mapServicioOnlineRow(rows[0]);
  });
}

async function updateServicioOnline(conexion, id, data) {
  await ensureServiciosOnlineTable(conexion);
  const current = await getServicioOnline(conexion, id);
  if (!current) throw new Error('Servicio no encontrado');

  const nombre = data.nombre !== undefined ? String(data.nombre).trim() : current.nombre;
  const url = data.url !== undefined ? String(data.url).trim() : current.url;
  const pingIntervalMinutes = data.pingIntervalMinutes !== undefined
    ? parseInt(data.pingIntervalMinutes, 10) || 5
    : current.pingIntervalMinutes;

  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('id', sql.Int, id)
        .input('nombre', sql.VarChar(200), nombre)
        .input('url', sql.VarChar(500), url)
        .input('ping', sql.Int, pingIntervalMinutes)
        .query(`
          UPDATE SERVICIOS_ONLINE
          SET NOMBRE = @nombre, URL = @url, PING_INTERVAL_MINUTES = @ping
          OUTPUT INSERTED.ID, INSERTED.NOMBRE, INSERTED.URL, INSERTED.PING_INTERVAL_MINUTES
          WHERE ID = @id
        `);
      if (!result.recordset.length) throw new Error('Servicio no encontrado');
      return mapServicioOnlineRow(result.recordset[0]);
    }

    const [result] = await db.query(
      'UPDATE SERVICIOS_ONLINE SET NOMBRE=?, URL=?, PING_INTERVAL_MINUTES=? WHERE ID=?',
      [nombre, url, pingIntervalMinutes, id]
    );
    if (!result.affectedRows) throw new Error('Servicio no encontrado');
    return getServicioOnline(conexion, id);
  });
}

async function deleteServicioOnline(conexion, id) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM SERVICIOS_ONLINE WHERE ID = @id');
      if (!result.rowsAffected[0]) throw new Error('Servicio no encontrado');
      return { ok: true };
    }

    const [result] = await db.query('DELETE FROM SERVICIOS_ONLINE WHERE ID = ?', [id]);
    if (!result.affectedRows) throw new Error('Servicio no encontrado');
    return { ok: true };
  });
}

/** Columnas reales existentes en Hosting: RENDER_CUENTAS / RENDER_APPS. */
const RENDER_CUENTA_FIELDS = 'IDRENDER, EMAIL, PASS, APIKEY';
const RENDER_APP_FIELDS = 'IDSERVICIO, IDRENDER, URL, [USAGE], SERVICEID, DEPLOYHOOK';

async function ensureRenderAppsServiceIdColumn(conexion) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      await db.request().query(`
        IF COL_LENGTH('dbo.RENDER_APPS', 'SERVICEID') IS NULL
        BEGIN
          ALTER TABLE dbo.RENDER_APPS ADD SERVICEID NVARCHAR(120) NULL;
        END
        IF COL_LENGTH('dbo.RENDER_APPS', 'DEPLOYHOOK') IS NULL
        BEGIN
          ALTER TABLE dbo.RENDER_APPS ADD DEPLOYHOOK NVARCHAR(1000) NULL;
        END
      `);
      return;
    }
    const [cols] = await db.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'RENDER_APPS' AND COLUMN_NAME IN ('SERVICEID', 'DEPLOYHOOK')
    `);
    const names = new Set((cols || []).map((c) => String(c.COLUMN_NAME || '').toUpperCase()));
    if (!names.has('SERVICEID')) {
      await db.query('ALTER TABLE RENDER_APPS ADD SERVICEID VARCHAR(120) NULL');
    }
    if (!names.has('DEPLOYHOOK')) {
      await db.query('ALTER TABLE RENDER_APPS ADD DEPLOYHOOK VARCHAR(1000) NULL');
    }
  });
}

function mapRenderCuenta(row) {
  return normalizeRow(row);
}

function mapRenderApp(row) {
  const n = normalizeRow(row);
  return {
    ...n,
    USAGE: n.USAGE == null || n.USAGE === '' ? 0 : Number(n.USAGE),
    SERVICEID: n.SERVICEID == null ? '' : String(n.SERVICEID),
    DEPLOYHOOK: n.DEPLOYHOOK == null ? '' : String(n.DEPLOYHOOK),
  };
}

function parseDeployHook(value) {
  const hook = String(value || '').trim();
  if (!hook) return null;
  if (!/^https?:\/\//i.test(hook)) throw new Error('DEPLOYHOOK debe ser una URL http(s)');
  return hook;
}

function collectDeployHooksByServiceId(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const serviceId = String(row.SERVICEID || '').trim();
    const hook = String(row.DEPLOYHOOK || '').trim();
    if (serviceId && hook) map.set(serviceId, hook);
  }
  return map;
}

function parseUsageValue(value) {
  if (value === '' || value == null) return 0;
  const num = Number(value);
  if (!Number.isFinite(num)) throw new Error('USAGE debe ser numérico');
  return num;
}

async function listRenderCuentas(conexion) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request().query(
        `SELECT ${RENDER_CUENTA_FIELDS} FROM RENDER_CUENTAS ORDER BY EMAIL, IDRENDER`
      );
      return (result.recordset || []).map(mapRenderCuenta);
    }
    const [rows] = await db.query(
      `SELECT ${RENDER_CUENTA_FIELDS} FROM RENDER_CUENTAS ORDER BY EMAIL, IDRENDER`
    );
    return rows.map(mapRenderCuenta);
  });
}

async function getRenderCuenta(conexion, id) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('id', sql.Int, id)
        .query(`SELECT ${RENDER_CUENTA_FIELDS} FROM RENDER_CUENTAS WHERE IDRENDER = @id`);
      if (!result.recordset.length) throw new Error('Cuenta Render no encontrada');
      return mapRenderCuenta(result.recordset[0]);
    }
    const [rows] = await db.query(
      `SELECT ${RENDER_CUENTA_FIELDS} FROM RENDER_CUENTAS WHERE IDRENDER = ?`,
      [id]
    );
    if (!rows.length) throw new Error('Cuenta Render no encontrada');
    return mapRenderCuenta(rows[0]);
  });
}

async function createRenderCuenta(conexion, data) {
  const email = (data.EMAIL || '').trim();
  if (!email) throw new Error('EMAIL es obligatorio');

  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('email', sql.VarChar(250), email)
        .input('pass', sql.VarChar(150), data.PASS || '')
        .input('apikey', sql.NVarChar(500), data.APIKEY || '')
        .query(`
          INSERT INTO RENDER_CUENTAS (EMAIL, PASS, APIKEY)
          OUTPUT INSERTED.IDRENDER, INSERTED.EMAIL, INSERTED.PASS, INSERTED.APIKEY
          VALUES (@email, @pass, @apikey)
        `);
      return mapRenderCuenta(result.recordset[0]);
    }

    const [result] = await db.query(
      'INSERT INTO RENDER_CUENTAS (EMAIL, PASS, APIKEY) VALUES (?, ?, ?)',
      [email, data.PASS || '', data.APIKEY || '']
    );
    const [rows] = await db.query(
      `SELECT ${RENDER_CUENTA_FIELDS} FROM RENDER_CUENTAS WHERE IDRENDER = ?`,
      [result.insertId]
    );
    return mapRenderCuenta(rows[0]);
  });
}

async function updateRenderCuenta(conexion, id, data) {
  const email = (data.EMAIL || '').trim();
  if (!email) throw new Error('EMAIL es obligatorio');

  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('id', sql.Int, id)
        .input('email', sql.VarChar(250), email)
        .input('pass', sql.VarChar(150), data.PASS || '')
        .input('apikey', sql.NVarChar(500), data.APIKEY || '')
        .query(`
          UPDATE RENDER_CUENTAS
          SET EMAIL=@email, PASS=@pass, APIKEY=@apikey
          OUTPUT INSERTED.IDRENDER, INSERTED.EMAIL, INSERTED.PASS, INSERTED.APIKEY
          WHERE IDRENDER = @id
        `);
      if (!result.recordset.length) throw new Error('Cuenta Render no encontrada');
      return mapRenderCuenta(result.recordset[0]);
    }

    const [result] = await db.query(
      'UPDATE RENDER_CUENTAS SET EMAIL=?, PASS=?, APIKEY=? WHERE IDRENDER=?',
      [email, data.PASS || '', data.APIKEY || '', id]
    );
    if (!result.affectedRows) throw new Error('Cuenta Render no encontrada');
    const [rows] = await db.query(
      `SELECT ${RENDER_CUENTA_FIELDS} FROM RENDER_CUENTAS WHERE IDRENDER = ?`,
      [id]
    );
    return mapRenderCuenta(rows[0]);
  });
}

async function deleteRenderCuenta(conexion, id) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      await db.request().input('id', sql.Int, id).query('DELETE FROM RENDER_APPS WHERE IDRENDER = @id');
      const result = await db.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM RENDER_CUENTAS WHERE IDRENDER = @id');
      if (!result.rowsAffected[0]) throw new Error('Cuenta Render no encontrada');
      return { ok: true };
    }

    await db.query('DELETE FROM RENDER_APPS WHERE IDRENDER = ?', [id]);
    const [result] = await db.query('DELETE FROM RENDER_CUENTAS WHERE IDRENDER = ?', [id]);
    if (!result.affectedRows) throw new Error('Cuenta Render no encontrada');
    return { ok: true };
  });
}

async function listRenderApps(conexion, idRender, search = '') {
  await ensureRenderAppsServiceIdColumn(conexion);
  const term = `%${(search || '').trim()}%`;

  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('idRender', sql.Int, idRender)
        .input('search', sql.VarChar(200), term)
        .query(`
          SELECT ${RENDER_APP_FIELDS} FROM RENDER_APPS
          WHERE IDRENDER = @idRender
          AND (
            @search = '%%' OR URL LIKE @search
            OR CAST(IDSERVICIO AS VARCHAR(20)) LIKE @search
            OR CAST([USAGE] AS VARCHAR(50)) LIKE @search
            OR ISNULL(SERVICEID, '') LIKE @search
            OR ISNULL(DEPLOYHOOK, '') LIKE @search
          )
          ORDER BY IDSERVICIO
        `);
      return (result.recordset || []).map(mapRenderApp);
    }

    const [rows] = await db.query(
      `SELECT IDSERVICIO, IDRENDER, URL, \`USAGE\` AS \`USAGE\`, SERVICEID, DEPLOYHOOK FROM RENDER_APPS
       WHERE IDRENDER = ?
       AND (
         ? = '%%' OR URL LIKE ? OR CAST(IDSERVICIO AS CHAR) LIKE ?
         OR CAST(\`USAGE\` AS CHAR) LIKE ? OR IFNULL(SERVICEID, '') LIKE ?
         OR IFNULL(DEPLOYHOOK, '') LIKE ?
       )
       ORDER BY IDSERVICIO`,
      [idRender, term, term, term, term, term, term]
    );
    return rows.map(mapRenderApp);
  });
}

async function listRenderAppsAll(conexion, search = '') {
  await ensureRenderAppsServiceIdColumn(conexion);
  const q = (search || '').trim();
  if (!q) return [];
  const term = `%${q}%`;

  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('search', sql.VarChar(250), term)
        .query(`
          SELECT
            a.IDSERVICIO,
            a.IDRENDER,
            a.URL,
            a.[USAGE],
            a.SERVICEID,
            a.DEPLOYHOOK,
            c.EMAIL AS CUENTA_EMAIL
          FROM RENDER_APPS a
          LEFT JOIN RENDER_CUENTAS c ON c.IDRENDER = a.IDRENDER
          WHERE a.URL LIKE @search
             OR c.EMAIL LIKE @search
             OR CAST(a.IDSERVICIO AS VARCHAR(20)) LIKE @search
             OR CAST(a.IDRENDER AS VARCHAR(20)) LIKE @search
             OR CAST(a.[USAGE] AS VARCHAR(50)) LIKE @search
             OR ISNULL(a.SERVICEID, '') LIKE @search
             OR ISNULL(a.DEPLOYHOOK, '') LIKE @search
          ORDER BY c.EMAIL, a.URL
        `);
      return (result.recordset || []).map((row) => ({
        ...mapRenderApp(row),
        CUENTA_EMAIL: row.CUENTA_EMAIL || '',
      }));
    }

    const [rows] = await db.query(
      `SELECT
         a.IDSERVICIO,
         a.IDRENDER,
         a.URL,
         a.\`USAGE\` AS \`USAGE\`,
         a.SERVICEID,
         a.DEPLOYHOOK,
         c.EMAIL AS CUENTA_EMAIL
       FROM RENDER_APPS a
       LEFT JOIN RENDER_CUENTAS c ON c.IDRENDER = a.IDRENDER
       WHERE a.URL LIKE ?
          OR c.EMAIL LIKE ?
          OR CAST(a.IDSERVICIO AS CHAR) LIKE ?
          OR CAST(a.IDRENDER AS CHAR) LIKE ?
          OR CAST(a.\`USAGE\` AS CHAR) LIKE ?
          OR IFNULL(a.SERVICEID, '') LIKE ?
          OR IFNULL(a.DEPLOYHOOK, '') LIKE ?
       ORDER BY c.EMAIL, a.URL`,
      [term, term, term, term, term, term, term]
    );
    return rows.map((row) => ({
      ...mapRenderApp(row),
      CUENTA_EMAIL: row.CUENTA_EMAIL || '',
    }));
  });
}

async function getRenderApp(conexion, id) {
  await ensureRenderAppsServiceIdColumn(conexion);
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('id', sql.Int, id)
        .query(`SELECT ${RENDER_APP_FIELDS} FROM RENDER_APPS WHERE IDSERVICIO = @id`);
      if (!result.recordset.length) throw new Error('App Render no encontrada');
      return mapRenderApp(result.recordset[0]);
    }
    const [rows] = await db.query(
      'SELECT IDSERVICIO, IDRENDER, URL, `USAGE` AS `USAGE`, SERVICEID, DEPLOYHOOK FROM RENDER_APPS WHERE IDSERVICIO = ?',
      [id]
    );
    if (!rows.length) throw new Error('App Render no encontrada');
    return mapRenderApp(rows[0]);
  });
}

async function createRenderApp(conexion, data) {
  await ensureRenderAppsServiceIdColumn(conexion);
  const idRender = parseInt(data.IDRENDER, 10);
  if (!Number.isFinite(idRender)) throw new Error('IDRENDER es obligatorio');
  const usage = parseUsageValue(data.USAGE);
  const serviceId = String(data.SERVICEID || '').trim();
  const deployHook = parseDeployHook(data.DEPLOYHOOK);

  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('idRender', sql.Int, idRender)
        .input('url', sql.VarChar(500), data.URL || '')
        .input('usage', sql.Decimal(18, 4), usage)
        .input('serviceId', sql.NVarChar(120), serviceId || null)
        .input('deployHook', sql.NVarChar(1000), deployHook)
        .query(`
          INSERT INTO RENDER_APPS (IDRENDER, URL, [USAGE], SERVICEID, DEPLOYHOOK)
          OUTPUT INSERTED.IDSERVICIO, INSERTED.IDRENDER, INSERTED.URL, INSERTED.[USAGE], INSERTED.SERVICEID, INSERTED.DEPLOYHOOK
          VALUES (@idRender, @url, @usage, @serviceId, @deployHook)
        `);
      return mapRenderApp(result.recordset[0]);
    }

    const [result] = await db.query(
      'INSERT INTO RENDER_APPS (IDRENDER, URL, `USAGE`, SERVICEID, DEPLOYHOOK) VALUES (?, ?, ?, ?, ?)',
      [idRender, data.URL || '', usage, serviceId || null, deployHook]
    );
    const [rows] = await db.query(
      'SELECT IDSERVICIO, IDRENDER, URL, `USAGE` AS `USAGE`, SERVICEID, DEPLOYHOOK FROM RENDER_APPS WHERE IDSERVICIO = ?',
      [result.insertId]
    );
    return mapRenderApp(rows[0]);
  });
}

async function updateRenderApp(conexion, id, data) {
  await ensureRenderAppsServiceIdColumn(conexion);
  const idRender = parseInt(data.IDRENDER, 10);
  if (!Number.isFinite(idRender)) throw new Error('IDRENDER es obligatorio');
  const usage = parseUsageValue(data.USAGE);
  const serviceId = String(data.SERVICEID || '').trim();
  const deployHook = parseDeployHook(data.DEPLOYHOOK);

  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('id', sql.Int, id)
        .input('idRender', sql.Int, idRender)
        .input('url', sql.VarChar(500), data.URL || '')
        .input('usage', sql.Decimal(18, 4), usage)
        .input('serviceId', sql.NVarChar(120), serviceId || null)
        .input('deployHook', sql.NVarChar(1000), deployHook)
        .query(`
          UPDATE RENDER_APPS
          SET IDRENDER=@idRender, URL=@url, [USAGE]=@usage, SERVICEID=@serviceId, DEPLOYHOOK=@deployHook
          OUTPUT INSERTED.IDSERVICIO, INSERTED.IDRENDER, INSERTED.URL, INSERTED.[USAGE], INSERTED.SERVICEID, INSERTED.DEPLOYHOOK
          WHERE IDSERVICIO = @id
        `);
      if (!result.recordset.length) throw new Error('App Render no encontrada');
      return mapRenderApp(result.recordset[0]);
    }

    const [result] = await db.query(
      'UPDATE RENDER_APPS SET IDRENDER=?, URL=?, `USAGE`=?, SERVICEID=?, DEPLOYHOOK=? WHERE IDSERVICIO=?',
      [idRender, data.URL || '', usage, serviceId || null, deployHook, id]
    );
    if (!result.affectedRows) throw new Error('App Render no encontrada');
    const [rows] = await db.query(
      'SELECT IDSERVICIO, IDRENDER, URL, `USAGE` AS `USAGE`, SERVICEID, DEPLOYHOOK FROM RENDER_APPS WHERE IDSERVICIO = ?',
      [id]
    );
    return mapRenderApp(rows[0]);
  });
}

async function deleteRenderAppsByCuenta(conexion, idRender) {
  await ensureRenderAppsServiceIdColumn(conexion);
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('idRender', sql.Int, idRender)
        .query('DELETE FROM RENDER_APPS WHERE IDRENDER = @idRender');
      return { ok: true, deleted: result.rowsAffected?.[0] || 0 };
    }
    const [result] = await db.query('DELETE FROM RENDER_APPS WHERE IDRENDER = ?', [idRender]);
    return { ok: true, deleted: result.affectedRows || 0 };
  });
}

/**
 * Reemplaza todas las apps de una cuenta con la lista de webapps (URL + SERVICEID).
 * Conserva DEPLOYHOOK cuando el SERVICEID coincide.
 */
async function replaceRenderAppsForCuenta(conexion, idRender, webapps = []) {
  await ensureRenderAppsServiceIdColumn(conexion);
  const apps = Array.isArray(webapps) ? webapps : [];

  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const tx = new sql.Transaction(db);
      await tx.begin();
      try {
        const prev = await new sql.Request(tx)
          .input('idRender', sql.Int, idRender)
          .query('SELECT SERVICEID, DEPLOYHOOK FROM RENDER_APPS WHERE IDRENDER = @idRender');
        const hooksByService = collectDeployHooksByServiceId(prev.recordset);

        await new sql.Request(tx)
          .input('idRender', sql.Int, idRender)
          .query('DELETE FROM RENDER_APPS WHERE IDRENDER = @idRender');

        for (const app of apps) {
          const url = String(app.url || app.URL || '').trim();
          const serviceId = String(app.serviceId || app.SERVICEID || '').trim();
          if (!url && !serviceId) continue;
          const deployHook = serviceId ? (hooksByService.get(serviceId) || null) : null;
          await new sql.Request(tx)
            .input('idRender', sql.Int, idRender)
            .input('url', sql.VarChar(500), url)
            .input('usage', sql.Decimal(18, 4), 0)
            .input('serviceId', sql.NVarChar(120), serviceId || null)
            .input('deployHook', sql.NVarChar(1000), deployHook)
            .query(`
              INSERT INTO RENDER_APPS (IDRENDER, URL, [USAGE], SERVICEID, DEPLOYHOOK)
              VALUES (@idRender, @url, @usage, @serviceId, @deployHook)
            `);
        }
        await tx.commit();
      } catch (err) {
        try { await tx.rollback(); } catch { /* ignore */ }
        throw err;
      }
    } else {
      await db.beginTransaction();
      try {
        const [prev] = await db.query(
          'SELECT SERVICEID, DEPLOYHOOK FROM RENDER_APPS WHERE IDRENDER = ?',
          [idRender]
        );
        const hooksByService = collectDeployHooksByServiceId(prev);

        await db.query('DELETE FROM RENDER_APPS WHERE IDRENDER = ?', [idRender]);
        for (const app of apps) {
          const url = String(app.url || app.URL || '').trim();
          const serviceId = String(app.serviceId || app.SERVICEID || '').trim();
          if (!url && !serviceId) continue;
          const deployHook = serviceId ? (hooksByService.get(serviceId) || null) : null;
          await db.query(
            'INSERT INTO RENDER_APPS (IDRENDER, URL, `USAGE`, SERVICEID, DEPLOYHOOK) VALUES (?, ?, ?, ?, ?)',
            [idRender, url, 0, serviceId || null, deployHook]
          );
        }
        await db.commit();
      } catch (err) {
        try { await db.rollback(); } catch { /* ignore */ }
        throw err;
      }
    }

    return null;
  }).then(async () => listRenderApps(conexion, idRender, ''));
}

async function deleteRenderApp(conexion, id) {
  await ensureRenderAppsServiceIdColumn(conexion);
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM RENDER_APPS WHERE IDSERVICIO = @id');
      if (!result.rowsAffected[0]) throw new Error('App Render no encontrada');
      return { ok: true };
    }

    const [result] = await db.query('DELETE FROM RENDER_APPS WHERE IDSERVICIO = ?', [id]);
    if (!result.affectedRows) throw new Error('App Render no encontrada');
    return { ok: true };
  });
}

module.exports = {
  withHostingConnection,
  ensureSoporteTable,
  listSoporteAnydesk,
  listTokens,
  createSoporteAnydesk,
  updateSoporteAnydesk,
  deleteSoporteAnydesk,
  listUpdateQueries,
  createUpdateQuery,
  updateUpdateQuery,
  deleteUpdateQuery,
  todayIsoDate,
  listTokensAdmin,
  uploadTokenLicencia,
  getTokenLicencia,
  createTokenAdmin,
  updateTokenAdmin,
  toggleTokenActivo,
  deleteTokenAdmin,
  listCommunityEmpresas,
  createCommunityEmpresa,
  updateCommunityEmpresa,
  deleteCommunityEmpresa,
  ensureServiciosOnlineTable,
  listServiciosOnline,
  getServicioOnline,
  createServicioOnline,
  updateServicioOnline,
  deleteServicioOnline,
  listRenderCuentas,
  getRenderCuenta,
  createRenderCuenta,
  updateRenderCuenta,
  deleteRenderCuenta,
  listRenderApps,
  listRenderAppsAll,
  getRenderApp,
  createRenderApp,
  updateRenderApp,
  deleteRenderApp,
  deleteRenderAppsByCuenta,
  replaceRenderAppsForCuenta,
};
