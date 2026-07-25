/**
 * Genera iconos e imágenes de instalación NSIS a partir de logoma.png
 *
 * Salidas:
 *   build/icon.ico              — icono app / instalador (16–256)
 *   build/icon.png              — PNG 256×256
 *   build/installerHeader.bmp   — cabecera NSIS 150×57
 *   build/installerSidebar.bmp  — lateral NSIS 164×314
 *   public/logo.png             — logo web
 *   logo.png                    — copia en raíz
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
const SIDEBAR_BG = { r: 232, g: 244, b: 252, alpha: 1 };
const HEADER_BG = { r: 248, g: 252, b: 255, alpha: 1 };

function encodeBmp24(width, height, rgba) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelSize = rowSize * height;
  const fileSize = 54 + pixelSize;
  const buf = Buffer.alloc(fileSize, 0);

  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixelSize, 34);

  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y;
    let dest = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const i = (srcY * width + x) * 4;
      buf[dest++] = rgba[i + 2];
      buf[dest++] = rgba[i + 1];
      buf[dest++] = rgba[i];
    }
  }
  return buf;
}

async function toBmp(width, height, compose) {
  const { data } = await compose
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return encodeBmp24(width, height, data);
}

async function main() {
  if (!fs.existsSync(LOGO_SRC)) {
    console.error('No se encontró logoma.png en la raíz del proyecto');
    process.exit(1);
  }

  fs.mkdirSync(BUILD_DIR, { recursive: true });

  const logoMeta = await sharp(LOGO_SRC).metadata();
  console.log(`Fuente: logoma.png (${logoMeta.width}×${logoMeta.height})`);

  // Logo web: cuadrado limpio sobre fondo claro
  const webLogo = await sharp(LOGO_SRC)
    .resize(512, 512, { fit: 'contain', background: BG })
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(ROOT, 'public', 'logo.png'), webLogo);
  fs.writeFileSync(path.join(ROOT, 'logo.png'), webLogo);
  console.log('Actualizado: public/logo.png, logo.png');

  // PNG 256 para referencia
  const iconPng = await sharp(LOGO_SRC)
    .resize(256, 256, { fit: 'contain', background: BG })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.png'), iconPng);
  console.log('Generado: build/icon.png');

  // ICO multi-tamaño
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

  // Cabecera NSIS 150×57 — logo a la izquierda
  const headerLogo = await sharp(LOGO_SRC)
    .resize(48, 48, { fit: 'contain', background: HEADER_BG })
    .png()
    .toBuffer();

  const headerBmp = await toBmp(
    150,
    57,
    sharp({
      create: {
        width: 150,
        height: 57,
        channels: 4,
        background: HEADER_BG,
      },
    }).composite([{ input: headerLogo, left: 8, top: 4 }])
  );
  fs.writeFileSync(path.join(BUILD_DIR, 'installerHeader.bmp'), headerBmp);
  console.log('Generado: build/installerHeader.bmp');

  // Lateral NSIS 164×314 — logo centrado
  const sidebarLogo = await sharp(LOGO_SRC)
    .resize(140, 140, { fit: 'contain', background: SIDEBAR_BG })
    .png()
    .toBuffer();

  const sidebarBmp = await toBmp(
    164,
    314,
    sharp({
      create: {
        width: 164,
        height: 314,
        channels: 4,
        background: SIDEBAR_BG,
      },
    }).composite([{ input: sidebarLogo, left: 12, top: 60 }])
  );
  fs.writeFileSync(path.join(BUILD_DIR, 'installerSidebar.bmp'), sidebarBmp);
  console.log('Generado: build/installerSidebar.bmp');

  console.log('Listo.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
