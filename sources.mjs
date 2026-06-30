// sources.mjs — trend discovery that works from datacenter IPs (GitHub Actions).
// Priority order:
//   1) Hacker News (Algolia API) — no key, reliable from CI/datacenter IPs.
//   2) Reddit hot — best effort (works locally, usually BLOCKED on CI IPs).
//   3) Curated editorial fallback — guarantees the pipeline always has topics,
//      so the auto-publisher never silently produces nothing.
import { CLUSTERS } from './config.mjs'

const UA = { 'user-agent': 'GadgetPulseBot/1.0 (+https://gadgetpulse.pages.dev)' }

const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70)

// keyword -> cluster classification (used to map live headlines into our sections)
const CLUSTER_KEYWORDS = {
  phones: ['iphone', 'android', 'smartphone', 'pixel', 'galaxy', 'foldable', 'oneplus', 'smartwatch', 'wearable'],
  laptops: ['laptop', 'macbook', 'thinkpad', 'ultrabook', 'ryzen', 'intel core', 'snapdragon x', 'chromebook'],
  audio: ['headphone', 'earbud', 'airpods', 'soundbar', 'bluetooth speaker', 'noise cancel', 'noise-cancel'],
  'smart-home': ['smart home', 'matter', 'home assistant', 'thread protocol', 'smart bulb', 'smart plug', 'home automation'],
  gaming: ['steam deck', 'nintendo switch', 'handheld', 'gaming laptop', 'graphics card', 'gpu', 'rog ally'],
}

function classify(title) {
  const t = String(title).toLowerCase()
  for (const [cluster, kws] of Object.entries(CLUSTER_KEYWORDS)) {
    if (kws.some((k) => t.includes(k))) return cluster
  }
  return null
}

async function getJson(url) {
  const r = await fetch(url, { headers: UA })
  if (!r.ok) throw new Error(r.status + ' ' + url)
  return r.json()
}

// ---- 1) Hacker News (Algolia) — reliable from datacenter IPs --------------
export async function hnTopics({ minPoints = 20 } = {}) {
  // Use HTTPS and skip the server-side numericFilters param: the URL-encoded
  // ">" points filter was returning HTTP 400 from datacenter IPs. We fetch and
  // filter by points client-side instead, which is robust.
  const base = 'https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=30&query='
  const queries = [
    'iphone', 'android phone', 'foldable phone', 'smartwatch',
    'laptop', 'macbook', 'gaming laptop',
    'headphones', 'wireless earbuds',
    'smart home', 'matter standard', 'home assistant',
    'steam deck', 'nintendo switch', 'graphics card',
  ]
  const out = []
  const seen = new Set()
  for (const q of queries) {
    try {
      const data = await getJson(base + encodeURIComponent(q))
      for (const h of data?.hits || []) {
        const title = h.title
        if (!title || seen.has(title)) continue
        if ((h.points || 0) < minPoints) continue
        const cluster = classify(title)
        if (!cluster) continue
        seen.add(title)
        out.push({
          cluster, title, score: h.points || 0,
          url: 'https://news.ycombinator.com/item?id=' + h.objectID, source: 'hn',
        })
      }
    } catch (e) { console.warn('hn', q, e.message) }
  }
  return out.sort((a, b) => b.score - a.score)
}

// ---- 2) Reddit hot — best effort (usually blocked on CI) ------------------
const SUBREDDITS = {
  phones: ['gadgets', 'Android', 'apple', 'smartphones'],
  laptops: ['laptops', 'pcmasterrace', 'buildapc'],
  audio: ['headphones', 'audiophile', 'earbuds'],
  'smart-home': ['smarthome', 'homeautomation'],
  gaming: ['pcgaming', 'GamingLaptops', 'SteamDeck'],
}
export async function redditTopics(cluster, limit = 8) {
  const subs = SUBREDDITS[cluster] || []
  const out = []
  for (const s of subs) {
    try {
      const data = await getJson('https://www.reddit.com/r/' + s + '/hot.json?limit=' + limit)
      for (const c of data?.data?.children || []) {
        const p = c.data
        if (p.stickied || p.over_18) continue
        out.push({ cluster, title: p.title, score: p.score, url: 'https://reddit.com' + p.permalink, source: 'r/' + s })
      }
    } catch (e) { console.warn('reddit', s, e.message) }
  }
  return out.sort((a, b) => b.score - a.score)
}

