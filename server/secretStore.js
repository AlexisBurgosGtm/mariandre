/**
 * Lectura y escritura cifrada de archivos locales sensibles.
 * AES-256-GCM (crypto de Node). La llave no viaja en el repositorio:
 * archivo DATA_DIR/.mariandre-key, o variable MARIANDRE_DATA_KEY.
 *
 * Si el archivo está en texto plano se lee y se reescribe cifrado.
 * Si la llave falta o no coincide, se avisa por consola y no se pisa el archivo.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const appPaths = require('./appPaths');

const ENVELOPE_ID = 'mariandre-aes-256-gcm-v1';
const NOT_SET = Symbol('secret-store-unset');

let cachedKey = null;
let keySourceDescription = '';

function fail(message) {
  console.error(`[mariandre] ${message}`);
  const err = new Error(message);
  err.code = 'SECRET_STORE';
  throw err;
}

function keyFilePath() {
  if (process.env.MARIANDRE_KEY_FILE) {
    return path.resolve(process.env.MARIANDRE_KEY_FILE);
  }
  return path.join(appPaths.getDataDir(), '.mariandre-key');
}

function parseKey(input) {
  const text = String(input || '').replace(/^\uFEFF/, '').trim();
  if (!text) return null;
  if (/^[0-9a-fA-F]{64}$/.test(text)) {
    return Buffer.from(text, 'hex');
  }
  const buf = Buffer.from(text, 'base64');
  if (buf.length !== 32) return null;
  const normalized = buf.toString('base64').replace(/=+$/, '');
  const given = text.replace(/\s+/g, '').replace(/=+$/, '');
  if (normalized !== given) return null;
  return buf;
}

function describeKeySource() {
  return keySourceDescription || keyFilePath();
}

function getKeySync({ allowCreate }) {
  if (cachedKey) return cachedKey;

  if (process.env.MARIANDRE_DATA_KEY) {
    const key = parseKey(process.env.MARIANDRE_DATA_KEY);
    if (!key) {
      fail(
        'MARIANDRE_DATA_KEY no es una llave AES-256 válida (se esperan 32 bytes en base64 o hexadecimal). No se modificaron los datos.'
      );
    }
    cachedKey = key;
    keySourceDescription = 'variable MARIANDRE_DATA_KEY';
    return cachedKey;
  }

  const file = keyFilePath();
  if (fs.existsSync(file)) {
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (err) {
      fail(`No se pudo leer la llave de cifrado en ${file} (${err.message}). No se modificaron los datos.`);
    }
    const key = parseKey(raw);
    if (!key) {
      fail(
        `El archivo de llave ${file} no contiene una llave AES-256 válida (32 bytes en base64 o hexadecimal). No se generó otra llave y no se modificaron los datos.`
      );
    }
    cachedKey = key;
    keySourceDescription = file;
    return cachedKey;
  }

  if (!allowCreate) {
    fail(
      `No se encontró la llave de cifrado (${file}). Hay archivos cifrados que no se pueden leer sin ella. ` +
        'Copie el respaldo de .mariandre-key a esa ruta o defina MARIANDRE_DATA_KEY. ' +
        'No se modificó ningún archivo de datos. Si la llave se perdió, el contenido cifrado no se puede recuperar.'
    );
  }

  const key = crypto.randomBytes(32);
  atomicWriteSync(file, `${key.toString('base64')}\n`);
  cachedKey = key;
  keySourceDescription = file;
  console.warn(
    `[mariandre] Se generó la llave de cifrado en ${file}. ` +
      'Respáldela fuera del repositorio. Si se pierde, los datos cifrados no se pueden recuperar.'
  );
  return cachedKey;
}

function readFileText(filePath) {
  let text = fs.readFileSync(filePath, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

function isEnvelope(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && value.enc === ENVELOPE_ID
    && typeof value.iv === 'string'
    && typeof value.tag === 'string'
    && typeof value.data === 'string'
  );
}

function tryParseEnvelope(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const value = JSON.parse(trimmed);
    return isEnvelope(value) ? value : null;
  } catch {
    return null;
  }
}

function encryptString(plaintext, key, filePath) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(path.basename(filePath), 'utf8'));
  const data = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return {
    enc: ENVELOPE_ID,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

function decryptToString(envelope, filePath) {
  const key = getKeySync({ allowCreate: false });
  try {
    const iv = Buffer.from(envelope.iv, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');
    const data = Buffer.from(envelope.data, 'base64');
    if (iv.length !== 12 || tag.length !== 16) {
      throw new Error('formato');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(path.basename(filePath), 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (err) {
    if (err.code === 'SECRET_STORE') throw err;
    fail(
      `No se pudo descifrar ${path.basename(filePath)}: la llave (${describeKeySource()}) no coincide con la que se usó para cifrarlo. ` +
        'El archivo no se modificó. Restaure la llave original (.mariandre-key o MARIANDRE_DATA_KEY). ' +
        'Si se perdió, el contenido cifrado no se puede recuperar.'
    );
  }
}

function atomicWriteSync(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.mariandre.tmp`);
  fs.writeFileSync(tmp, content, { encoding: 'utf8', mode: 0o600 });
  try {
    try {
      fs.renameSync(tmp, filePath);
      return;
    } catch (err) {
      if (err.code !== 'EEXIST' && err.code !== 'EPERM' && err.code !== 'EBUSY') throw err;
    }
    fs.copyFileSync(tmp, filePath);
  } finally {
    if (fs.existsSync(tmp)) {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        /* el temporal no debe impedir el arranque si el destino ya quedó escrito */
      }
    }
  }
}

