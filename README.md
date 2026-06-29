# GadgetPulse — Google Discover auto-publisher

Auto-publishing static site for consumer-tech (phones, laptops, audio, smart home, gaming).
Pipeline: **trend → article (≥700 words) → hero image ≥1200px → static HTML → deploy**.
Built for Google Discover: NewsArticle/Person/Organization/BreadcrumbList schema,
`max-image-preview:large`, RSS, news-sitemap, mobile-first, no clickbait.

## Quick start

```bash
node generate.mjs          # build dist/ from data/articles.json (works offline)
```
Open `dist/index.html`. Deploy `dist/` to Cloudflare Pages (drag-and-drop or wrangler).

## Auto-publish cycle (needs internet + an LLM key)

```bash
export LLM_API_KEY=sk-...            # OpenAI / OpenRouter / Together / Groq / local
export LLM_API_URL=https://api.openai.com/v1/chat/completions   # optional override
export LLM_MODEL=gpt-4o-mini         # optional
node run.mjs --count=3               # find trends, write 3 articles, fetch images, rebuild
```

Then deploy:
```bash
AD="$(cat ad_native.html)" AD_SIDEBAR="$(cat ad_sidebar.html)" SOCIAL_BAR="$(cat ad_social.html)" \
  DOMAIN=https://gadgetpulse.pages.dev node generate.mjs
npx wrangler pages deploy dist --project-name=gadgetpulse
```

## Adsterra slots (same as the rest of the portfolio)
- `AD`         → in-content Native Banner (injected after 2nd paragraph)
- `AD_SIDEBAR` → 300x250 (desktop sidebar, x2)
- `SOCIAL_BAR` → footer Social Bar (mobile-friendly)

Inject at build time via env vars (empty by default, so dev builds are ad-free).

## Moving to a real .com later
Change `DOMAIN` in `config.mjs` (or the env var), rebuild, redeploy, and add 301 redirects
from the old host. Do this EARLY — changing domains resets Discover trust.

## Files
- `config.mjs`   — site name, domain, clusters, authors, ad slots
- `data/articles.json` — the content store (the pipeline appends here)
- `generate.mjs` — static renderer (no deps, runs anywhere)
- `sources.mjs`  — trend discovery (Reddit hot + Google Trends RSS)
- `writer.mjs`   — LLM article writer (OpenAI-compatible, provider-agnostic)
- `images.mjs`   — hero image fetch (Openverse CC) + placeholder fallback
- `run.mjs`      — orchestrator (trends → write → image → store → generate)
- `publish.mjs`  — Cloudflare Pages deploy + IndexNow ping
- `.github/workflows/publish.yml` — scheduled auto-publish (cron)

## Discover checklist (built in)
- [x] Hero images ≥1200px wide, 16:9
- [x] `max-image-preview:large`
- [x] NewsArticle + Person (author) + Organization (publisher) + BreadcrumbList schema
- [x] FAQPage schema where present
- [x] RSS feed + Google News sitemap + image sitemap
- [x] Mobile-first inline CSS, fast (no JS frameworks)
- [x] Author pages + About/Contact/Privacy (EEAT/trust)
- [x] Non-clickbait titles, sources linked
