/**
 * Genera iconos y logo web a partir de logoma.png
 *
 * Salidas:
 *   build/icon.ico   — icono multi-tamaño
 *   build/icon.png   — PNG 256×256
 *   public/logo.png  — logo web
 *   logo.png         — copia en raíz
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default || require('png-to-ico');

const ROOT = path.join(__dirname, '..');
const LOGO_SRC = path.join(ROOT, 'logoma.png');
const BUILD_DIR = path.join(ROOT, 'build');

const ICO_SIZES = [256, 128, 64, 48, 32, 16];
/** Fondo claro acorde al logo circular (blanco / azul suave) */
const BG = { r: 248, g: 252, b: 255, alpha: 1 };

async function main() {
  if (!fs.existsSync(LOGO_SRC)) {
    console.error('No se encontró logoma.png en la raíz del proyecto');
    process.exit(1);
  }

  fs.mkdirSync(BUILD_DIR, { recursive: true });

  const logoMeta = await sharp(LOGO_SRC).metadata();
  console.log(`Fuente: logoma.png (${logoMeta.width}×${logoMeta.height})`);

  const webLogo = await sharp(LOGO_SRC)
    .resize(512, 512, { fit: 'contain', background: BG })
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(ROOT, 'public', 'logo.png'), webLogo);
  fs.writeFileSync(path.join(ROOT, 'logo.png'), webLogo);
  console.log('Actualizado: public/logo.png, logo.png');

  const iconPng = await sharp(LOGO_SRC)
    .resize(256, 256, { fit: 'contain', background: BG })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.png'), iconPng);
  console.log('Generado: build/icon.png');

  const pngBuffers = await Promise.all(
    ICO_SIZES.map((size) =>
      sharp(LOGO_SRC)
        .resize(size, size, { fit: 'contain', background: BG })
        .png()
        .toBuffer()
    )
  );
  const icoBuf = await pngToIco(pngBuffers);
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), icoBuf);
  console.log('Generado: build/icon.ico');

  console.log('Listo.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
