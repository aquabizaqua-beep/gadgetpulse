// writer.mjs — turns a topic into a structured article via any OpenAI-compatible LLM.
// Provider-agnostic: set env LLM_API_URL, LLM_API_KEY, LLM_MODEL.
// Hardened: per-request timeout (no infinite hangs), tolerant JSON parsing,
// and a fallback when a model rejects response_format=json_object.
import { CLUSTERS } from './config.mjs'

const API_URL = process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions'
const API_KEY = process.env.LLM_API_KEY || ''
const MODEL = process.env.LLM_MODEL || 'gpt-4o-mini'
// Hard cap per LLM call so one slow/queued free model can't stall the pipeline.
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 60000)

const SYSTEM = `You are a senior consumer-tech editor for GadgetPulse. Write accurate, useful, non-clickbait articles for a general audience. Rules:
- 700-1100 words, clear and specific, no hype, no fabricated specs or prices.
- Neutral, trustworthy tone (EEAT). If something is a rumor, say so.
- Use short paragraphs and 1-2 H2 sections. Include one practical takeaway.
- Never invent sources. Only include sources you are confident exist.
Return STRICT JSON only, matching the requested schema.`

function prompt(topic, cluster) {
  const c = CLUSTERS[cluster]
  return `Write an article for the "${c.name}" section about this topic:\n"${topic}"\n\nReturn JSON with this exact shape:\n{
  "title": string (<= 65 chars, specific, no clickbait),
  "dek": string (one-sentence standfirst),
  "imageAlt": string (describe an appropriate hero photo),
  "tags": string[3],
  "body": Array<{"type":"p"|"h2"|"ul", "text"?:string, "items"?:string[]}>,
  "faq": Array<{"q":string,"a":string}> (2-3 items),
  "sources": Array<{"title":string,"url":string}> (0-3, only if confident)
}`
}

// Pull a JSON object out of an LLM response even if it's wrapped in ``` fences
// or surrounded by stray prose.
function extractJson(raw) {
  let s = String(raw || '').trim()
  if (!s) throw new Error('empty LLM content')
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  if (!s.startsWith('{')) {
    const i = s.indexOf('{'), j = s.lastIndexOf('}')
    if (i >= 0 && j > i) s = s.slice(i, j + 1)
  }
  return JSON.parse(s)
}

async function callLLM(body) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${API_KEY}`,
        // OpenRouter attribution headers (harmless for other providers)
        'http-referer': 'https://gadgetpulse.pages.dev',
        'x-title': 'GadgetPulse',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const text = await r.text()
    return { ok: r.ok, status: r.status, text }
  } finally {
    clearTimeout(timer)
  }
}

export async function writeArticle({ topic, cluster, author, date }) {
  if (!API_KEY) throw new Error('LLM_API_KEY not set')
  const base = {
    model: MODEL,
    temperature: 0.6,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: prompt(topic, cluster) },
    ],
  }
  // Prefer JSON mode; if the chosen model rejects it, retry without it.
  let res = await callLLM({ ...base, response_format: { type: 'json_object' } })
  if (!res.ok && /response_format|json_object|not support|json mode/i.test(res.text)) {
    res = await callLLM(base)
  }
  if (!res.ok) throw new Error(`LLM ${res.status}: ${res.text.slice(0, 300)}`)

  const data = JSON.parse(res.text)
  const content = data.choices?.[0]?.message?.content || ''
  const a = extractJson(content)
  const slug = String(a.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70)
  if (!slug) throw new Error('LLM returned no usable title')
  return {
    slug, cluster, author, date,
    title: a.title, dek: a.dek,
    image: `img/${slug}.jpg`, imageAlt: a.imageAlt || a.title, imageCredit: 'Photo: see source',
    tags: a.tags || [], body: a.body || [], faq: a.faq || [], sources: a.sources || [],
  }
}
