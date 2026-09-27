import * as THREE from 'three';

// The wanted poster artwork, drawn from primitives rather than loaded from a
// file: the game ships no photographs, and a stylised mugshot avoids putting
// any real person's face on a wanted notice.
//
// Both the HUD panel and the posters pasted on buildings draw from here, so
// the two never drift apart.

export const POSTER_W = 300;
export const POSTER_H = 360;

const PAPER = '#f4e7c8';
const PAPER_DARK = '#e2cfa2';
const INK = '#2a2f38';
const COAT = '#3d4a57';

// Paints the portrait into any 2D canvas context at the poster's own scale.
export function drawPortrait(ctx, { w = POSTER_W, h = POSTER_H, bounty = '' } = {}) {
  const cx = w / 2;

  // Paper, with a slightly darker border so it reads as a pasted sheet.
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(42, 47, 56, 0.45)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);

  // Heading banner.
  const bannerH = 62;
  ctx.fillStyle = INK;
  ctx.fillRect(14, 14, w - 28, bannerH);
  ctx.fillStyle = PAPER;
  ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('WANTED', cx, 14 + bannerH / 2);
  ctx.fillStyle = INK;
  ctx.fillRect(14, 14 + bannerH, w - 28, 4);

  // The mugshot takes the space left between the banner and the caption, so
  // the whole bust fits with the head well clear of the top edge. Sizing the
  // frame by a fraction of the canvas height cropped the head off instead.
  const captionH = 84;
  const fx = 22;
  const fy = 14 + bannerH + 14;
  const fw = w - 44;
  const fh = h - fy - captionH;
  ctx.fillStyle = PAPER_DARK;
  ctx.fillRect(fx, fy, fw, fh);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.strokeRect(fx, fy, fw, fh);

  ctx.save();
  ctx.beginPath();
  ctx.rect(fx, fy, fw, fh);
  ctx.clip();

  // Height-chart bands.
  ctx.strokeStyle = 'rgba(42, 47, 56, 0.18)';
  ctx.lineWidth = 2;
  for (let y = fy + 26; y < fy + fh; y += 40) {
    ctx.beginPath();
    ctx.moveTo(fx, y);
    ctx.lineTo(fx + fw, y);
    ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = 'rgba(42, 47, 56, 0.35)';
    ctx.fillRect(fx + 8, fy + 34 + i * 40, 16, 2);
  }

  // The figure, scaled so the whole bust fits inside the frame with a little
  // headroom. The drawing is authored against a ~250-unit tall figure, so the
  // scale comes from the frame's height; deriving it from the width instead
  // overshot and pushed the head out through the top of the artwork.
  const u = fh / 285;
  const bx = fx + fw / 2;
  const by = fy + fh;

  // Shoulders and coat.
  ctx.fillStyle = COAT;
  ctx.beginPath();
  ctx.moveTo(bx - 96 * u, by);
  ctx.quadraticCurveTo(bx - 88 * u, by - 76 * u, bx - 42 * u, by - 92 * u);
  ctx.lineTo(bx + 42 * u, by - 92 * u);
  ctx.quadraticCurveTo(bx + 88 * u, by - 76 * u, bx + 96 * u, by);
  ctx.closePath();
  ctx.fill();

  // Collar.
  ctx.fillStyle = '#57697a';
  ctx.beginPath();
  ctx.moveTo(bx - 42 * u, by - 92 * u);
  ctx.lineTo(bx, by - 58 * u);
  ctx.lineTo(bx + 42 * u, by - 92 * u);
  ctx.closePath();
  ctx.fill();

  // Neck.
  ctx.fillStyle = '#a9714b';
  ctx.fillRect(bx - 18 * u, by - 122 * u, 36 * u, 36 * u);

  // Head.
  ctx.fillStyle = '#c98f63';
  ctx.beginPath();
  ctx.ellipse(bx, by - 156 * u, 44 * u, 52 * u, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ears.
  ctx.beginPath();
  ctx.ellipse(bx - 44 * u, by - 154 * u, 9 * u, 13 * u, 0, 0, Math.PI * 2);
  ctx.ellipse(bx + 44 * u, by - 154 * u, 9 * u, 13 * u, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair, swept back off the brow.
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(bx, by - 188 * u, 47 * u, 32 * u, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(bx, by - 186 * u, 47 * u, 20 * u, 0, 0, Math.PI * 2);
  ctx.fill();

  // Brows.
  ctx.fillRect(bx - 30 * u, by - 168 * u, 22 * u, 5 * u);
  ctx.fillRect(bx + 8 * u, by - 168 * u, 22 * u, 5 * u);

  // Eyes.
  for (const dx of [-19 * u, 19 * u]) {
    ctx.fillStyle = '#f6f2e8';
    ctx.beginPath();
    ctx.ellipse(bx + dx, by - 152 * u, 11 * u, 7 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(bx + dx, by - 152 * u, 5 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(bx + dx - 2 * u, by - 154 * u, 1.6 * u, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nose.
  ctx.strokeStyle = '#a9714b';
  ctx.lineWidth = 5 * u;
  ctx.beginPath();
  ctx.moveTo(bx, by - 148 * u);
  ctx.lineTo(bx - 4 * u, by - 130 * u);
  ctx.stroke();

  // Mouth.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6 * u;
  ctx.beginPath();
  ctx.moveTo(bx - 13 * u, by - 114 * u);
  ctx.quadraticCurveTo(bx, by - 118 * u, bx + 13 * u, by - 114 * u);
  ctx.stroke();

  ctx.restore();

  // Caption block under the mugshot, laid out inside the space reserved for it.
  const capTop = fy + fh;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
  ctx.fillText('RECKLESS DRIVING', cx, capTop + 24);

  if (bounty) {
    ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#c43d29';
    ctx.fillText(bounty, cx, capTop + 62);
  }
}

// A square-ish canvas with the poster pre-rendered, tagged as a texture. This
// is the same artwork used on the buildings, so the two never drift apart.
export function makePosterTexture({ bounty = '' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;
  const ctx = canvas.getContext('2d');
  drawPortrait(ctx, { bounty });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
