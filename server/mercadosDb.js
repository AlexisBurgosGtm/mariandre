const sql = require('mssql');
const { withHostingConnection } = require('./hostingDb');

const TABLE = 'me_sucursales';
const SELECT_COLS =
  'CODSUCURSAL, NOMBRE, ENCARGADO, COLOR, HOST, [U], [P], [DB]';

function normalizeRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

function pickBody(data) {
  return {
    CODSUCURSAL: String(data?.CODSUCURSAL ?? '').trim(),
    NOMBRE: String(data?.NOMBRE ?? '').trim(),
    ENCARGADO: String(data?.ENCARGADO ?? '').trim(),
    COLOR: String(data?.COLOR ?? '').trim(),
    HOST: String(data?.HOST ?? '').trim(),
    U: String(data?.U ?? '').trim(),
    P: String(data?.P ?? '').trim(),
    DB: String(data?.DB ?? '').trim(),
  };
}

async function listMeSucursales(conexion) {
  return withHostingConnection(conexion, async (db, tipo) => {
    const query = `SELECT ${SELECT_COLS} FROM ${TABLE} ORDER BY CODSUCURSAL`;
    if (tipo === 'mssql') {
      const result = await db.request().query(query);
      return (result.recordset || []).map(normalizeRow);
    }
    const [rows] = await db.query(
      'SELECT CODSUCURSAL, NOMBRE, ENCARGADO, COLOR, HOST, U, P, DB FROM me_sucursales ORDER BY CODSUCURSAL'
    );
    return rows.map(normalizeRow);
  });
}

async function getMeSucursal(conexion, codsucursal) {
  const cod = String(codsucursal || '').trim();
  if (!cod) throw new Error('CODSUCURSAL requerido');

  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db
        .request()
        .input('cod', sql.VarChar(50), cod)
        .query(`SELECT ${SELECT_COLS} FROM ${TABLE} WHERE CODSUCURSAL = @cod`);
      if (!result.recordset?.length) throw new Error('Sucursal no encontrada');
      return normalizeRow(result.recordset[0]);
    }
    const [rows] = await db.query(
      'SELECT CODSUCURSAL, NOMBRE, ENCARGADO, COLOR, HOST, U, P, DB FROM me_sucursales WHERE CODSUCURSAL = ?',
      [cod]
    );
    if (!rows?.length) throw new Error('Sucursal no encontrada');
    return normalizeRow(rows[0]);
  });
}