// ---- 3) Curated editorial fallback — always available ---------------------
// Varied angles (how-to, explainer, comparison) across ALL clusters — not a
// pile of near-identical "best X to buy" posts. Each cluster's list is rotated
// by day-of-year so the first-picked angle changes daily, and the aggregator
// interleaves clusters so the daily output stays topically balanced.
function fallbackTopics() {
  const now = new Date()
  const y = now.getFullYear()
  const doy = Math.floor((now - new Date(y, 0, 0)) / 864e5)
  const pool = {
    phones: [
      `iPhone vs Android in ${y}: which should you choose`,
      `Are foldable phones worth it in ${y}?`,
      `How to make your phone battery last longer`,
      `Phone storage: how much do you actually need in ${y}?`,
      `eSIM explained: switching carriers without a physical SIM`,
      `How to speed up an aging Android phone`,
      `Smartwatch buying guide for ${y}: what actually matters`,
    ],
    laptops: [
      `MacBook vs Windows laptop in ${y}: how to decide`,
      `How much RAM and storage do you really need in ${y}?`,
      `ARM vs x86 laptops: what the chip choice means for you`,
      `How to make your laptop battery last all day`,
      `OLED vs LCD laptop screens: which is worth it`,
      `A practical laptop buying guide for students in ${y}`,
      `Why laptops slow down over time — and how to fix it`,
    ],
    audio: [
      `How noise-cancelling headphones work and who needs them`,
      `Wireless earbuds vs over-ear headphones: which to pick`,
      `Bluetooth codecs explained: do they actually matter?`,
      `How to choose earbuds for the gym`,
      `Why your earbuds sound bad — and how to fix it`,
      `Wired vs wireless audio in ${y}: is the cable dead?`,
      `What to look for in earbuds in ${y}`,
    ],
    'smart-home': [
      `How to start a smart home in ${y} without lock-in`,
      `What is Matter, and why it matters for your smart home`,
      `Local vs cloud smart homes: which is better for you`,
      `How to make your smart home faster and more private`,
      `Smart plugs and bulbs: the cheapest way to start`,
      `Keeping smart home cameras private and secure`,
      `Thread vs Wi-Fi vs Zigbee: smart home networks explained`,
    ],
    gaming: [
      `Steam Deck vs the competition in ${y}`,
      `Is the Nintendo Switch 2 worth buying in ${y}?`,
      `What graphics card should you buy in ${y}?`,
      `How to pick a handheld gaming PC that fits you`,
      `PC vs console gaming in ${y}: which makes sense`,
      `How to make games run smoother on a budget PC`,
      `Gaming laptop vs handheld: which portable should you pick`,
    ],
  }
  const out = []
  for (const [cluster, titles] of Object.entries(pool)) {
    const rot = titles.length ? (doy % titles.length) : 0
    const rotated = titles.slice(rot).concat(titles.slice(0, rot))
    for (const title of rotated) out.push({ cluster, title, score: 0, url: '', source: 'editorial' })
  }
  return out
}

// Round-robin across clusters so consecutive candidates span different sections
// (prevents a phones-heavy fallback from dominating the daily output), while
// preserving each cluster's internal order (timely live topics stay first).
function interleaveByCluster(list) {
  const groups = new Map()
  for (const t of list) {
    const k = t.cluster || 'misc'
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(t)
  }
  const arrs = [...groups.values()]
  const out = []
  for (let i = 0; out.length < list.length; i++) {
    let progressed = false
    for (const g of arrs) {
      if (i < g.length) { out.push(g[i]); progressed = true }
    }
    if (!progressed) break
  }
  return out
}

// ---- Aggregator -----------------------------------------------------------
// Returns candidate topics across all clusters, skipping anything we already
// covered. Live sources first (timely), editorial fallback last, then the whole
// set is interleaved by cluster for topical balance.
export async function gatherTopics({ existingSlugs = new Set(), perCluster = 6 } = {}) {
  const all = []
  const have = new Set()
  const pushUnique = (t) => {
    const slug = slugify(t.title)
    if (!slug || existingSlugs.has(slug) || have.has(slug)) return
    have.add(slug)
    all.push({ ...t, slug })
  }

  // 1) Hacker News (reliable on CI)
  try { for (const t of await hnTopics()) pushUnique(t) } catch (e) { console.warn('hn gather', e.message) }

  // 2) Reddit (best effort; silently empty on CI)
  for (const cluster of Object.keys(CLUSTERS)) {
    try { for (const t of await redditTopics(cluster, perCluster)) pushUnique(t) } catch {}
  }

  // 3) Editorial fallback — guarantees non-empty output
  for (const t of fallbackTopics()) pushUnique(t)

  return interleaveByCluster(all)
}