function writeEncryptedTextSync(filePath, plaintext) {
  if (fs.existsSync(filePath)) {
    const envelope = tryParseEnvelope(readFileText(filePath));
    if (envelope) {
      decryptToString(envelope, filePath);
    }
  }
  const key = getKeySync({ allowCreate: true });
  const body = `${JSON.stringify(encryptString(plaintext, key, filePath), null, 2)}\n`;
  atomicWriteSync(filePath, body);
}

function logCreated(filePath) {
  console.warn(
    `[mariandre] No existía ${path.basename(filePath)}. Se creó vacío y cifrado. ` +
      'Si acaba de actualizar con git pull, restaure el respaldo de ese archivo encima y reinicie. ' +
      'Sin ese respaldo, los datos que había ahí no están en el archivo nuevo.'
  );
}

function logMigrated(filePath) {
  console.log(
    `[mariandre] Se cifró ${path.basename(filePath)} (estaba en texto plano). Llave: ${describeKeySource()}. ` +
      'Respalde esa llave fuera del proyecto. Si se pierde, el contenido cifrado no se puede recuperar.'
  );
}

function readJsonSync(filePath, fallback = NOT_SET) {
  if (!fs.existsSync(filePath)) {
    if (fallback === NOT_SET) {
      const err = new Error(`No se encontró ${path.basename(filePath)}`);
      err.code = 'ENOENT';
      throw err;
    }
    writeEncryptedTextSync(filePath, JSON.stringify(fallback, null, 2));
    logCreated(filePath);
    return fallback;
  }

  const text = readFileText(filePath);
  const envelope = tryParseEnvelope(text);
  if (envelope) {
    const plain = decryptToString(envelope, filePath);
    try {
      return JSON.parse(plain);
    } catch {
      fail(
        `${path.basename(filePath)} se descifró, pero el contenido no es JSON válido. El archivo no se modificó.`
      );
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail(
      `${path.basename(filePath)} no es JSON válido ni un archivo cifrado de MariAndre. El archivo no se modificó.`
    );
  }

  writeEncryptedTextSync(filePath, text);
  logMigrated(filePath);
  return parsed;
}

function writeJsonSync(filePath, value) {
  const text = JSON.stringify(value, null, 2);
  if (typeof text !== 'string') {
    fail(`No se puede guardar ${path.basename(filePath)}: el valor no es JSON.`);
  }
  const existed = fs.existsSync(filePath);
  const plainText = existed && !tryParseEnvelope(readFileText(filePath));
  writeEncryptedTextSync(filePath, text);
  if (plainText) logMigrated(filePath);
}

function readTextSync(filePath) {
  if (!fs.existsSync(filePath)) {
    const err = new Error(`No se encontró ${path.basename(filePath)}`);
    err.code = 'ENOENT';
    throw err;
  }
  const text = readFileText(filePath);
  const envelope = tryParseEnvelope(text);
  if (envelope) return decryptToString(envelope, filePath);
  if (text.includes('-----BEGIN ')) {
    writeEncryptedTextSync(filePath, text);
    logMigrated(filePath);
    return text;
  }
  fail(
    `${path.basename(filePath)} no es un PEM ni un archivo cifrado de MariAndre. El archivo no se modificó.`
  );
}

function writeTextSync(filePath, text) {
  const existed = fs.existsSync(filePath);
  const plainText = existed && !tryParseEnvelope(readFileText(filePath));
  writeEncryptedTextSync(filePath, text);
  if (plainText) logMigrated(filePath);
}

function classify(filePath) {
  if (!fs.existsSync(filePath)) return { state: 'missing' };
  const text = readFileText(filePath);
  const envelope = tryParseEnvelope(text);
  if (envelope) return { state: 'encrypted', envelope, text };
  return { state: 'plain', text };
}

function privateKeyFiles() {
  const root = appPaths.getBundleDir();
  return [
    path.join(root, 'license-keys', 'private.pem'),
    path.join(root, 'license-keys-fserp', 'private.pem'),
  ];
}

/**
 * Al arrancar: comprueba la llave antes de tocar nada.
 * Luego migra texto plano y, si no hay conexiones, crea un archivo vacío cifrado.
 */
function protectAtStartup() {
  const conexiones = appPaths.conexionesPath();
  const cursorApi = appPaths.cursorApiPath();
  const jsonTargets = [conexiones, cursorApi];
  const textTargets = privateKeyFiles();

  const encrypted = [];
  const plainJson = [];
  const plainText = [];

  for (const filePath of jsonTargets) {
    const info = classify(filePath);
    if (info.state === 'missing') continue;
    if (info.state === 'encrypted') {
      encrypted.push({ filePath, envelope: info.envelope });
      continue;
    }
    try {
      JSON.parse(info.text);
    } catch {
      fail(
        `${path.basename(filePath)} no es JSON válido ni un archivo cifrado de MariAndre. El archivo no se modificó.`
      );
    }
    plainJson.push({ filePath, text: info.text });
  }

  for (const filePath of textTargets) {
    const info = classify(filePath);
    if (info.state === 'missing') continue;
    if (info.state === 'encrypted') {
      encrypted.push({ filePath, envelope: info.envelope });
      continue;
    }
    if (!info.text.includes('-----BEGIN ')) {
      fail(
        `${path.basename(filePath)} no es un PEM ni un archivo cifrado de MariAndre. El archivo no se modificó.`
      );
    }
    plainText.push({ filePath, text: info.text });
  }

  if (encrypted.length) {
    getKeySync({ allowCreate: false });
    for (const item of encrypted) {
      decryptToString(item.envelope, item.filePath);
    }
  }

  for (const item of plainJson) {
    writeEncryptedTextSync(item.filePath, item.text);
    logMigrated(item.filePath);
  }
  for (const item of plainText) {
    writeEncryptedTextSync(item.filePath, item.text);
    logMigrated(item.filePath);
  }

  if (!fs.existsSync(conexiones)) {
    writeEncryptedTextSync(conexiones, '[]');
    logCreated(conexiones);
  }
}

async function readJson(filePath, fallback) {
  if (arguments.length < 2) return readJsonSync(filePath);
  return readJsonSync(filePath, fallback);
}

async function writeJson(filePath, value) {
  writeJsonSync(filePath, value);
}

module.exports = {
  readJson,
  writeJson,
  readTextSync,
  writeTextSync,
  protectAtStartup,
  keyFilePath,
};