async function createMeSucursal(conexion, data) {
  const body = pickBody(data);
  if (!body.CODSUCURSAL) throw new Error('CODSUCURSAL es obligatorio');

  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const dup = await db
        .request()
        .input('cod', sql.VarChar(50), body.CODSUCURSAL)
        .query(`SELECT 1 AS ok FROM ${TABLE} WHERE CODSUCURSAL = @cod`);
      if (dup.recordset?.length) throw new Error('Ya existe una sucursal con ese código');

      const result = await db
        .request()
        .input('cod', sql.VarChar(50), body.CODSUCURSAL)
        .input('nombre', sql.VarChar(150), body.NOMBRE || null)
        .input('encargado', sql.VarChar(50), body.ENCARGADO || null)
        .input('color', sql.VarChar(10), body.COLOR || null)
        .input('host', sql.VarChar(255), body.HOST || null)
        .input('u', sql.VarChar(50), body.U || null)
        .input('p', sql.VarChar(50), body.P || null)
        .input('db', sql.VarChar(50), body.DB || null)
        .query(`
          INSERT INTO ${TABLE} (CODSUCURSAL, NOMBRE, ENCARGADO, COLOR, HOST, [U], [P], [DB])
          OUTPUT INSERTED.CODSUCURSAL, INSERTED.NOMBRE, INSERTED.ENCARGADO, INSERTED.COLOR,
                 INSERTED.HOST, INSERTED.[U], INSERTED.[P], INSERTED.[DB]
          VALUES (@cod, @nombre, @encargado, @color, @host, @u, @p, @db)
        `);
      return normalizeRow(result.recordset[0]);
    }

    const [dup] = await db.query('SELECT 1 AS ok FROM me_sucursales WHERE CODSUCURSAL = ? LIMIT 1', [
      body.CODSUCURSAL,
    ]);
    if (dup?.length) throw new Error('Ya existe una sucursal con ese código');

    await db.query(
      `INSERT INTO me_sucursales (CODSUCURSAL, NOMBRE, ENCARGADO, COLOR, HOST, U, P, DB)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.CODSUCURSAL,
        body.NOMBRE || null,
        body.ENCARGADO || null,
        body.COLOR || null,
        body.HOST || null,
        body.U || null,
        body.P || null,
        body.DB || null,
      ]
    );
    return getMeSucursal(conexion, body.CODSUCURSAL);
  });
}

async function updateMeSucursal(conexion, codsucursal, data) {
  const cod = String(codsucursal || '').trim();
  if (!cod) throw new Error('CODSUCURSAL inválido');
  const body = pickBody(data);

  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db
        .request()
        .input('cod', sql.VarChar(50), cod)
        .input('nombre', sql.VarChar(150), body.NOMBRE || null)
        .input('encargado', sql.VarChar(50), body.ENCARGADO || null)
        .input('color', sql.VarChar(10), body.COLOR || null)
        .input('host', sql.VarChar(255), body.HOST || null)
        .input('u', sql.VarChar(50), body.U || null)
        .input('p', sql.VarChar(50), body.P || null)
        .input('db', sql.VarChar(50), body.DB || null)
        .query(`
          UPDATE ${TABLE}
          SET NOMBRE = @nombre, ENCARGADO = @encargado, COLOR = @color,
              HOST = @host, [U] = @u, [P] = @p, [DB] = @db
          OUTPUT INSERTED.CODSUCURSAL, INSERTED.NOMBRE, INSERTED.ENCARGADO, INSERTED.COLOR,
                 INSERTED.HOST, INSERTED.[U], INSERTED.[P], INSERTED.[DB]
          WHERE CODSUCURSAL = @cod
        `);
      if (!result.recordset?.length) throw new Error('Sucursal no encontrada');
      return normalizeRow(result.recordset[0]);
    }

    const [result] = await db.query(
      `UPDATE me_sucursales
       SET NOMBRE=?, ENCARGADO=?, COLOR=?, HOST=?, U=?, P=?, DB=?
       WHERE CODSUCURSAL=?`,
      [
        body.NOMBRE || null,
        body.ENCARGADO || null,
        body.COLOR || null,
        body.HOST || null,
        body.U || null,
        body.P || null,
        body.DB || null,
        cod,
      ]
    );
    if (!result.affectedRows) throw new Error('Sucursal no encontrada');
    return getMeSucursal(conexion, cod);
  });
}

async function deleteMeSucursal(conexion, codsucursal) {
  const cod = String(codsucursal || '').trim();
  if (!cod) throw new Error('CODSUCURSAL inválido');

  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db
        .request()
        .input('cod', sql.VarChar(50), cod)
        .query(`DELETE FROM ${TABLE} WHERE CODSUCURSAL = @cod`);
      if (!result.rowsAffected[0]) throw new Error('Sucursal no encontrada');
      return { ok: true };
    }
    const [result] = await db.query('DELETE FROM me_sucursales WHERE CODSUCURSAL = ?', [cod]);
    if (!result.affectedRows) throw new Error('Sucursal no encontrada');
    return { ok: true };
  });
}

const TABLE_USUARIOS = 'me_usuarios';
const USUARIOS_SELECT = `
  ID, EMP_NIT, CODUSUARIO, NOMBRE, PASS, TIPO, TELEFONO, CODDOC, CODSUCURSAL,
  CORRELATIVO, OBJETIVOMES, FECHA, CODRUTA, CODCATALOGO
`;

function pickUsuarioBody(data) {
  const codsucursal = String(data?.CODSUCURSAL ?? '').trim();
  return {
    CODSUCURSAL: codsucursal,
    EMP_NIT: codsucursal,
    CODUSUARIO: data?.CODUSUARIO != null && data.CODUSUARIO !== '' ? Number(data.CODUSUARIO) : null,
    NOMBRE: String(data?.NOMBRE ?? '').trim(),
    PASS: String(data?.PASS ?? '').trim(),
    TIPO: String(data?.TIPO ?? '').trim(),
    TELEFONO: String(data?.TELEFONO ?? '').trim(),
    CODDOC: String(data?.CODDOC ?? '').trim(),
    CORRELATIVO: data?.CORRELATIVO != null && data.CORRELATIVO !== '' ? Number(data.CORRELATIVO) : null,
    OBJETIVOMES: data?.OBJETIVOMES != null && data.OBJETIVOMES !== '' ? Number(data.OBJETIVOMES) : null,
    FECHA: data?.FECHA ? String(data.FECHA).slice(0, 10) : null,
    CODRUTA: data?.CODRUTA != null && data.CODRUTA !== '' ? Number(data.CODRUTA) : null,
    CODCATALOGO: String(data?.CODCATALOGO ?? '').trim(),
  };
}

async function listMeUsuarios(conexion, { codsucursal = '' } = {}) {
  const filter = String(codsucursal || '').trim();
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const req = db.request();
      let where = '';
      if (filter) {
        req.input('codsucursal', sql.VarChar(50), filter);
        where = ' WHERE CODSUCURSAL = @codsucursal';
      }
      const result = await req.query(
        `SELECT ${USUARIOS_SELECT} FROM ${TABLE_USUARIOS}${where} ORDER BY CODSUCURSAL, NOMBRE, ID`,
      );
      return (result.recordset || []).map(normalizeRow);
    }
    const params = [];
    let where = '';
    if (filter) {
      where = ' WHERE CODSUCURSAL = ?';
      params.push(filter);
    }
    const [rows] = await db.query(
      `SELECT ID, EMP_NIT, CODUSUARIO, NOMBRE, PASS, TIPO, TELEFONO, CODDOC, CODSUCURSAL,
              CORRELATIVO, OBJETIVOMES, FECHA, CODRUTA, CODCATALOGO
       FROM me_usuarios${where} ORDER BY CODSUCURSAL, NOMBRE, ID`,
      params,
    );
    return rows.map(normalizeRow);
  });
}

async function getMeUsuario(conexion, id) {
  const numId = Number(id);
  if (!Number.isFinite(numId)) throw new Error('ID inválido');

  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db
        .request()
        .input('id', sql.Int, numId)
        .query(`SELECT ${USUARIOS_SELECT} FROM ${TABLE_USUARIOS} WHERE ID = @id`);
      if (!result.recordset?.length) throw new Error('Usuario no encontrado');
      return normalizeRow(result.recordset[0]);
    }
    const [rows] = await db.query(
      `SELECT ID, EMP_NIT, CODUSUARIO, NOMBRE, PASS, TIPO, TELEFONO, CODDOC, CODSUCURSAL,
              CORRELATIVO, OBJETIVOMES, FECHA, CODRUTA, CODCATALOGO
       FROM me_usuarios WHERE ID = ?`,
      [numId],
    );
    if (!rows?.length) throw new Error('Usuario no encontrado');
    return normalizeRow(rows[0]);
  });
}

async function createMeUsuario(conexion, data) {
  const body = pickUsuarioBody(data);
  if (!body.CODSUCURSAL) throw new Error('Sucursal (CODSUCURSAL) es obligatoria');

  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db
        .request()
        .input('emp_nit', sql.VarChar(20), body.EMP_NIT || null)
        .input('codusuario', sql.Int, body.CODUSUARIO)
        .input('nombre', sql.VarChar(50), body.NOMBRE || null)
        .input('pass', sql.VarChar(50), body.PASS || null)
        .input('tipo', sql.VarChar(10), body.TIPO || null)
        .input('telefono', sql.VarChar(8), body.TELEFONO || null)
        .input('coddoc', sql.VarChar(5), body.CODDOC || null)
        .input('codsucursal', sql.VarChar(50), body.CODSUCURSAL || null)
        .input('correlativo', sql.Int, body.CORRELATIVO)
        .input('objetivomes', sql.Float, body.OBJETIVOMES)
        .input('fecha', sql.Date, body.FECHA || null)
        .input('codruta', sql.Int, body.CODRUTA)
        .input('codcatalogo', sql.VarChar(5), body.CODCATALOGO || null)
        .query(`
          INSERT INTO ${TABLE_USUARIOS} (
            EMP_NIT, CODUSUARIO, NOMBRE, PASS, TIPO, TELEFONO, CODDOC, CODSUCURSAL,
            LAT, [LONG], HORAMIN, CORRELATIVO, OBJETIVOMES, FECHA, CODRUTA, CODCATALOGO
          )
          OUTPUT INSERTED.ID, INSERTED.EMP_NIT, INSERTED.CODUSUARIO, INSERTED.NOMBRE, INSERTED.PASS,
                 INSERTED.TIPO, INSERTED.TELEFONO, INSERTED.CODDOC, INSERTED.CODSUCURSAL,
                 INSERTED.CORRELATIVO, INSERTED.OBJETIVOMES, INSERTED.FECHA, INSERTED.CODRUTA, INSERTED.CODCATALOGO
          VALUES (
            @emp_nit, @codusuario, @nombre, @pass, @tipo, @telefono, @coddoc, @codsucursal,
            0, 0, '00:00', @correlativo, @objetivomes, @fecha, @codruta, @codcatalogo
          )
        `);
      return normalizeRow(result.recordset[0]);
    }

    const [result] = await db.query(
      `INSERT INTO me_usuarios (
         EMP_NIT, CODUSUARIO, NOMBRE, PASS, TIPO, TELEFONO, CODDOC, CODSUCURSAL,
         LAT, \`LONG\`, HORAMIN, CORRELATIVO, OBJETIVOMES, FECHA, CODRUTA, CODCATALOGO
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, '00:00', ?, ?, ?, ?, ?)`,
      [
        body.EMP_NIT || null,
        body.CODUSUARIO,
        body.NOMBRE || null,
        body.PASS || null,
        body.TIPO || null,
        body.TELEFONO || null,
        body.CODDOC || null,
        body.CODSUCURSAL || null,
        body.CORRELATIVO,
        body.OBJETIVOMES,
        body.FECHA || null,
        body.CODRUTA,
        body.CODCATALOGO || null,
      ],
    );
    return getMeUsuario(conexion, result.insertId);
  });
}

