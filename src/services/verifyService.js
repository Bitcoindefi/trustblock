// Verificación sin cuenta: busca chequeos publicados (Google Fact Check, ClaimReview)
// y cobertura en medios (Google News), y resume un veredicto.
// La calificación de cada chequeo ("Falso", "Mostly false", "Engañoso"...) la clasifica
// el modelo typesafe-ai/jev por Vercel AI Gateway; si no responde, queda sin clasificar.

const FACTCHECK_URL = 'https://factchecktools.googleapis.com/v1alpha1/claims:search';
const GNEWS_URL = 'https://news.google.com/rss/search';
const TIMEOUT_MS = 8000;
const VERDICTS = ['falso', 'enganoso', 'verdadero', 'sin_calificar'];

// Palabras que no sirven como términos de búsqueda (no clasifican nada).
const STOPWORDS = new Set(('a al algo ante bajo cada como con contra cual cuando de del desde donde durante el ella ellos en entre era es esa ese eso esta este esto fue ha hay la las le les lo los mas más me mi muy no nos o otra otro para pero por porque que qué se ser si sí sin sobre su sus también tiene toda todo todos tu un una uno unos ya y ' +
  'about after also and are been but by for from has have into its just more not now of on or our out over said says than that the their them then there these they this was were what when which who will with would you your').split(' '));

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isUrl(text) {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

/** Si pegaron un link, usamos el título de la página como texto a buscar. */
async function resolveInput(input) {
  const text = input.trim();
  if (!isUrl(text)) return { query: text, source: null };
  const url = new URL(text);
  const source = { url: url.href, domain: url.hostname.replace(/^www\./, '') };
  try {
    const res = await fetchWithTimeout(url.href, { headers: { 'user-agent': 'TrustBlock/1.0 (+https://trustblock.vercel.app)' } });
    const html = (await res.text()).slice(0, 200000);
    const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const found = (og?.[1] || title?.[1] || '').replace(/\s+/g, ' ').trim();
    return { query: found || source.domain, source: { ...source, title: found || null } };
  } catch {
    return { query: source.domain, source };
  }
}

/** El buscador de noticias va mejor con palabras clave que con la frase entera: nos quedamos con las más informativas. */
function keywords(text, max = 6) {
  const words = text
    .normalize('NFC')
    .replace(/https?:\/\/\S+/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w.toLowerCase()));
  return [...new Set(words)].slice(0, max);
}

async function searchFactChecks(query) {
  const key = process.env.GOOGLE_FACTCHECK_API_KEY;
  if (!key) return { status: 'no_configurado', items: [] };
  const params = new URLSearchParams({ query: query.slice(0, 500), pageSize: '10', key });
  try {
    const res = await fetchWithTimeout(`${FACTCHECK_URL}?${params}`);
    if (!res.ok) return { status: 'error', error: `Google Fact Check respondió ${res.status}`, items: [] };
    const data = await res.json();
    const items = (data.claims || []).flatMap((claim) =>
      (claim.claimReview || []).map((review) => ({
        claim: claim.text || null,
        claimant: claim.claimant || null,
        publisher: review.publisher?.name || review.publisher?.site || null,
        rating: review.textualRating || null,
        title: review.title || null,
        url: review.url || null,
        date: review.reviewDate || claim.claimDate || null,
        language: review.languageCode || null,
      })));
    return { status: 'ok', items };
  } catch (e) {
    return { status: 'error', error: e.name === 'AbortError' ? 'Google Fact Check tardó demasiado' : e.message, items: [] };
  }
}

