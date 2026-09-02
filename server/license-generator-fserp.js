/**
 * Generador de licencias FS ERP (El Salvador) embebido en Mariandre.
 * Catálogo y firma leen FsERP-EL SALVADOR (MENU_GROUPS / claves propias).
 * Independiente del generador OnneB.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const appPaths = require('./appPaths');

const PRODUCT = {
  id: 'fserp',
  label: 'FS ERP',
  envRoot: 'FSERP_ROOT',
  siblings: ['FsERP-EL SALVADOR', 'FsERP-EL-SALVADOR', 'FSERP', 'fserp'],
  fallbackKeysDirName: 'license-keys-fserp',
  filenamePrefix: 'fserp-license',
  sourceLabel: 'FS ERP lib/roles-usuarios.js → MENU_GROUPS',
};

function resolveFserpRoot() {
  if (process.env[PRODUCT.envRoot]) {
    return path.resolve(process.env[PRODUCT.envRoot]);
  }
  const bases = [
    path.join(appPaths.getBundleDir(), '..'),
    path.join(__dirname, '..', '..'),
  ];
  for (const base of bases) {
    for (const name of PRODUCT.siblings) {
      const candidate = path.join(base, name);
      const modulesPath = path.join(candidate, 'lib', 'license-modules.js');
      if (fs.existsSync(modulesPath)) return path.resolve(candidate);
    }
  }
  return null;
}

function clearProductRequireCache(root) {
  const rootResolved = path.resolve(root);
  for (const key of Object.keys(require.cache)) {
    const resolved = path.resolve(key);
    if (
      resolved === path.join(rootResolved, 'lib', 'license-modules.js') ||
      resolved === path.join(rootResolved, 'lib', 'roles-usuarios.js') ||
      resolved === path.join(rootResolved, 'lib', 'license.js') ||
      resolved.startsWith(path.join(rootResolved, 'lib') + path.sep)
    ) {
      delete require.cache[key];
    }
  }
}

function loadProductLicenseLibs(root) {
  clearProductRequireCache(root);
  const licenseModules = require(path.join(root, 'lib', 'license-modules.js'));
  const { canonicalPayload } = require(path.join(root, 'lib', 'license.js'));
  return { ...licenseModules, canonicalPayload };
}

function keysDirFor(_root) {
  return path.join(appPaths.getBundleDir(), PRODUCT.fallbackKeysDirName);
}

function ensureKeys(root) {
  const keysDir = keysDirFor(root);
  const privateKeyPath = path.join(keysDir, 'private.pem');
  const publicKeyPath = path.join(keysDir, 'public.pem');
  const appPublicKeyPath = path.join(root, 'config', 'license-public.pem');

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
  const productRoot = resolveFserpRoot();
  if (!productRoot) {
    const err = new Error(
      'No se encontró el proyecto FS ERP (FsERP-EL SALVADOR). Defina FSERP_ROOT o colóquelo junto a Mariandre.'
    );
    err.statusCode = 503;
    throw err;
  }
  const libs = loadProductLicenseLibs(productRoot);
  const keys = ensureKeys(productRoot);
  return { productRoot, libs, keys };
}

function getCatalog() {
  const { productRoot, libs, keys } = getGeneratorContext();
  const integrity = libs.assertLicenseCatalogIntegrity({ log: () => {} });
  const modules = libs.licenseModulesCatalog();
  const menuCount = modules.reduce((n, m) => n + (m.menus?.length || 0), 0);
  return {
    product: PRODUCT.id,
    productLabel: PRODUCT.label,
    modules,
    coreMenus: [...libs.CORE_MENUS],
    source: PRODUCT.sourceLabel,
    productRoot,
    onnebRoot: productRoot,
    keysDir: keys.keysDir,
    hasPrivateKey: fs.existsSync(keys.privateKeyPath),
    integrity,
    moduleCount: modules.length,
    menuCount,
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
    product: PRODUCT.id,
    licenseId: crypto.randomUUID(),
    customer,
    issuedAt: new Date().toISOString(),
    expiresAt,
    modules,
    menus,
    notes: String(body.notes || '').trim(),
  };

  const doc = signPayload(keys.privateKeyPath, libs.canonicalPayload, payload);
  const filename = `${PRODUCT.filenamePrefix}-${customer.replace(/[^\w\-]+/g, '_').slice(0, 40)}.json`;

  return {
    ok: true,
    product: PRODUCT.id,
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
  PRODUCT,
  resolveFserpRoot,
  getCatalog,
  issueLicense,
  getPublicKeyPem,
};
