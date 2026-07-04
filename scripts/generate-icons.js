const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ASSETS = path.resolve(__dirname, '..', 'assets');

function makeGradient(size, colors) {
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const t = x / size;
      const c = colors[0];
      const next = colors[colors.length - 1];
      const lt = t;
      buf[i] = Math.round(c[0] + (next[0] - c[0]) * lt);
      buf[i + 1] = Math.round(c[1] + (next[1] - c[1]) * lt);
      buf[i + 2] = Math.round(c[2] + (next[2] - c[2]) * lt);
      buf[i + 3] = 255;
    }
  }
  return sharp(buf, { raw: { width: size, height: size, channels: 4 } });
}

async function letterL(size) {
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#6c63ff"/>
        <stop offset="100%" stop-color="#2a6eff"/>
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#g)"/>
    <text x="50%" y="56%" dominant-baseline="central" text-anchor="middle"
          font-family="system-ui, -apple-system, sans-serif"
          font-weight="800" font-size="${size * 0.55}px"
          fill="white">L</text>
  </svg>`;
  return svg;
}

async function main() {
  if (!fs.existsSync(ASSETS)) fs.mkdirSync(ASSETS, { recursive: true });

  console.log('Generating icon.png...');
  const iconSvg = await letterL(1024);
  await sharp(Buffer.from(iconSvg)).resize(1024, 1024).png().toFile(path.join(ASSETS, 'icon.png'));

  console.log('Generating favicon.png...');
  const favSvg = await letterL(48);
  await sharp(Buffer.from(favSvg)).resize(48, 48).png().toFile(path.join(ASSETS, 'favicon.png'));

  console.log('Generating splash-icon.png...');
  const splashSvg = `<svg width="1284" height="2778" xmlns="http://www.w3.org/2000/svg">
    <rect width="1284" height="2778" fill="#0a0a0a"/>
    <text x="50%" y="45%" dominant-baseline="central" text-anchor="middle"
          font-family="system-ui, -apple-system, sans-serif"
          font-weight="800" font-size="180px"
          fill="url(#g2)">L</text>
    <defs>
      <linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#6c63ff"/>
        <stop offset="100%" stop-color="#2a6eff"/>
      </linearGradient>
    </defs>
  </svg>`;
  await sharp(Buffer.from(splashSvg)).resize(1284, 2778).png().toFile(path.join(ASSETS, 'splash-icon.png'));

  console.log('Generating android-icon-foreground.png...');
  const fgSvg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <text x="50%" y="56%" dominant-baseline="central" text-anchor="middle"
          font-family="system-ui, -apple-system, sans-serif"
          font-weight="800" font-size="600px"
          fill="white">L</text>
  </svg>`;
  const fg = sharp(Buffer.from(fgSvg)).resize(1024, 1024).png();
  await fg.toFile(path.join(ASSETS, 'android-icon-foreground.png'));

  console.log('Generating android-icon-background.png...');
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 108, g: 99, b: 255 } } })
    .png().toFile(path.join(ASSETS, 'android-icon-background.png'));

  console.log('Generating android-icon-monochrome.png...');
  const mcSvg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <text x="50%" y="56%" dominant-baseline="central" text-anchor="middle"
          font-family="system-ui, -apple-system, sans-serif"
          font-weight="800" font-size="600px"
          fill="white">L</text>
  </svg>`;
  await sharp(Buffer.from(mcSvg)).resize(1024, 1024).png().toFile(path.join(ASSETS, 'android-icon-monochrome.png'));

  console.log('Done! All icons generated.');
}

main().catch(e => { console.error(e); process.exit(1); });
