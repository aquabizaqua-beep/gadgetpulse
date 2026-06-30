// GadgetPulse static renderer. Reads data/articles.json + config.mjs and writes
// a Discover-friendly static site into dist/. No external deps (pure Node).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONFIG, CLUSTERS, AUTHORS, CLUSTER_COLOR } from './config.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const D = CONFIG.DOMAIN
const OUT = path.resolve(__dirname, CONFIG.OUT)
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'articles.json'), 'utf8'))

// Backfill missing cover images so every article has a 1200x675 JPG. Self-heals
// articles generated when the image step failed (e.g. ImageMagick missing).
{
  const { placeholder } = await import('./images.mjs')
  for (const a of DATA) {
    if (!a.image) a.image = 'img/' + a.slug + '.jpg'
    const rel = String(a.image).replace(/^\//, '')
    const fp = path.join(__dirname, rel)
    if (!fs.existsSync(fp)) {
      try { await placeholder(fp, a.imageAlt || a.title, CLUSTER_COLOR[a.cluster] || '#6d28d9'); console.log('backfilled cover:', a.slug) }
      catch (e) { console.warn('backfill failed', a.slug, e.message) }
    }
  }
}

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const attr = esc
const jsonld = (o) => JSON.stringify(o).replace(/</g, '\\u003c')
function write(rel, html) { const fp = path.join(OUT, rel); fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, html) }
const fmtDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
const clusterOf = (a) => CLUSTERS[a.cluster] || { name: a.cluster, emoji: '', desc: '' }
const authorOf = (a) => AUTHORS[a.author] || { name: a.author, role: '', bio: '', avatar: '/img/logo.png' }
const urlArticle = (a) => `${D}/${a.slug}/`
const urlCluster = (k) => `${D}/${k}/`
const urlAuthor = (k) => `${D}/author/${k}/`
const imgUrl = (a) => `${D}/${String(a.image).replace(/^\//, '')}`

const articles = [...DATA].sort((x, y) => (y.date || '').localeCompare(x.date || ''))
const now = new Date().toISOString()

const CSS = `
:root{--bg:#ffffff;--ink:#0f172a;--muted:#64748b;--line:#e5e7eb;--brand:#6d28d9;--card:#fff}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg);line-height:1.65;font-size:18px}
img{max-width:100%;height:auto;display:block}
a{color:var(--brand);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1100px;margin:0 auto;padding:0 16px}
.site-head{border-bottom:1px solid var(--line);position:sticky;top:0;background:rgba(255,255,255,.92);backdrop-filter:saturate(180%) blur(8px);z-index:20}
.site-head .wrap{display:flex;align-items:center;gap:16px;height:60px}
.logo{font-weight:800;font-size:22px;color:var(--ink);letter-spacing:-.02em}
.logo span{color:var(--brand)}
.nav{display:flex;gap:14px;flex-wrap:wrap;font-size:15px;font-weight:600;margin-left:auto}
.nav a{color:var(--muted)}
.layout{display:grid;grid-template-columns:1fr;gap:28px;padding:24px 0}
@media(min-width:900px){.layout{grid-template-columns:1fr 320px}}
.tag{display:inline-block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#fff;padding:3px 9px;border-radius:999px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;margin-bottom:22px}
.card .thumb{aspect-ratio:16/9;width:100%;object-fit:cover;background:#f1f5f9}
.card .body{padding:14px 16px 18px}
.card h2{font-size:21px;margin:8px 0 6px;line-height:1.25;letter-spacing:-.01em}
.card h2 a{color:var(--ink)}
.card .dek{color:var(--muted);font-size:15px;margin:0 0 10px}
.meta{color:var(--muted);font-size:13px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.lead-img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:14px;background:#f1f5f9}
.credit{color:var(--muted);font-size:12px;margin:6px 2px 0}
article h1{font-size:32px;line-height:1.2;letter-spacing:-.02em;margin:6px 0 10px}
article h2{font-size:23px;margin:30px 0 8px;letter-spacing:-.01em}
article p{margin:14px 0}
article ul{margin:14px 0;padding-left:22px}article li{margin:6px 0}
.dek-lead{font-size:20px;color:#334155;margin:0 0 16px}
.breadcrumb{font-size:13px;color:var(--muted);margin:10px 0 4px}
.breadcrumb a{color:var(--muted)}
.authorbox{display:flex;gap:14px;align-items:center;border:1px solid var(--line);border-radius:14px;padding:14px;margin:26px 0}
.authorbox img{width:56px;height:56px;border-radius:50%;flex:0 0 auto}
.authorbox .n{font-weight:700}
.authorbox .r{color:var(--muted);font-size:14px}
.faq{border-top:1px solid var(--line);margin-top:30px;padding-top:8px}
.faq h2{margin-top:18px}
.faq details{border-bottom:1px solid var(--line);padding:12px 0}
.faq summary{font-weight:600;cursor:pointer}
.faq p{margin:8px 0 0;color:#334155}
.sources{font-size:14px;color:var(--muted);margin-top:24px}
.ad{margin:26px 0;text-align:center;min-height:1px}
.ad-side{position:sticky;top:80px}
.side h3{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 12px}
.side .mini{display:flex;gap:10px;margin-bottom:14px}
.side .mini img{width:84px;height:56px;object-fit:cover;border-radius:8px;flex:0 0 auto}
.side .mini a{color:var(--ink);font-weight:600;font-size:14px;line-height:1.3}
.hero-cluster{font-size:14px;color:var(--muted);margin:18px 0 0}
.cluster-grid{display:grid;grid-template-columns:1fr;gap:0}
.site-foot{border-top:1px solid var(--line);margin-top:40px;padding:26px 0;color:var(--muted);font-size:14px}
.site-foot a{color:var(--muted)}
.site-foot .nav2{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px}
.pills{display:flex;gap:8px;flex-wrap:wrap;margin:2px 0 0}
`

