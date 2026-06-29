// sources.mjs — trend discovery. Runs on YOUR machine / GitHub Actions (needs internet).
// Pulls candidate topics from Google Trends RSS + Reddit hot, filtered to our clusters.
// No API keys required for these sources.
import { CLUSTERS } from './config.mjs'

const SUBREDDITS = {
  phones: ['gadgets', 'Android', 'apple', 'smartphones'],
  laptops: ['laptops', 'pcmasterrace', 'buildapc'],
  audio: ['headphones', 'audiophile', 'earbuds'],
  'smart-home': ['smarthome', 'homeautomation'],
  gaming: ['pcgaming', 'GamingLaptops', 'SteamDeck'],
}

const UA = { 'user-agent': 'GadgetPulseBot/1.0 (+https://gadgetpulse.pages.dev)' }

// Google Trends daily RSS. geo can be US/GB/CA/AU.
function trendsRssUrl(geo) {
  return 'https://trends.google.com/trends/trendingsearches/daily/rss?geo=' + geo
}
function redditHotUrl(sub, limit) {
  return 'https://www.reddit.com/r/' + sub + '/hot.json?limit=' + limit
}

async function getJson(url) {
  const r = await fetch(url, { headers: UA })
  if (!r.ok) throw new Error(r.status + ' ' + url)
  return r.json()
}
async function getText(url) {
  const r = await fetch(url, { headers: UA })
  if (!r.ok) throw new Error(r.status + ' ' + url)
  return r.text()
}

export async function redditTopics(cluster, limit = 8) {
  const subs = SUBREDDITS[cluster] || []
  const out = []
  for (const s of subs) {
    try {
      const data = await getJson(redditHotUrl(s, limit))
      for (const c of data?.data?.children || []) {
        const p = c.data
        if (p.stickied || p.over_18) continue
        out.push({ cluster, title: p.title, score: p.score, url: 'https://reddit.com' + p.permalink, source: 'r/' + s })
      }
    } catch (e) { console.warn('reddit', s, e.message) }
  }
  return out.sort((a, b) => b.score - a.score)
}

export async function trendsTopics(geo = 'US') {
  try {
    const xml = await getText(trendsRssUrl(geo))
    const titles = [...xml.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/g)].map((m) => m[1]).slice(1)
    return titles.map((t) => ({ title: t, source: 'trends:' + geo }))
  } catch (e) { console.warn('trends', e.message); return [] }
}

// Returns ranked candidate topics across all clusters, skipping anything we already covered.
export async function gatherTopics({ existingSlugs = new Set(), perCluster = 6 } = {}) {
  const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const all = []
  for (const cluster of Object.keys(CLUSTERS)) {
    const topics = await redditTopics(cluster, perCluster)
    for (const t of topics) {
      const slug = slugify(t.title).slice(0, 70)
      if (!slug || existingSlugs.has(slug)) continue
      all.push({ ...t, slug })
    }
  }
  return all
}
