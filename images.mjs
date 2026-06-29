// images.mjs — fetch a licensed hero image >=1200px wide and save to img/<slug>.jpg.
// Primary: Openverse (CC, no API key). Fallback: a branded SVG poster rasterized
// with sharp (no ImageMagick needed) so every article always has a 1200x675 cover.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const IMG_DIR = path.join(__dirname, 'img')
const UA = { 'user-agent': 'GadgetPulseBot/1.0 (+https://gadgetpulse.pages.dev)' }

function openverseUrl(query) {
  const q = encodeURIComponent(query)
  return 'https://api.openverse.org/v1/images/?q=' + q + '&license_type=commercial&aspect_ratio=wide&size=large&page_size=10'
}

export async function fetchImage({ slug, query, title, color = '#6d28d9' }) {
  fs.mkdirSync(IMG_DIR, { recursive: true })
  const dest = path.join(IMG_DIR, slug + '.jpg')
  try {
    const r = await fetch(openverseUrl(query || title), { headers: UA })
    if (r.ok) {
      const data = await r.json()
      const hit = (data.results || []).find((x) => (x.width || 0) >= 1200) || (data.results || [])[0]
      if (hit?.url) {
        const img = await fetch(hit.url, { headers: UA })
        if (img.ok) {
          const buf = Buffer.from(await img.arrayBuffer())
          // normalize to 1200x675 jpg with sharp if available
          try {
            const sharp = (await import('sharp')).default
            await sharp(buf).resize(1200, 675, { fit: 'cover' }).jpeg({ quality: 82 }).toFile(dest)
          } catch { fs.writeFileSync(dest, buf) }
          return { path: 'img/' + slug + '.jpg', credit: 'Photo: ' + (hit.creator || 'Openverse') + ' (' + (hit.license || 'CC') + ')', alt: title }
        }
      }
    }
  } catch (e) { console.warn('image fetch failed:', e.message) }
  await placeholder(dest, title, color)
  return { path: 'img/' + slug + '.jpg', credit: 'Illustration: GadgetPulse', alt: title }
}

// Branded gradient poster with the title, rendered via sharp (SVG -> JPG).
export async function placeholder(dest, title, color = '#6d28d9') {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // simple word-wrap (~24 chars per line, max 4 lines)
  const words = String(title || 'GadgetPulse').split(/\s+/)
  const lines = []
  let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 24 && cur) { lines.push(cur); cur = w }
    else cur = (cur + ' ' + w).trim()
  }
  if (cur) lines.push(cur)
  const shown = lines.slice(0, 4)
  const lh = 72
  const startY = Math.round(337 - ((shown.length - 1) * lh) / 2)
  const tspans = shown.map((ln, i) => '<tspan x="600" y="' + (startY + i * lh) + '">' + esc(ln) + '</tspan>').join('')
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="' + color + '"/><stop offset="100%" stop-color="#0f172a"/>' +
    '</linearGradient></defs>' +
    '<rect width="1200" height="675" fill="url(#g)"/>' +
    '<text text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="56" fill="#ffffff">' + tspans + '</text>' +
    '<text x="600" y="636" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" fill="rgba(255,255,255,0.85)">GadgetPulse</text>' +
    '</svg>'
  try {
    const sharp = (await import('sharp')).default
    await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toFile(dest)
  } catch (e) {
    console.warn('placeholder failed:', e.message)
  }
}
