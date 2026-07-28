/**
 * Generador de licencias OnneB embebido en Mariandre.
 * Catálogo y firma leen el proyecto OnneB (MENU_GROUPS / claves).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const appPaths = require('./appPaths');

function resolveOnnebRoot() {
  if (process.env.ONNEB_ROOT) {
    return path.resolve(process.env.ONNEB_ROOT);
  }
  const candidates = [
    path.join(appPaths.getBundleDir(), '..', 'pos_onneb'),
    path.join(__dirname, '..', '..', 'pos_onneb'),
  ];
  for (const candidate of candidates) {
    const modulesPath = path.join(candidate, 'lib', 'license-modules.js');
    if (fs.existsSync(modulesPath)) return path.resolve(candidate);
  }
  return null;
}

function loadOnnebLicenseLibs(onnebRoot) {
  const licenseModules = require(path.join(onnebRoot, 'lib', 'license-modules.js'));
  const { canonicalPayload } = require(path.join(onnebRoot, 'lib', 'license.js'));
  return { ...licenseModules, canonicalPayload };
}

function keysDirFor(onnebRoot) {
  const onnebKeys = path.join(onnebRoot, 'GENERADOR LICENCIAS', 'keys');
  if (fs.existsSync(path.join(onnebKeys, 'private.pem'))) {
    return onnebKeys;
  }
  return path.join(appPaths.getBundleDir(), 'license-keys');
}

function ensureKeys(onnebRoot) {
  const keysDir = keysDirFor(onnebRoot);
  const privateKeyPath = path.join(keysDir, 'private.pem');
  const publicKeyPath = path.join(keysDir, 'public.pem');
  const appPublicKeyPath = path.join(onnebRoot, 'config', 'license-public.pem');

  if (!fs.existsSync(keysDir)) fs.mkdirSync(keysDir, { recursive: true });

  if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    fs.writeFileSync(privateKeyPath, privateKey, { encoding: 'utf8', mode: 0o600 });
    fs.writeFileSync(publicKeyPath, publicKey, 'utf8');
  }

  const pub = fs.readFileSync(publicKeyPath, 'utf8');
  const configDir = path.dirname(appPublicKeyPath);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(appPublicKeyPath, pub, 'utf8');

  return { keysDir, privateKeyPath, publicKeyPath, appPublicKeyPath };
}

function signPayload(privateKeyPath, canonicalPayload, payload) {
  const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  const data = Buffer.from(canonicalPayload(payload), 'utf8');
  const signature = crypto.sign('SHA256', data, privateKey).toString('base64');
  return { payload, signature };
}

function getGeneratorContext() {
  const onnebRoot = resolveOnnebRoot();
  if (!onnebRoot) {
    const err = new Error(
      'No se encontró el proyecto OnneB (pos_onneb). Defina ONNEB_ROOT o colóquelo junto a Mariandre.'
    );
    err.statusCode = 503;
    throw err;
  }
  const libs = loadOnnebLicenseLibs(onnebRoot);
  const keys = ensureKeys(onnebRoot);
  return { onnebRoot, libs, keys };
}

function getCatalog() {
  const { onnebRoot, libs, keys } = getGeneratorContext();
  const integrity = libs.assertLicenseCatalogIntegrity({ log: () => {} });
  return {
    modules: libs.licenseModulesCatalog(),
    coreMenus: [...libs.CORE_MENUS],
    source: 'OnneB lib/roles-usuarios.js → MENU_GROUPS',
    onnebRoot,
    keysDir: keys.keysDir,
    hasPrivateKey: fs.existsSync(keys.privateKeyPath),
    integrity,
  };
}

function issueLicense(body = {}) {
  const { libs, keys } = getGeneratorContext();
  const customer = String(body.customer || '').trim();
  if (!customer) {
    const err = new Error('Indique el nombre del cliente');
    err.statusCode = 400;
    throw err;
  }

  const validMenus = libs.menusAssignedToLicenseGroups();
  let menus = Array.isArray(body.menus)
    ? [...new Set(body.menus.map((m) => String(m || '').trim()).filter((m) => validMenus.has(m)))]
    : [];

  if (!menus.length && Array.isArray(body.modules) && body.modules.length) {
    menus = libs.normalizeLicenseMenus({ modules: body.modules, menus: [] });
  }

  menus = libs.normalizeLicenseMenus({ modules: [], menus });
  const selectable = menus.filter((m) => !libs.CORE_MENUS.includes(m));
  if (!selectable.length) {
    const err = new Error('Seleccione al menos una vista');
    err.statusCode = 400;
    throw err;
  }

  const unknown = (body.menus || []).filter(
    (m) => m && !validMenus.has(String(m).trim()) && !libs.CORE_MENUS.includes(String(m).trim())
  );
  if (unknown.length) {
    const err = new Error(`Vistas desconocidas: ${unknown.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const modules = libs.modulesFromMenus(menus);

  let expiresAt = null;
  const expRaw = String(body.expiresAt || '').trim();
  if (expRaw) {
    const d = new Date(expRaw);
    if (Number.isNaN(d.getTime())) {
      const err = new Error('Fecha de vencimiento inválida');
      err.statusCode = 400;
      throw err;
    }
    expiresAt = d.toISOString();
  }

  const payload = {
    v: 2,
    licenseId: crypto.randomUUID(),
    customer,
    issuedAt: new Date().toISOString(),
    expiresAt,
    modules,
    menus,
    notes: String(body.notes || '').trim(),
  };

  const doc = signPayload(keys.privateKeyPath, libs.canonicalPayload, payload);
  const filename = `onneb-license-${customer.replace(/[^\w\-]+/g, '_').slice(0, 40)}.json`;

  return {
    ok: true,
    filename,
    license: doc,
    menus,
    modules,
    preview: payload,
  };
}

function getPublicKeyPem() {
  const { keys } = getGeneratorContext();
  return fs.readFileSync(keys.publicKeyPath, 'utf8');
}

module.exports = {
  resolveOnnebRoot,
  getCatalog,
  issueLicense,
  getPublicKeyPem,
};
