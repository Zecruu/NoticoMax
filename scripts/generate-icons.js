// Simple script to generate PWA icons as PNG using canvas
// Run with: node scripts/generate-icons.js

const fs = require("fs");
const path = require("path");

// Create a simple SVG icon
function createSVG(size) {
  const padding = Math.round(size * 0.15);
  const iconSize = size - padding * 2;
  const cornerRadius = Math.round(size * 0.08);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${cornerRadius}" fill="#0a0a0a"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="${Math.round(iconSize * 0.45)}" fill="#ffffff">N</text>
  <rect x="${padding + iconSize * 0.15}" y="${size - padding - iconSize * 0.12}" width="${iconSize * 0.7}" height="${Math.round(iconSize * 0.04)}" rx="${Math.round(iconSize * 0.02)}" fill="#3b82f6"/>
</svg>`;
}

const iconsDir = path.join(__dirname, "..", "public", "icons");
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Write SVG files (browsers can use these, and we'll reference them)
[192, 512].forEach((size) => {
  const svg = createSVG(size);
  fs.writeFileSync(path.join(iconsDir, `icon-${size}x${size}.svg`), svg);
  console.log(`Generated icon-${size}x${size}.svg`);
});
