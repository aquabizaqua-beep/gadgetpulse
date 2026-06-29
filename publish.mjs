// publish.mjs — deploy dist/ to Cloudflare Pages + ping IndexNow.
// Requires Wrangler (npm i -g wrangler) and CLOUDFLARE_API_TOKEN + CF account.
// IndexNow needs a key file at dist/<key>.txt (set INDEXNOW_KEY).
import { execSync } from 'node:child_process'
import { CONFIG } from './config.mjs'

const PROJECT = process.env.CF_PAGES_PROJECT || 'gadgetpulse'

function deploy() {
  console.log('Deploying dist/ to Cloudflare Pages...')
  execSync(`npx wrangler pages deploy dist --project-name=${PROJECT}`, { stdio: 'inherit' })
}

async function indexNow(urls) {
  const key = process.env.INDEXNOW_KEY
  if (!key) { console.log('INDEXNOW_KEY not set, skipping IndexNow'); return }
  const host = CONFIG.DOMAIN.replace(/^https?:\/\//, '')
  const body = { host, key, keyLocation: `${CONFIG.DOMAIN}/${key}.txt`, urlList: urls }
  const r = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  console.log('IndexNow:', r.status)
}

deploy()
// Pass new URLs as args to ping IndexNow, e.g. node publish.mjs https://.../slug/
const urls = process.argv.slice(2).filter((a) => a.startsWith('http'))
if (urls.length) await indexNow(urls)
