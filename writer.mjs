// writer.mjs — turns a topic into a structured article via any OpenAI-compatible LLM.
// Provider-agnostic: set env LLM_API_URL, LLM_API_KEY, LLM_MODEL.
// Resilient: per-request timeout, retry-with-backoff on rate limits (429) and
// transient 5xx, automatic fallback across a comma-separated model list,
// tolerant JSON parsing, and a fallback when a model rejects json_object mode.
import { CLUSTERS } from './config.mjs'

const API_URL = process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions'
const API_KEY = process.env.LLM_API_KEY || ''
// LLM_MODEL may be a single id or a comma-separated fallback chain, e.g.
// "meta-llama/llama-3.3-70b-instruct:free,openrouter/free"
const MODELS = (process.env.LLM_MODEL || 'gpt-4o-mini')
  .split(',').map((s) => s.trim()).filter(Boolean)
// Hard cap per LLM call so one slow/queued free model can't stall the pipeline.
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 60000)
// Retries per model on 429 / transient 5xx / network errors.
const MAX_RETRIES = Number(process.env.LLM_RETRIES || 2)

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

// Try a single model, handling json-mode fallback + retry/backoff on 429/5xx.
async function tryModel(model, base) {
  let useJson = true
  let attempt = 0
  while (true) {
    const body = useJson
      ? { ...base, model, response_format: { type: 'json_object' } }
      : { ...base, model }
    let res
    try {
      res = await callLLM(body)
    } catch (e) {
      // timeout / network error -> treat as transient
      if (attempt < MAX_RETRIES) { attempt++; await sleep(2500 * attempt); continue }
      throw new Error(`request failed (${model}): ${e.message}`)
    }
    if (res.ok) return res
    // Model/provider doesn't accept strict JSON mode -> retry once without it.
    if (useJson && /response_format|json_object|json mode|not support|invalid.*format/i.test(res.text)) {
      useJson = false
      continue
    }
    // Rate-limited or transient upstream error -> wait and retry.
    if ([429, 500, 502, 503, 529].includes(res.status) && attempt < MAX_RETRIES) {
      attempt++
      await sleep(2500 * attempt)
      continue
    }
    throw new Error(`LLM ${res.status} (${model}): ${res.text.slice(0, 180)}`)
  }
}

export async function writeArticle({ topic, cluster, author, date }) {
  if (!API_KEY) throw new Error('LLM_API_KEY not set')
  const base = {
    temperature: 0.6,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: prompt(topic, cluster) },
    ],
  }
  let lastErr
  for (const model of MODELS) {
    try {
      const res = await tryModel(model, base)
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
    } catch (e) {
      lastErr = e
      // move on to the next model in the fallback chain
    }
  }
  throw lastErr || new Error('all models failed')
}
