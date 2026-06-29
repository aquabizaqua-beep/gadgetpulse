// writer.mjs — turns a topic into a structured article via any OpenAI-compatible LLM.
// Provider-agnostic: set env LLM_API_URL, LLM_API_KEY, LLM_MODEL.
// Works with OpenAI, OpenRouter, Together, Groq, local LM Studio, etc.
import { CLUSTERS } from './config.mjs'

const API_URL = process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions'
const API_KEY = process.env.LLM_API_KEY || ''
const MODEL = process.env.LLM_MODEL || 'gpt-4o-mini'

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

export async function writeArticle({ topic, cluster, author, date }) {
  if (!API_KEY) throw new Error('LLM_API_KEY not set')
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.6,
      response_format: { type: 'json_object' },
      messages: [ { role: 'system', content: SYSTEM }, { role: 'user', content: prompt(topic, cluster) } ],
    }),
  })
  if (!r.ok) throw new Error(`LLM ${r.status}: ${await r.text()}`)
  const data = await r.json()
  const raw = data.choices?.[0]?.message?.content || '{}'
  const a = JSON.parse(raw)
  const slug = String(a.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70)
  return {
    slug, cluster, author, date,
    title: a.title, dek: a.dek,
    image: `img/${slug}.jpg`, imageAlt: a.imageAlt || a.title, imageCredit: 'Photo: see source',
    tags: a.tags || [], body: a.body || [], faq: a.faq || [], sources: a.sources || [],
  }
}