function nav() {
  const links = Object.entries(CLUSTERS).map(([k, c]) => `<a href="${urlCluster(k)}">${esc(c.name)}</a>`).join('')
  return `<header class="site-head"><div class="wrap"><a class="logo" href="${D}/">Gadget<span>Pulse</span></a><nav class="nav">${links}</nav></div></header>`
}

function footer() {
  return `<footer class="site-foot"><div class="wrap"><div class="nav2"><a href="${D}/about/">About</a><a href="${D}/contact/">Contact</a><a href="${D}/privacy/">Privacy</a></div><div>&copy; ${new Date().getFullYear()} ${esc(CONFIG.SITE)}. Independent gadget coverage. Some links may be affiliate links.</div></div>${CONFIG.SOCIAL_BAR || ''}</footer>`
}

function sidebar() {
  const recent = articles.slice(0, 5).map((a) => `<div class="mini"><a href="${urlArticle(a)}"><img loading="lazy" src="${D}/${String(a.image).replace(/^\//, '')}" alt="${attr(a.imageAlt || a.title)}"></a><a href="${urlArticle(a)}">${esc(a.title)}</a></div>`).join('')
  const ad = CONFIG.AD_SIDEBAR ? `<div class="ad ad-side">${CONFIG.AD_SIDEBAR}</div>` : ''
  return `<aside class="side">${ad}<h3>Latest</h3>${recent}${CONFIG.AD_SIDEBAR ? `<div class="ad">${CONFIG.AD_SIDEBAR}</div>` : ''}</aside>`
}

function page({ title, desc, url, image, bodyHtml, schema, withSidebar = true }) {
  const head = `<!doctype html><html lang="${CONFIG.LANG}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${attr(desc)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<link rel="canonical" href="${url}">
<meta property="og:type" content="${image ? 'article' : 'website'}">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="${attr(CONFIG.SITE)}">
${image ? `<meta property="og:image" content="${image}"><meta name="twitter:card" content="summary_large_image">` : `<meta name="twitter:card" content="summary">`}
<link rel="icon" href="${D}/img/logo.png">
<link rel="alternate" type="application/rss+xml" title="${attr(CONFIG.SITE)}" href="${D}/rss.xml">
${CONFIG.HEAD_EXTRA || ''}
<style>${CSS}</style>
${schema ? `<script type="application/ld+json">${jsonld(schema)}</script>` : ''}
</head><body>${nav()}<main class="wrap"><div class="layout">`
  const main = withSidebar ? `<div>${bodyHtml}</div>${sidebar()}` : `<div style="grid-column:1/-1">${bodyHtml}</div>`
  return head + main + `</div></main>${footer()}</body></html>`
}

