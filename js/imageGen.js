/**
 * imageGen.js
 * Seed tabanlı procedural görsel üretici.
 * Her seed için aynı görseli üretir (deterministic).
 * Çıktı: 2400×2400 px OffscreenCanvas veya Canvas element.
 */

class SeededRandom {
  constructor(seed) {
    this.seed = seed >>> 0;
  }
  next() {
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >> 17;
    this.seed ^= this.seed << 5;
    return ((this.seed >>> 0) / 4294967296);
  }
  range(min, max) { return min + this.next() * (max - min); }
  int(min, max)   { return Math.floor(this.range(min, max + 1)); }
  pick(arr)       { return arr[Math.floor(this.next() * arr.length)]; }
}

/** HSL → hex dönüşümü */
function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s));
  l = Math.max(0, Math.min(100, l));
  return `hsl(${h},${s}%,${l}%)`;
}

/**
 * Verilen seed için renk paleti üretir.
 * Triadic veya analogous renk teorisi kullanır.
 */
function generatePalette(rng) {
  const strategy = rng.pick(['triadic', 'analogous', 'split-complementary', 'tetradic']);
  const baseHue  = rng.range(0, 360);
  const sat      = rng.range(55, 95);
  const colors   = [];

  if (strategy === 'triadic') {
    colors.push(hsl(baseHue, sat, rng.range(30, 55)));
    colors.push(hsl(baseHue + 120, sat, rng.range(30, 55)));
    colors.push(hsl(baseHue + 240, sat, rng.range(30, 55)));
    colors.push(hsl(baseHue + 60,  sat * 0.7, rng.range(55, 80)));
    colors.push(hsl(baseHue + 180, sat * 0.8, rng.range(20, 45)));
  } else if (strategy === 'analogous') {
    for (let i = 0; i < 5; i++) {
      colors.push(hsl(baseHue + i * 30, sat - i * 5, rng.range(25, 70)));
    }
  } else if (strategy === 'split-complementary') {
    colors.push(hsl(baseHue, sat, rng.range(30, 50)));
    colors.push(hsl(baseHue + 150, sat, rng.range(35, 55)));
    colors.push(hsl(baseHue + 210, sat, rng.range(35, 55)));
    colors.push(hsl(baseHue + 30,  sat * 0.6, rng.range(60, 80)));
    colors.push(hsl(baseHue - 30,  sat * 0.6, rng.range(60, 80)));
  } else { // tetradic
    for (let i = 0; i < 4; i++) {
      colors.push(hsl(baseHue + i * 90, sat, rng.range(30, 60)));
    }
    colors.push(hsl(baseHue + 45, sat * 0.5, rng.range(65, 85)));
  }

  return colors;
}

/**
 * Ana görsel üretim fonksiyonu.
 * @param {number} seed
 * @param {number} size - Çıktı çözünürlüğü (default 2400)
 * @returns {HTMLCanvasElement}
 */