async function updateMeUsuario(conexion, id, data) {
  const numId = Number(id);
  if (!Number.isFinite(numId)) throw new Error('ID inválido');
  const body = pickUsuarioBody(data);
  if (!body.CODSUCURSAL) throw new Error('Sucursal (CODSUCURSAL) es obligatoria');

  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db
        .request()
        .input('id', sql.Int, numId)
        .input('emp_nit', sql.VarChar(20), body.EMP_NIT || null)
        .input('codusuario', sql.Int, body.CODUSUARIO)
        .input('nombre', sql.VarChar(50), body.NOMBRE || null)
        .input('pass', sql.VarChar(50), body.PASS || null)
        .input('tipo', sql.VarChar(10), body.TIPO || null)
        .input('telefono', sql.VarChar(8), body.TELEFONO || null)
        .input('coddoc', sql.VarChar(5), body.CODDOC || null)
        .input('codsucursal', sql.VarChar(50), body.CODSUCURSAL || null)
        .input('correlativo', sql.Int, body.CORRELATIVO)
        .input('objetivomes', sql.Float, body.OBJETIVOMES)
        .input('fecha', sql.Date, body.FECHA || null)
        .input('codruta', sql.Int, body.CODRUTA)
        .input('codcatalogo', sql.VarChar(5), body.CODCATALOGO || null)
        .query(`
          UPDATE ${TABLE_USUARIOS}
          SET EMP_NIT = @emp_nit, CODUSUARIO = @codusuario, NOMBRE = @nombre, PASS = @pass,
              TIPO = @tipo, TELEFONO = @telefono, CODDOC = @coddoc, CODSUCURSAL = @codsucursal,
              CORRELATIVO = @correlativo, OBJETIVOMES = @objetivomes, FECHA = @fecha,
              CODRUTA = @codruta, CODCATALOGO = @codcatalogo
          OUTPUT INSERTED.ID, INSERTED.EMP_NIT, INSERTED.CODUSUARIO, INSERTED.NOMBRE, INSERTED.PASS,
                 INSERTED.TIPO, INSERTED.TELEFONO, INSERTED.CODDOC, INSERTED.CODSUCURSAL,
                 INSERTED.CORRELATIVO, INSERTED.OBJETIVOMES, INSERTED.FECHA, INSERTED.CODRUTA, INSERTED.CODCATALOGO
          WHERE ID = @id
        `);
      if (!result.recordset?.length) throw new Error('Usuario no encontrado');
      return normalizeRow(result.recordset[0]);
    }

    const [result] = await db.query(
      `UPDATE me_usuarios SET
         EMP_NIT=?, CODUSUARIO=?, NOMBRE=?, PASS=?, TIPO=?, TELEFONO=?, CODDOC=?, CODSUCURSAL=?,
         CORRELATIVO=?, OBJETIVOMES=?, FECHA=?, CODRUTA=?, CODCATALOGO=?
       WHERE ID=?`,
      [
        body.EMP_NIT || null,
        body.CODUSUARIO,
        body.NOMBRE || null,
        body.PASS || null,
        body.TIPO || null,
        body.TELEFONO || null,
        body.CODDOC || null,
        body.CODSUCURSAL || null,
        body.CORRELATIVO,
        body.OBJETIVOMES,
        body.FECHA || null,
        body.CODRUTA,
        body.CODCATALOGO || null,
        numId,
      ],
    );
    if (!result.affectedRows) throw new Error('Usuario no encontrado');
    return getMeUsuario(conexion, numId);
  });
}

async function deleteMeUsuario(conexion, id) {
  const numId = Number(id);
  if (!Number.isFinite(numId)) throw new Error('ID inválido');

  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request().input('id', sql.Int, numId).query(`DELETE FROM ${TABLE_USUARIOS} WHERE ID = @id`);
      if (!result.rowsAffected[0]) throw new Error('Usuario no encontrado');
      return { ok: true };
    }
    const [result] = await db.query('DELETE FROM me_usuarios WHERE ID = ?', [numId]);
    if (!result.affectedRows) throw new Error('Usuario no encontrado');
    return { ok: true };
  });
}

module.exports = {
  listMeSucursales,
  getMeSucursal,
  createMeSucursal,
  updateMeSucursal,
  deleteMeSucursal,
  listMeUsuarios,
  getMeUsuario,
  createMeUsuario,
  updateMeUsuario,
  deleteMeUsuario,
};
