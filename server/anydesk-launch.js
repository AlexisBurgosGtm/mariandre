/**
 * Abre AnyDesk en esta PC y conecta a un ID.
 * Con contraseña usa --with-password (se lee por stdin, no va en la URL).
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function exists(filePath) {
  try {
    return Boolean(filePath) && fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function findAnyDeskExe() {
  const local = process.env.LOCALAPPDATA || '';
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const candidates = [
    path.join(pf86, 'AnyDesk', 'AnyDesk.exe'),
    path.join(pf, 'AnyDesk', 'AnyDesk.exe'),
    path.join(local, 'Programs', 'AnyDesk', 'AnyDesk.exe'),
    path.join(local, 'AnyDesk', 'AnyDesk.exe'),
  ];
  return candidates.find(exists) || null;
}

function normalizeAnyDeskAddress(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/[a-zA-Z@]/.test(s)) return s.replace(/\s+/g, '');
  return s.replace(/\D/g, '');
}

function launchAnyDesk({ anydesk, password }) {
  const address = normalizeAnyDeskAddress(anydesk);
  if (!address) {
    const err = new Error('El registro no tiene un ID de AnyDesk válido');
    err.statusCode = 400;
    throw err;
  }

  const exe = findAnyDeskExe();
  if (!exe) {
    const err = new Error('No se encontró AnyDesk en esta PC. Instálalo y vuelve a intentar.');
    err.statusCode = 404;
    throw err;
  }

  const pass = String(password || '').replace(/[\r\n]/g, '');
  const args = pass ? [address, '--with-password'] : [address];

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(exe, args, {
        detached: true,
        stdio: ['pipe', 'ignore', 'ignore'],
        windowsHide: true,
      });
    } catch (err) {
      reject(err);
      return;
    }

    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve({ ok: true, id: address, conPassword: Boolean(pass) });
    };

    child.once('error', (err) => {
      const wrapped = new Error(err.message || 'No se pudo abrir AnyDesk');
      wrapped.statusCode = 500;
      done(wrapped);
    });

    child.once('spawn', () => {
      try {
        if (pass) child.stdin.write(`${pass}\n`);
        child.stdin.end();
      } catch {
        /* stdin ya cerrado */
      }
      child.unref();
      done();
    });
  });
}

module.exports = {
  launchAnyDesk,
  findAnyDeskExe,
  normalizeAnyDeskAddress,
};
