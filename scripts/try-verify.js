// Prueba local del servicio de verificación: node scripts/try-verify.js "texto"
// Para clasificar con jev en local, AI_GATEWAY_API_KEY se toma de ~/.config/jev/env.
const fs = require('fs');
const os = require('os');
const path = require('path');

const envFile = path.join(os.homedir(), '.config', 'jev', 'env');
if (!process.env.AI_GATEWAY_API_KEY && fs.existsSync(envFile)) {
  const m = fs.readFileSync(envFile, 'utf8').match(/AI_GATEWAY_API_KEY\s*=\s*(.+)/);
  if (m) process.env.AI_GATEWAY_API_KEY = m[1].trim().replace(/^["']|["']$/g, '');
}

const { verify, keywords } = require('../src/services/verifyService');

(async () => {
  const q = process.argv[2] || 'La foto del papa Francisco con una campera blanca es real';
  console.log('términos de búsqueda:', keywords(q, 8));
  const r = await verify(q);
  console.log(JSON.stringify({
    verdict: r.verdict,
    factChecks: { status: r.factChecks.status, n: r.factChecks.items.length, classifier: r.factChecks.classifier },
    coverage: { status: r.coverage.status, error: r.coverage.error, n: r.coverage.items.length, first: r.coverage.items.slice(0, 3) },
  }, null, 2));
})();
