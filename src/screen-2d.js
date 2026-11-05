// 2D 화면: core 가 정한 그림 목록을 캔버스 2D 로 옮긴다. 무엇을 그릴지, 어떤 그림을 들고 언제 버릴지는 core 가 정한다.
// 목록 한 줄은 64바이트(정수 4칸 + 실수 12칸)다. 모양은 core/include/chwp/render/screen_ops.hpp 와 같다.

const OP_WORDS = 16;
const SAVE = 0;
const RESTORE = 1;
const CLIP = 2;
const FILL = 3;
const RECT = 4;
const ROUND_RECT = 5;
const IMAGE = 6;
const LINE = 7;
const PATH = 8;
const FLAG_INVERT = 1;
const FLAG_SMOOTH = 2;

function cssColor(argb, cache) {
  let text = cache.get(argb);
  if (text) return text;
  const a = (argb >>> 24) & 255;
  const r = (argb >>> 16) & 255;
  const g = (argb >>> 8) & 255;
  const b = argb & 255;
  text = a === 255 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a / 255})`;
  cache.set(argb, text);
  return text;
}

function makeSurface(width, height) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function createScreen2D() {
  // core 가 올린 그림. 처음에는 픽셀을 올린 캔버스로 바로 쓰고, ImageBitmap 이 되면 바꿔 든다.
  const images = new Map();
  const colors = new Map();
  let context = null;
  let contextCanvas = null;
  const canFilter = (() => {
    try {
      return "filter" in makeSurface(1, 1).getContext("2d");
    } catch {
      return false;
    }
  })();

  function forget(key) {
    const image = images.get(key);
    if (image && typeof image.close === "function") image.close();
    images.delete(key);
  }

  function upload(item) {
    const width = item.width | 0;
    const height = item.height | 0;
    if (width <= 0 || height <= 0) return;
    const pixels = new Uint8ClampedArray(item.pixels);
    if (pixels.length !== width * height * 4) return;
    const surface = makeSurface(width, height);
    const ctx = surface.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
    forget(item.key);
    images.set(item.key, surface);
    if (typeof createImageBitmap === "function") {
      createImageBitmap(surface).then(
        (bitmap) => {
          if (images.get(item.key) === surface) images.set(item.key, bitmap);
          else bitmap.close();
        },
        () => {},
      );
    }
  }

  function tracePath(ctx, path, start, count) {
    ctx.beginPath();
    const end = start + count;
    let i = start;
    while (i < end) {
      const verb = path[i++];
      if (verb === 0) ctx.moveTo(path[i++], path[i++]);
      else if (verb === 1) ctx.lineTo(path[i++], path[i++]);
      else if (verb === 2) ctx.quadraticCurveTo(path[i++], path[i++], path[i++], path[i++]);
      else if (verb === 3) ctx.bezierCurveTo(path[i++], path[i++], path[i++], path[i++], path[i++], path[i++]);
      else ctx.closePath();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, w, h, radius);
      return;
    }
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  return function draw(canvas, frame) {
    if (!canvas || !frame) return false;
    const drops = new Int32Array(frame.drops || new ArrayBuffer(0));
    for (const key of drops) forget(key);
    for (const item of frame.uploads || []) upload(item);
    const width = frame.width | 0;
    const height = frame.height | 0;
    if (width <= 0 || height <= 0) return false;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      context = null;
    }
    if (!context || contextCanvas !== canvas) {
      context = canvas.getContext("2d", { alpha: false });
      contextCanvas = canvas;
    }
    const ctx = context;
    if (!ctx) return false;
    const ints = new Int32Array(frame.ops);
    const floats = new Float32Array(frame.ops);
    const path = new Float32Array(frame.path || new ArrayBuffer(0));
    const count = (ints.length / OP_WORDS) | 0;
    ctx.save();
    for (let n = 0; n < count; n += 1) {
      const o = n * OP_WORDS;
      const kind = ints[o];
      const color = ints[o + 1] >>> 0;
      const flags = ints[o + 2];
      const x = floats[o + 4];
      const y = floats[o + 5];
      const w = floats[o + 6];
      const h = floats[o + 7];
      if (kind === SAVE) {
        ctx.save();
      } else if (kind === RESTORE) {
        ctx.restore();
      } else if (kind === CLIP) {
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
      } else if (kind === FILL) {
        ctx.fillStyle = cssColor(color, colors);
        ctx.fillRect(0, 0, width, height);
      } else if (kind === RECT) {
        ctx.fillStyle = cssColor(color, colors);
        ctx.fillRect(x, y, w, h);
      } else if (kind === ROUND_RECT) {
        ctx.fillStyle = cssColor(color, colors);
        roundRect(ctx, x, y, w, h, floats[o + 12]);
        ctx.fill();
      } else if (kind === LINE) {
        ctx.strokeStyle = cssColor(color, colors);
        ctx.lineWidth = floats[o + 12] || 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(w, h);
        ctx.stroke();
      } else if (kind === PATH) {
        ctx.fillStyle = cssColor(color, colors);
        tracePath(ctx, path, ints[o + 13], ints[o + 14]);
        ctx.fill();
      } else if (kind === IMAGE) {
        const image = images.get(ints[o + 3]);
        if (!image) continue;
        ctx.imageSmoothingEnabled = (flags & FLAG_SMOOTH) !== 0;
        if (flags & FLAG_INVERT) {
          if (canFilter) {
            ctx.filter = "invert(1)";
            ctx.drawImage(image, floats[o + 8], floats[o + 9], floats[o + 10], floats[o + 11], x, y, w, h);
            ctx.filter = "none";
          } else {
            // filter 가 없는 브라우저: 그림을 그린 자리의 색을 흰색과의 차로 뒤집는다.
            ctx.drawImage(image, floats[o + 8], floats[o + 9], floats[o + 10], floats[o + 11], x, y, w, h);
            ctx.globalCompositeOperation = "difference";
            ctx.fillStyle = "#fff";
            ctx.fillRect(x, y, w, h);
            ctx.globalCompositeOperation = "source-over";
          }
        } else {
          ctx.drawImage(image, floats[o + 8], floats[o + 9], floats[o + 10], floats[o + 11], x, y, w, h);
        }
      }
    }
    ctx.restore();
    return true;
  };
}
