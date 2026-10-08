// Smoke test de TrustBlock contra un sitio publicado.
//   node scripts/smoke.mjs                      -> https://trustblock.vercel.app
//   BASE=http://localhost:3000 node scripts/smoke.mjs
const BASE = (process.env.BASE || 'https://trustblock.vercel.app').replace(/\/$/, '');
let failed = 0;

async function check(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    console.log(`ok    ${name} (${Date.now() - t0} ms)${detail ? ` · ${detail}` : ''}`);
  } catch (e) {
    failed++;
    console.log(`FALLA ${name}: ${e.message}`);
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const json = (path, init) => fetch(BASE + path, init).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const postJson = (path, data) => json(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

await check('página principal', async () => {
  const r = await fetch(`${BASE}/`);
  const html = await r.text();
  expect(r.status === 200, `status ${r.status}`);
  expect(html.includes('¿Es verdad lo que te llegó?'), 'no aparece el título');
  expect(html.includes('id="img-form"'), 'falta la sección de imágenes');
});

await check('/health', async () => {
  const r = await json('/health');
  expect(r.status === 200 && r.body?.status === 'OK', `status ${r.status}`);
});

await check('/api/verify rechaza textos cortos', async () => {
  const r = await json('/api/verify?q=hola');
  expect(r.status === 400, `esperaba 400, vino ${r.status}`);
});

await check('/api/verify encuentra cobertura', async () => {
  const q = encodeURIComponent('La foto del papa Francisco con una campera blanca es real');
  const r = await json(`/api/verify?q=${q}`);
  expect(r.status === 200, `status ${r.status}`);
  expect(r.body.coverage.status === 'ok', `cobertura: ${r.body.coverage.status} ${r.body.coverage.error || ''}`);
  expect(r.body.coverage.items.length > 0, 'cobertura vacía');
  return `veredicto ${r.body.verdict}, ${r.body.coverage.items.length} notas, chequeos ${r.body.factChecks.status}`;
});

await check('/api/image/status', async () => {
  const r = await json('/api/image/status');
  expect(r.status === 200 && typeof r.body?.roboflow === 'boolean', `status ${r.status}`);
  return `roboflow ${r.body.roboflow ? `activo (${r.body.model})` : 'sin clave'}`;
});

await check('/api/image arma búsqueda inversa', async () => {
  const r = await postJson('/api/image', { url: 'https://example.com/foto.jpg' });
  expect(r.status === 200, `status ${r.status}`);
  expect(r.body.reverseSearch?.length === 3, 'faltan links de búsqueda inversa');
});

await check('/api/image rechaza links peligrosos', async () => {
  const r = await postJson('/api/image', { url: 'javascript:alert(1)' });
  expect(r.status === 400, `esperaba 400, vino ${r.status}`);
});

for (const id of ['amrita-detectly/detect-ai-image-v1', 'onnx-community/deepfake_vs_real_image_detection-ONNX']) {
  await check(`modelo del navegador disponible: ${id}`, async () => {
    const r = await fetch(`https://huggingface.co/${id}/resolve/main/onnx/model_quantized.onnx`, { method: 'HEAD', redirect: 'follow' });
    expect(r.ok, `status ${r.status}`);
  });
}

console.log(failed ? `\n${failed} chequeo(s) fallaron` : '\nTodo OK');
process.exit(failed ? 1 : 0);
