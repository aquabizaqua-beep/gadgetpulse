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

function load() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) } catch { return [] } }
function save(a) { fs.writeFileSync(DATA_FILE, JSON.stringify(a, null, 2)) }

const existing = load()
const slugs = new Set(existing.map((a) => a.slug))

const topics = await gatherTopics({ existingSlugs: slugs, perCluster: 6 })
console.log(`Found ${topics.length} candidate topic(s). Target: ${COUNT}.`)
if (!topics.length) { console.log('No fresh topics found.'); process.exit(0) }

let added = 0
let fails = 0
for (const t of topics) {
  if (added >= COUNT) break
  if (fails >= MAX_FAILS) { console.warn(`Stopping: ${fails} consecutive failures (check LLM_MODEL / key / quota).`); break }
  try {
    const author = authorKeys[added % authorKeys.length]
    const article = await writeArticle({ topic: t.title, cluster: t.cluster, author, date: today })
    if (slugs.has(article.slug)) { continue }
    const img = await fetchImage({ slug: article.slug, query: `${article.title} ${CLUSTERS[t.cluster].name}`, title: article.title, color: CLUSTER_COLOR[t.cluster] })
    article.image = img.path; article.imageCredit = img.credit; article.imageAlt = img.alt
    existing.push(article); slugs.add(article.slug); added++; fails = 0
    console.log(`+ ${article.slug}`)
  } catch (e) { fails++; console.warn('skip topic:', t.title, '|', e.message) }
}

if (added) { save(existing); execSync('node generate.mjs', { cwd: __dirname, stdio: 'inherit' }) }
console.log(`Done. Added ${added} article(s).`)
