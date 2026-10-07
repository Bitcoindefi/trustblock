// ¿La imagen fue generada con IA? Pregunta a un modelo de clasificación de Roboflow
// (cualquiera de Roboflow Universe, configurable) y arma links de búsqueda inversa,
// que sirven aunque el detector no esté configurado o se equivoque.
//
// Variables:
//   ROBOFLOW_API_KEY     clave de la cuenta de Roboflow
//   ROBOFLOW_MODEL       modelo y versión, p. ej. "fnd-classifier/1"
//   ROBOFLOW_AI_CLASSES  etiquetas del modelo que significan "hecha con IA",
//                        separadas por coma (por defecto: ai,ai-generated,ai_generated,fake,generated,synthetic)

const CLASSIFY_URL = 'https://classify.roboflow.com';
const TIMEOUT_MS = 15000;
const DEFAULT_AI_CLASSES = 'ai,ai-generated,ai_generated,fake,generated,synthetic';

function aiClasses() {
  return new Set((process.env.ROBOFLOW_AI_CLASSES || DEFAULT_AI_CLASSES)
    .split(',').map((c) => c.trim().toLowerCase()).filter(Boolean));
}

/** Roboflow devuelve una lista (una sola clase) o un objeto por clase (multi-etiqueta). */
function readPredictions(data) {
  const p = data?.predictions;
  if (Array.isArray(p)) return p.map((x) => ({ label: String(x.class), confidence: Number(x.confidence) }));
  if (p && typeof p === 'object') {
    return Object.entries(p).map(([label, v]) => ({ label, confidence: Number(v?.confidence ?? v) }));
  }
  if (data?.top) return [{ label: String(data.top), confidence: Number(data.confidence) }];
  return [];
}

async function classify({ base64, url }) {
  const key = process.env.ROBOFLOW_API_KEY;
  const model = process.env.ROBOFLOW_MODEL;
  if (!key || !model) return { status: 'no_configurado' };

  const params = new URLSearchParams({ api_key: key });
  if (url) params.set('image', url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${CLASSIFY_URL}/${model}?${params}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: url ? undefined : base64,
      signal: controller.signal,
    });
    if (!res.ok) return { status: 'error', error: `Roboflow respondió ${res.status}` };
    const predictions = readPredictions(await res.json()).sort((a, b) => b.confidence - a.confidence);
    if (predictions.length === 0) return { status: 'error', error: 'El modelo no devolvió clases' };
    const ai = aiClasses();
    const aiScore = predictions.filter((p) => ai.has(p.label.toLowerCase()))
      .reduce((max, p) => Math.max(max, p.confidence), 0);
    return { status: 'ok', model, aiProbability: Math.round(aiScore * 100) / 100, predictions };
  } catch (e) {
    return { status: 'error', error: e.name === 'AbortError' ? 'Roboflow tardó demasiado' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

function reverseSearch(url) {
  if (!url) return [];
  const u = encodeURIComponent(url);
  return [
    { name: 'Google Lens', url: `https://lens.google.com/uploadbyurl?url=${u}` },
    { name: 'TinEye', url: `https://tineye.com/search?url=${u}` },
    { name: 'Bing Visual Search', url: `https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${u}` },
  ];
}

async function checkImage({ base64, url }) {
  const detector = await classify({ base64, url });
  return { detector, reverseSearch: reverseSearch(url), checkedAt: new Date().toISOString() };
}

module.exports = { checkImage, readPredictions };
