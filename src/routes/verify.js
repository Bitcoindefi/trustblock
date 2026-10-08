const express = require('express');
const { verify } = require('../services/verifyService');

const router = express.Router();

// GET /api/verify?q=texto o link. Sin cuenta ni wallet.
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 8) {
    return res.status(400).json({ error: 'Pegá un texto, titular o link de al menos 8 caracteres.' });
  }
  if (q.length > 2000) {
    return res.status(400).json({ error: 'El texto es demasiado largo: pegá el titular o la frase clave.' });
  }
  try {
    res.set('cache-control', 'no-store');
    res.json(await verify(q));
  } catch (error) {
    console.error('Error verificando:', error);
    res.status(500).json({ error: 'No pudimos verificar ahora. Probá de nuevo en unos segundos.' });
  }
});

module.exports = router;
