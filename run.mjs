// run.mjs — the auto-publisher orchestrator: trends -> write -> image -> store -> generate.
// Usage: node run.mjs --count 3   (then deploy dist/ with publish.mjs or your CI)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { CLUSTER_COLOR, CLUSTERS, AUTHORS } from './config.mjs'
import { gatherTopics } from './sources.mjs'
import { writeArticle } from './writer.mjs'
import { fetchImage } from './images.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = path.join(__dirname, 'data', 'articles.json')
const COUNT = Number((process.argv.find((a) => a.startsWith('--count='))?.split('=')[1]) || process.env.COUNT || 3)
// Stop trying after this many consecutive write failures so a broken/slow model
// can't burn the whole CI run timing out on every topic.
const MAX_FAILS = Number(process.env.MAX_FAILS || 8)
const today = new Date().toISOString().slice(0, 10)
const authorKeys = Object.keys(AUTHORS)

// --- near-duplicate guard --------------------------------------------------
// Collapse near-identical angles (e.g. "Best phones to buy" vs "Top smartphones
// to consider: current recommendations") so we never publish multiple thin
// variants of the same topic. We reduce a title to its significant nouns,
// dropping filler/marketing words, the year, and mapping a few synonyms.
const STOP = new Set(('a an the to in on of for and or with vs your you our this that these those is are be it ' +
  'should which what why how now best top current pick picks recommendation recommendations buy buying guide ' +
  'consider considering purchase worth make right under over plus actually really do does so we i need').split(/\s+/))
const SYN = {
  smartphone: 'phone', smartphones: 'phone', phones: 'phone', cellphone: 'phone',
  earbuds: 'earbud', earbud: 'earbud', headphones: 'headphone', headphone: 'headphone',
  laptops: 'laptop', macbooks: 'macbook', consoles: 'console', handhelds: 'handheld',
}
function normKey(s) {
  const toks = String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOP.has(w))
    .filter((w) => !/^20\d\d$/.test(w))
    .map((w) => SYN[w] || w)
  const uniq = [...new Set(toks)].sort()
  return uniq.join('-') || String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function load() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) } catch { return [] } }
function save(a) { fs.writeFileSync(DATA_FILE, JSON.stringify(a, null, 2)) }

const existing = load()
const slugs = new Set(existing.map((a) => a.slug))
const usedKeys = new Set(existing.map((a) => normKey(a.title)))

const topics = await gatherTopics({ existingSlugs: slugs, perCluster: 6 })
console.log(`Found ${topics.length} candidate topic(s). Target: ${COUNT}.`)
if (!topics.length) { console.log('No fresh topics found.'); process.exit(0) }

let added = 0
let fails = 0
for (const t of topics) {
  if (added >= COUNT) break
  if (fails >= MAX_FAILS) { console.warn(`Stopping: ${fails} consecutive failures (check LLM_MODEL / key / quota).`); break }
  const key = normKey(t.title)
  if (usedKeys.has(key)) { console.log('skip similar:', t.title); continue }
  usedKeys.add(key) // reserve so two near-duplicates can't slip into the same run
  try {
    const author = authorKeys[added % authorKeys.length]
    const article = await writeArticle({ topic: t.title, cluster: t.cluster, author, date: today })
    if (slugs.has(article.slug) || usedKeys.has(normKey(article.title)) && normKey(article.title) !== key) { continue }
    const img = await fetchImage({ slug: article.slug, query: `${article.title} ${CLUSTERS[t.cluster].name}`, title: article.title, color: CLUSTER_COLOR[t.cluster] })
    article.image = img.path; article.imageCredit = img.credit; article.imageAlt = img.alt
    existing.push(article); slugs.add(article.slug); usedKeys.add(normKey(article.title)); added++; fails = 0
    console.log(`+ ${article.slug}`)
  } catch (e) { fails++; console.warn('skip topic:', t.title, '|', e.message) }
}

if (added) { save(existing); execSync('node generate.mjs', { cwd: __dirname, stdio: 'inherit' }) }
console.log(`Done. Added ${added} article(s).`)