function generateImage(seed, size = 2400) {
  const rng    = new SeededRandom(seed);
  const canvas = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const palette = generatePalette(rng);

  // --- 1. Arka plan gradient ---
  const bgType = rng.pick(['radial', 'linear', 'conic', 'mesh']);

  if (bgType === 'linear') {
    const angle  = rng.range(0, Math.PI * 2);
    const x1 = size * 0.5 + Math.cos(angle) * size;
    const y1 = size * 0.5 + Math.sin(angle) * size;
    const x2 = size - x1;
    const y2 = size - y1;
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0,    palette[0]);
    grad.addColorStop(0.4,  palette[1]);
    grad.addColorStop(0.7,  palette[2 % palette.length]);
    grad.addColorStop(1,    palette[3 % palette.length]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

  } else if (bgType === 'radial') {
    const cx = rng.range(size * 0.2, size * 0.8);
    const cy = rng.range(size * 0.2, size * 0.8);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.9);
    grad.addColorStop(0,   palette[0]);
    grad.addColorStop(0.5, palette[1]);
    grad.addColorStop(1,   palette[2 % palette.length]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

  } else if (bgType === 'conic') {
    // Conic gradient API yoksa linear fallback
    try {
      const cx = rng.range(size * 0.3, size * 0.7);
      const cy = rng.range(size * 0.3, size * 0.7);
      const angle = rng.range(0, Math.PI * 2);
      const grad = ctx.createConicGradient(angle, cx, cy);
      for (let i = 0; i < palette.length; i++) {
        grad.addColorStop(i / palette.length, palette[i]);
      }
      grad.addColorStop(1, palette[0]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    } catch {
      ctx.fillStyle = palette[0];
      ctx.fillRect(0, 0, size, size);
    }
  } else {
    // Mesh: birden fazla radial gradient üst üste
    ctx.fillStyle = palette[0];
    ctx.fillRect(0, 0, size, size);
    const meshCount = rng.int(3, 6);
    for (let m = 0; m < meshCount; m++) {
      const cx   = rng.range(0, size);
      const cy   = rng.range(0, size);
      const r    = rng.range(size * 0.3, size * 0.8);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0,   palette[m % palette.length].replace('hsl', 'hsla').replace(')', ',0.7)'));
      grad.addColorStop(1,   'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }
  }

  // --- 2. Sinüs dalgası katmanları ---
  const waveCount = rng.int(3, 7);
  for (let w = 0; w < waveCount; w++) {
    const waveColor = palette[w % palette.length];
    const alpha     = rng.range(0.08, 0.25);
    const amplitude = rng.range(size * 0.04, size * 0.18);
    const frequency = rng.range(0.5, 3.5);
    const phaseOff  = rng.range(0, Math.PI * 2);
    const thickness = rng.range(size * 0.015, size * 0.06);
    const yBase     = rng.range(size * 0.1, size * 0.9);
    const vertical  = rng.next() > 0.5;

    ctx.beginPath();
    ctx.lineWidth   = thickness;
    ctx.strokeStyle = waveColor.replace('hsl', 'hsla').replace(')', `,${alpha})`);
    ctx.lineCap     = 'round';

    for (let i = 0; i <= size; i += 2) {
      const t   = (i / size) * Math.PI * 2 * frequency + phaseOff;
      const off = Math.sin(t) * amplitude;
      if (vertical) {
        const x = yBase + off;
        if (i === 0) ctx.moveTo(x, i);
        else          ctx.lineTo(x, i);
      } else {
        const y = yBase + off;
        if (i === 0) ctx.moveTo(i, y);
        else          ctx.lineTo(i, y);
      }
    }
    ctx.stroke();
  }

  // --- 3. Bezier çizgi katmanları ---
  const lineCount = rng.int(20, 45);
  for (let l = 0; l < lineCount; l++) {
    const color  = palette[l % palette.length];
    const alpha  = rng.range(0.06, 0.45);
    const width  = rng.range(1, size * 0.012);
    const curved = rng.next() > 0.3;

    const x1 = rng.range(-size * 0.1, size * 1.1);
    const y1 = rng.range(-size * 0.1, size * 1.1);
    const x2 = rng.range(-size * 0.1, size * 1.1);
    const y2 = rng.range(-size * 0.1, size * 1.1);

    ctx.beginPath();
    ctx.lineWidth   = width;
    ctx.strokeStyle = color.replace('hsl', 'hsla').replace(')', `,${alpha})`);
    ctx.lineCap     = rng.pick(['round', 'butt', 'square']);

    ctx.moveTo(x1, y1);
    if (curved) {
      const cp1x = rng.range(-size * 0.2, size * 1.2);
      const cp1y = rng.range(-size * 0.2, size * 1.2);
      const cp2x = rng.range(-size * 0.2, size * 1.2);
      const cp2y = rng.range(-size * 0.2, size * 1.2);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
    } else {
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }

  // --- 4. Nokta / daire katmanı ---
  const dotCount = rng.int(8, 25);
  for (let d = 0; d < dotCount; d++) {
    const color = palette[d % palette.length];
    const alpha = rng.range(0.05, 0.2);
    const r     = rng.range(size * 0.02, size * 0.12);
    const cx    = rng.range(0, size);
    const cy    = rng.range(0, size);

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color.replace('hsl', 'hsla').replace(')', `,${alpha})`);
    ctx.fill();
  }

  // --- 5. Noise / grain overlay ---
  const grainCount = rng.int(2000, 5000);
  for (let g = 0; g < grainCount; g++) {
    const gx = rng.range(0, size);
    const gy = rng.range(0, size);
    const gr = rng.range(0.5, 2.5);
    const ga = rng.range(0.01, 0.06);
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${ga})`;
    ctx.fill();
  }

  return canvas;
}

// Modül export
window.ImageGen = { generateImage, SeededRandom };