function decodeEntities(text) {
  return text
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Cobertura: Google News (RSS, sin clave). GDELT quedó descartado: limita a una consulta
// cada 5 s por IP y en IPs compartidas (como las de Vercel) responde 429 casi siempre.
async function searchCoverage(query) {
  const all = keywords(query, 8);
  if (all.length === 0) return { status: 'sin_terminos', terms: all, items: [] };
  // Google News pide que aparezcan todas las palabras, y una sola rara (un verbo, una
  // conjugación) deja la búsqueda en cero. Si pasa, se prueban en paralelo las combinaciones
  // de 4 y después de 3 de las primeras 5 palabras, y gana la que trae más notas.
  const first = await searchNews(all);
  if (first.status !== 'ok' || first.items.length > 0) return first;
  const base = all.slice(0, 5);
  for (const size of [4, 3]) {
    if (base.length <= size) continue;
    const results = await Promise.all(combinations(base, size).map(searchNews));
    const best = results.filter((r) => r.status === 'ok').sort((a, b) => b.items.length - a.items.length)[0];
    if (best && best.items.length > 0) return best;
  }
  return first;
}

function combinations(list, size, start = 0, picked = []) {
  if (picked.length === size) return [picked];
  const out = [];
  for (let i = start; i < list.length; i++) out.push(...combinations(list, size, i + 1, [...picked, list[i]]));
  return out;
}

async function searchNews(terms) {
  const params = new URLSearchParams({ q: terms.join(' '), hl: 'es-419', gl: 'AR', ceid: 'AR:es-419' });
  try {
    const res = await fetchWithTimeout(`${GNEWS_URL}?${params}`);
    if (!res.ok) return { status: 'error', error: `Google News respondió ${res.status}`, terms, items: [] };
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 15).map(([, item]) => {
      const field = (tag) => decodeEntities(item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] || '').trim();
      const source = item.match(/<source url="([^"]+)">([\s\S]*?)<\/source>/);
      const outlet = source ? decodeEntities(source[2]).trim() : null;
      const title = field('title');
      const date = field('pubDate');
      return {
        title: outlet && title.endsWith(` - ${outlet}`) ? title.slice(0, -(outlet.length + 3)) : title,
        url: field('link'),
        outlet,
        domain: source ? new URL(source[1]).hostname.replace(/^www\./, '') : null,
        date: date ? new Date(date).toISOString().slice(0, 10) : null,
      };
    });
    return { status: 'ok', terms, items };
  } catch (e) {
    return { status: 'error', error: e.name === 'AbortError' ? 'Google News tardó demasiado' : e.message, terms, items: [] };
  }
}

/** Una sola llamada a jev: una pregunta choice por calificación. */
async function classifyRatings(ratings) {
  if (ratings.length === 0) return { status: 'ok', verdicts: [] };
  const criteria = {
    falso: 'La calificación dice que la afirmación es falsa, inventada, fabricada o generada artificialmente',
    enganoso: 'Engañosa, sacada de contexto, exagerada, parcialmente cierta, mayormente falsa o sin evidencia',
    verdadero: 'Verdadera, correcta o mayormente verdadera',
    sin_calificar: 'No es una calificación de veracidad (sátira, explicación, opinión) o no se entiende',
  };
  const questions = Object.fromEntries(ratings.map((r, i) => [`c${i}`, {
    type: 'choice',
    instructions: `¿Qué dice la calificación número ${i}?`,
    criteria,
  }]));
  const state = ratings.map((r, i) => `Calificación ${i}: "${r || 'sin texto'}"`).join('\n');
  try {
    const { experimental_evaluate: evaluate } = await import('ai');
    const result = await evaluate({ model: 'typesafe-ai/jev', state, questions });
    const answers = result.answers ?? result;
    const verdicts = ratings.map((_, i) => {
      const a = answers[`c${i}`];
      const value = typeof a === 'string' ? a : a?.value ?? a?.answer ?? a?.choice;
      return VERDICTS.includes(value) ? value : 'sin_calificar';
    });
    return { status: 'ok', verdicts };
  } catch (e) {
    return { status: 'error', error: e.message, verdicts: ratings.map(() => null) };
  }
}

function summarize(factChecks, coverage) {
  const counted = factChecks.items.map((i) => i.verdict).filter((v) => v && v !== 'sin_calificar');
  if (counted.length > 0) {
    const tally = counted.reduce((acc, v) => ({ ...acc, [v]: (acc[v] || 0) + 1 }), {});
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    // Empate entre calificaciones distintas: lo más prudente es "engañoso".
    const verdict = top.length > 1 && top[0][1] === top[1][1] ? 'enganoso' : top[0][0];
    return { verdict, basis: 'chequeos' };
  }
  if (factChecks.items.length > 0) return { verdict: 'ver_chequeos', basis: 'chequeos' };
  if (coverage.status === 'ok' && coverage.items.length === 0) return { verdict: 'sin_cobertura', basis: 'cobertura' };
  // Si no se pudieron buscar chequeos, no decimos "no hay": mandamos a mirar la cobertura.
  if (factChecks.status !== 'ok') return { verdict: 'ver_cobertura', basis: 'cobertura' };
  return { verdict: 'sin_chequeos', basis: 'cobertura' };
}

async function verify(input) {
  const { query, source } = await resolveInput(input);
  const [factChecks, coverage] = await Promise.all([searchFactChecks(query), searchCoverage(query)]);
  const classification = await classifyRatings(factChecks.items.map((i) => i.rating));
  factChecks.items = factChecks.items.map((item, i) => ({ ...item, verdict: classification.verdicts[i] ?? null }));
  if (classification.status === 'error') factChecks.classifier = { status: 'error', error: classification.error };
  return {
    input: input.trim(),
    query,
    source,
    ...summarize(factChecks, coverage),
    factChecks,
    coverage,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = { verify, keywords };
