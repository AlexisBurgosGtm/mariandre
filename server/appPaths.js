const fs = require('fs').promises;
const path = require('path');

let dataDir = null;
let bundleDir = null;
let initialized = false;

function initPaths() {
  if (initialized) return;

  bundleDir = path.join(__dirname, '..');
  dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : bundleDir;

  initialized = true;
}

function getDataDir() {
  if (!dataDir) {
    dataDir = process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.join(__dirname, '..');
  }
  return dataDir;
}

function getBundleDir() {
  return bundleDir || path.join(__dirname, '..');
}

function conexionesPath() {
  return path.join(getDataDir(), 'conexiones.json');
}

function mantenimientoPath() {
  return path.join(getDataDir(), 'mantenimiento.json');
}

function configPath() {
  return path.join(getDataDir(), 'config.json');
}

function serviciosOnlinePath() {
  return path.join(getDataDir(), 'servicios-online.json');
}

function alarmasPath() {
  return path.join(getDataDir(), 'alarmas.json');
}

function whatsappAuthPath() {
  return path.join(getDataDir(), '.wwebjs_auth');
}

function puppeteerCachePath() {
  return path.join(getDataDir(), 'puppeteer-cache');
}

function whatsappWebCachePath() {
  return path.join(getDataDir(), '.wwebjs_cache');
}

function resolveModule(moduleName) {
  return require(moduleName);
}

function resolveModulePath(moduleName) {
  return path.join(getBundleDir(), 'node_modules', moduleName);
}

function publicPath() {
  return path.join(getBundleDir(), 'public');
}

async function copyIfMissing(source, target, fallbackContent) {
  try {
    await fs.access(target);
    return;
  } catch {
    /* no existe destino */
  }

  try {
    await fs.access(source);
    await fs.copyFile(source, target);
    return;
  } catch {
    /* no existe origen */
  }

  if (fallbackContent !== undefined) {
    await fs.writeFile(target, fallbackContent, 'utf-8');
  }
}

async function ensureDataFiles() {
  await fs.mkdir(getDataDir(), { recursive: true });
  await fs.mkdir(path.join(getDataDir(), 'data'), { recursive: true });

  await copyIfMissing(
    path.join(getBundleDir(), 'conexiones.json'),
    conexionesPath(),
    '[]'
  );

  await copyIfMissing(
    path.join(getBundleDir(), 'mantenimiento.json'),
    mantenimientoPath(),
    '[]'
  );

  await copyIfMissing(
    path.join(getBundleDir(), 'config.json'),
    configPath(),
    JSON.stringify({ whatsapp: { ttsAnnounceSenderOnly: false }, conexiones: { autoPing: true }, hosting: { principalConexionId: null } }, null, 2)
  );

  await copyIfMissing(
    path.join(getBundleDir(), 'servicios-online.json'),
    serviciosOnlinePath(),
    '[]'
  );

  await copyIfMissing(
    path.join(getBundleDir(), 'alarmas.json'),
    alarmasPath(),
    '[]'
  );

  await fs.mkdir(puppeteerCachePath(), { recursive: true });
  await fs.mkdir(whatsappAuthPath(), { recursive: true });
  await fs.mkdir(whatsappWebCachePath(), { recursive: true });
}

function getAppInfo() {
  return {
    dataDir: getDataDir(),
    whatsappAuthPath: whatsappAuthPath(),
  };
}

module.exports = {
  initPaths,
  ensureDataFiles,
  getDataDir,
  getBundleDir,
  conexionesPath,
  mantenimientoPath,
  configPath,
  serviciosOnlinePath,
  alarmasPath,
  whatsappAuthPath,
  whatsappWebCachePath,
  puppeteerCachePath,
  resolveModule,
  resolveModulePath,
  publicPath,
  getAppInfo,
};