function cardHtml(a) {
  const c = clusterOf(a); const au = authorOf(a)
  return `<article class="card"><a href="${urlArticle(a)}"><img class="thumb" loading="lazy" src="${D}/${String(a.image).replace(/^\//, '')}" alt="${attr(a.imageAlt || a.title)}"></a><div class="body"><span class="tag" style="background:${CLUSTER_COLOR[a.cluster] || '#6d28d9'}">${esc(c.name)}</span><h2><a href="${urlArticle(a)}">${esc(a.title)}</a></h2><p class="dek">${esc(a.dek)}</p><div class="meta"><span>${esc(au.name)}</span><span>&middot;</span><span>${fmtDate(a.date)}</span></div></div></article>`
}

function renderBody(blocks) {
  let out = ''; let paras = 0; let adInjected = false
  for (const b of blocks) {
    if (b.type === 'h2') out += `<h2>${esc(b.text)}</h2>`
    else if (b.type === 'ul') out += `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
    else { out += `<p>${esc(b.text)}</p>`; paras++; if (paras === 2 && !adInjected && CONFIG.AD) { out += `<div class="ad">${CONFIG.AD}</div>`; adInjected = true } }
  }
  if (!adInjected && CONFIG.AD) out += `<div class="ad">${CONFIG.AD}</div>`
  return out
}

// ---------- Article pages ----------
for (const a of articles) {
  const c = clusterOf(a); const au = authorOf(a)
  const bc = { '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: D + '/' },
    { '@type': 'ListItem', position: 2, name: c.name, item: urlCluster(a.cluster) },
    { '@type': 'ListItem', position: 3, name: a.title, item: urlArticle(a) },
  ] }
  const newsArticle = {
    '@type': 'NewsArticle', headline: a.title, description: a.dek,
    image: [imgUrl(a)], datePublished: a.date, dateModified: a.dateModified || a.date,
    author: { '@type': 'Person', name: au.name, url: urlAuthor(a.author) },
    publisher: { '@type': 'Organization', name: CONFIG.ORG.name, logo: { '@type': 'ImageObject', url: D + CONFIG.ORG.logo } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': urlArticle(a) },
  }
  const graph = ['@context', 'https://schema.org']
  const schema = { '@context': 'https://schema.org', '@graph': [newsArticle, bc] }
  if (a.faq && a.faq.length) {
    schema['@graph'].push({ '@type': 'FAQPage', mainEntity: a.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) })
  }
  const related = articles.filter((x) => x.cluster === a.cluster && x.slug !== a.slug).slice(0, 3)
  const faqHtml = (a.faq && a.faq.length) ? `<section class="faq"><h2>Frequently asked questions</h2>${a.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>` : ''
  const sourcesHtml = (a.sources && a.sources.length) ? `<div class="sources"><strong>Sources:</strong> ${a.sources.map((s) => `<a href="${attr(s.url)}" rel="nofollow noopener" target="_blank">${esc(s.title)}</a>`).join(' &middot; ')}</div>` : ''
  const relatedHtml = related.length ? `<h2>More in ${esc(c.name)}</h2>${related.map(cardHtml).join('')}` : ''
  const body = `<nav class="breadcrumb"><a href="${D}/">Home</a> &rsaquo; <a href="${urlCluster(a.cluster)}">${esc(c.name)}</a></nav>
<article><span class="tag" style="background:${CLUSTER_COLOR[a.cluster] || '#6d28d9'}">${esc(c.name)}</span>
<h1>${esc(a.title)}</h1>
<p class="dek-lead">${esc(a.dek)}</p>
<div class="meta"><span>By <a href="${urlAuthor(a.author)}">${esc(au.name)}</a></span><span>&middot;</span><span>${fmtDate(a.date)}</span></div>
<figure><img class="lead-img" src="${D}/${String(a.image).replace(/^\//, '')}" alt="${attr(a.imageAlt || a.title)}" width="1200" height="675"><figcaption class="credit">${esc(a.imageCredit || '')}</figcaption></figure>
${renderBody(a.body)}
${faqHtml}
${sourcesHtml}
<div class="authorbox"><img src="${D}${au.avatar}" alt="${attr(au.name)}"><div><div class="n">${esc(au.name)}</div><div class="r">${esc(au.role)}</div><div class="r">${esc(au.bio)}</div></div></div>
${relatedHtml}
</article>`
  write(`${a.slug}/index.html`, page({ title: `${a.title} | ${CONFIG.SITE}`, desc: a.dek, url: urlArticle(a), image: imgUrl(a), bodyHtml: body, schema }))
}

// ---------- Home ----------
{
  const feed = articles.map(cardHtml).join('')
  const schema = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', name: CONFIG.SITE, url: D + '/', description: CONFIG.DESC, potentialAction: { '@type': 'SearchAction', target: D + '/?q={q}', 'query-input': 'required name=q' } },
    { '@type': 'Organization', name: CONFIG.ORG.name, url: D + '/', logo: D + CONFIG.ORG.logo },
  ] }
  write('index.html', page({ title: `${CONFIG.SITE} — ${CONFIG.TAGLINE}`, desc: CONFIG.DESC, url: D + '/', image: D + '/img/logo.png', bodyHtml: feed, schema }))
}

// ---------- Cluster hubs ----------
for (const [k, c] of Object.entries(CLUSTERS)) {
  const items = articles.filter((a) => a.cluster === k)
  if (!items.length) continue
  const body = `<h1>${c.emoji} ${esc(c.name)}</h1><p class="dek-lead">${esc(c.desc)}</p>${items.map(cardHtml).join('')}`
  const schema = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: c.name, url: urlCluster(k), description: c.desc }
  write(`${k}/index.html`, page({ title: `${c.name} | ${CONFIG.SITE}`, desc: c.desc, url: urlCluster(k), image: D + '/img/logo.png', bodyHtml: body, schema }))
}

// ---------- Author pages ----------
for (const [k, au] of Object.entries(AUTHORS)) {
  const items = articles.filter((a) => a.author === k)
  const body = `<div class="authorbox"><img src="${D}${au.avatar}" alt="${attr(au.name)}"><div><div class="n" style="font-size:22px">${esc(au.name)}</div><div class="r">${esc(au.role)}</div></div></div><p>${esc(au.bio)}</p><h2>Latest by ${esc(au.name)}</h2>${items.map(cardHtml).join('') || '<p>No articles yet.</p>'}`
  const schema = { '@context': 'https://schema.org', '@type': 'Person', name: au.name, jobTitle: au.role, description: au.bio, url: urlAuthor(k) }
  write(`author/${k}/index.html`, page({ title: `${au.name} | ${CONFIG.SITE}`, desc: au.bio, url: urlAuthor(k), image: D + au.avatar, bodyHtml: body, schema }))
}

// ---------- Static trust pages ----------
const staticPage = (slug, title, html) => write(`${slug}/index.html`, page({ title: `${title} | ${CONFIG.SITE}`, desc: `${title} — ${CONFIG.SITE}`, url: `${D}/${slug}/`, image: D + '/img/logo.png', bodyHtml: `<article><h1>${esc(title)}</h1>${html}</article>`, withSidebar: false }))
staticPage('about', 'About GadgetPulse', `<p>${esc(CONFIG.DESC)}</p><p>GadgetPulse is an independent publication covering consumer technology — phones, laptops, audio, smart home and gaming gear. We publish clear, jargon-light coverage aimed at helping readers decide what is worth their money.</p><p>Our articles are written and edited by people who test and follow this hardware daily. When we cite outside reporting, we link to it.</p><h2>Editorial approach</h2><p>We avoid clickbait and we update stories as facts change. Where we earn a commission from affiliate links, it never influences our recommendations.</p>`)
staticPage('contact', 'Contact', `<p>Questions, corrections or tips? Email us at <a href="mailto:${CONFIG.EMAIL}">${CONFIG.EMAIL}</a>.</p><p>We welcome corrections and aim to respond within a few business days.</p>`)
staticPage('privacy', 'Privacy Policy', `<p>This site uses cookies and third-party advertising partners (including Adsterra) that may use cookies or similar technologies to serve and measure ads. Affiliate partners may also set cookies.</p><h2>What we collect</h2><p>We use privacy-respecting analytics to understand aggregate traffic. We do not sell personal data.</p><h2>Advertising</h2><p>Third-party vendors may use cookies to serve ads based on prior visits. You can opt out of personalized advertising through your ad settings.</p><h2>Contact</h2><p>Privacy questions: <a href="mailto:${CONFIG.EMAIL}">${CONFIG.EMAIL}</a>.</p>`)

// ---------- robots.txt ----------
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${D}/sitemap.xml\nSitemap: ${D}/news-sitemap.xml\n`)

// ---------- sitemap.xml (with image extension) ----------
{
  const urls = []
  urls.push({ loc: D + '/', lastmod: now })
  for (const k of Object.keys(CLUSTERS)) if (articles.some((a) => a.cluster === k)) urls.push({ loc: urlCluster(k), lastmod: now })
  for (const k of Object.keys(AUTHORS)) urls.push({ loc: urlAuthor(k), lastmod: now })
  for (const s of ['about', 'contact', 'privacy']) urls.push({ loc: `${D}/${s}/`, lastmod: now })
  for (const a of articles) urls.push({ loc: urlArticle(a), lastmod: (a.dateModified || a.date) + 'T12:00:00Z', image: imgUrl(a), title: a.title })
  const body = urls.map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod>${u.image ? `<image:image><image:loc>${esc(u.image)}</image:loc><image:title>${esc(u.title)}</image:title></image:image>` : ''}</url>`).join('\n')
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${body}\n</urlset>\n`)
}

// ---------- news-sitemap.xml (articles from the last 2 days) ----------
{
  const cutoff = Date.now() - 2 * 864e5
  const recent = articles.filter((a) => new Date(a.date + 'T12:00:00Z').getTime() >= cutoff)
  const body = recent.map((a) => `  <url><loc>${esc(urlArticle(a))}</loc><news:news><news:publication><news:name>${esc(CONFIG.SITE)}</news:name><news:language>${CONFIG.LANG}</news:language></news:publication><news:publication_date>${a.date}</news:publication_date><news:title>${esc(a.title)}</news:title></news:news></url>`).join('\n')
  write('news-sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${body}\n</urlset>\n`)
}

// ---------- rss.xml ----------
{
  const items = articles.slice(0, 20).map((a) => `    <item><title>${esc(a.title)}</title><link>${urlArticle(a)}</link><guid isPermaLink="true">${urlArticle(a)}</guid><pubDate>${new Date(a.date + 'T12:00:00Z').toUTCString()}</pubDate><description>${esc(a.dek)}</description></item>`).join('\n')
  write('rss.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${esc(CONFIG.SITE)}</title><link>${D}/</link><description>${esc(CONFIG.DESC)}</description><language>${CONFIG.LANG}</language>\n${items}\n</channel></rss>\n`)
}

// ---------- copy /img assets into dist ----------
const imgSrc = path.join(__dirname, 'img')
if (fs.existsSync(imgSrc)) {
  const dst = path.join(OUT, 'img'); fs.mkdirSync(dst, { recursive: true })
  for (const f of fs.readdirSync(imgSrc)) fs.copyFileSync(path.join(imgSrc, f), path.join(dst, f))
}

console.log(`Built ${articles.length} articles + ${Object.keys(CLUSTERS).length} clusters into ${OUT}`)
