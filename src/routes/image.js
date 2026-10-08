const express = require('express');
const { checkImage } = require('../services/imageCheckService');

const router = express.Router();
// Vercel corta los cuerpos de más de 4,5 MB: la página achica la imagen antes de mandarla.
const MAX_BASE64 = 4 * 1024 * 1024;

// GET /api/image/status: si el detector de Roboflow está activo (la página lo habilita o no).
router.get('/status', (req, res) => {
  const on = Boolean(process.env.ROBOFLOW_API_KEY && process.env.ROBOFLOW_MODEL);
  res.json({ roboflow: on, model: on ? process.env.ROBOFLOW_MODEL : null });
});

// POST /api/image  { image: "<base64 sin prefijo>" }  o  { url: "https://..." }
router.post('/', async (req, res) => {
  const { image, url } = req.body || {};
  let safeUrl = null;
  if (url) {
    try {
      const u = new URL(String(url));
      if (!/^https?:$/.test(u.protocol)) throw new Error();
      safeUrl = u.href;
    } catch {
      return res.status(400).json({ error: 'El link de la imagen no es válido.' });
    }
  }
  const base64 = typeof image === 'string' ? image.replace(/^data:image\/[a-z+]+;base64,/, '') : null;
  if (!safeUrl && !base64) return res.status(400).json({ error: 'Subí una imagen o pegá el link de una.' });
  if (base64 && base64.length > MAX_BASE64) return res.status(413).json({ error: 'La imagen es demasiado grande.' });
  try {
    res.set('cache-control', 'no-store');
    res.json(await checkImage({ base64, url: safeUrl }));
  } catch (error) {
    console.error('Error analizando imagen:', error);
    res.status(500).json({ error: 'No pudimos analizar la imagen ahora.' });
  }
});

module.exports = router;
