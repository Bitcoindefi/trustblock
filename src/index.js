const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// Importar rate limiters organizados
const {
  generalLimiter,
  validationLimiter,
  stakingLimiter,
  publishLimiter,
  searchLimiter,
  registrationLimiter,
  filecoinLimiter,
  confidentialLimiter,
  developmentLimiter
} = require('./middleware/rateLimiters');

// Importar middleware de debug para proxy
const {
  debugProxy,
  rateLimitInfo,
  validateProxyConfig,
  createProxyTestEndpoint
} = require('./middleware/proxyDebug');

const validationRoutes = require('./routes/validation');
const oracleRoutes = require('./routes/oracle');
const stakingRoutes = require('./routes/staking');
const newsRoutes = require('./routes/news');
const truthboardRoutes = require('./routes/truthboard');
const filecoinRoutes = require('./routes/filecoin');
const confidentialRoutes = require('./routes/confidential');
const flareRoutes = require('./routes/flare');
const verifyRoutes = require('./routes/verify');
const imageRoutes = require('./routes/image');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar trust proxy - IMPORTANTE para rate limiting detrás de proxies
// Con Cloudflare + Nginx, tenemos 2 proxies en la cadena
const trustProxy = process.env.TRUST_PROXY?.toLowerCase() === 'true' ||
  process.env.NODE_ENV === 'production';

if (trustProxy) {
  // Con Cloudflare + Nginx = 2 proxies
  // Cloudflare → Nginx → App
  const proxyCount = parseInt(process.env.PROXY_COUNT) || 2;
  app.set('trust proxy', proxyCount);
  console.log(`🔧 Trust proxy configurado: ${proxyCount} proxy(s) (Cloudflare + Nginx)`);
} else {
  app.set('trust proxy', false);
  console.log(`🔧 Trust proxy deshabilitado para desarrollo local`);
}

// Página pública (public/). En Vercel la sirve el CDN; esto es para correrla en local.
// Va antes de helmet porque su CSP bloquearía el script y las fuentes de la página.
app.use(express.static(require('path').join(__dirname, '../public')));

// Middleware de seguridad
app.use(helmet({
  crossOriginEmbedderPolicy: false
}));

// CORS habilitado para TODOS los orígenes (provisional)
app.use(cors({
  origin: true, // Acepta cualquier origen
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: '*',
  optionsSuccessStatus: 200
}));

// Middleware adicional para CORS universal - DEBE ir ANTES que otros middlewares
app.use((req, res, next) => {
  console.log(`🌐 CORS Request: ${req.method} ${req.path} from origin: ${req.headers.origin || 'no-origin'}`);

  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    console.log(`✅ CORS Preflight handled for ${req.path}`);
    return res.sendStatus(200);
  }
  next();
});

// Middleware de debug para proxy (solo en desarrollo)
if (process.env.NODE_ENV === 'development' || process.env.DEBUG_PROXY) {
  app.use(debugProxy);
}
app.use(validateProxyConfig);
app.use(rateLimitInfo);

// Rate limiting general - usar el limiter apropiado según el entorno
const mainLimiter = process.env.NODE_ENV === 'development'
  ? developmentLimiter
  : generalLimiter;

app.use(mainLimiter);

// Middleware de logging
app.use(morgan('combined'));

// Middleware de parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'TrueBlock & TruthBoard API están funcionando',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      trueblock: 'Active - Decentralized news validation',
      truthboard: 'Active - Anonymous journalism with ZK on Citrea',
      filecoin: 'Active - Permanent storage & retrieval',
      confidential: 'Active - FHE encrypted validation with Zama'
    },
    cors: 'ENABLED - All origins allowed'
  });
});

// CORS test endpoint
app.get('/test-cors', (req, res) => {
  res.json({
    success: true,
    message: 'CORS está funcionando correctamente',
    origin: req.headers.origin || 'No origin header',
    method: req.method,
    headers: req.headers,
    timestamp: new Date().toISOString()
  });
});

app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
  res.header('Access-Control-Allow-Headers', '*');
  res.sendStatus(200);
});

// Test data deployment endpoint (only in development)
app.post('/deploy-test-data', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Test data deployment only available in development'
    });
  }

  try {
    const { deployTestData } = require('../scripts/deploy-test-data');
    await deployTestData();

    res.json({
      success: true,
      message: 'Test data deployed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error deploying test data:', error);
    res.status(500).json({
      error: 'Failed to deploy test data',
      message: error.message
    });
  }
});

// Get database stats endpoint
app.get('/api/database/stats', async (req, res) => {
  try {
    const databaseService = require('./services/databaseService');
    const stats = await databaseService.getStats();

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting database stats:', error);
    res.status(500).json({
      error: 'Failed to get database stats',
      message: error.message
    });
  }
});

// Rutas principales con rate limiters específicos
app.use('/api/validation', validationLimiter, validationRoutes);
app.use('/api/oracle', [registrationLimiter, validationLimiter], oracleRoutes);
app.use('/api/staking', [registrationLimiter, stakingLimiter], stakingRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/truthboard', publishLimiter, truthboardRoutes);
app.use('/api/filecoin', filecoinLimiter, filecoinRoutes);
app.use('/api/confidential', confidentialLimiter, confidentialRoutes);
app.use('/api/flare', validationLimiter, flareRoutes);
// Verificación abierta: chequeos publicados + cobertura en medios, sin cuenta.
app.use('/api/verify', searchLimiter, verifyRoutes);
// ¿Imagen generada con IA? Detector de Roboflow + búsqueda inversa.
app.use('/api/image', searchLimiter, imageRoutes);

// Aplicar rate limiter específico para búsquedas después de las rutas news
app.use('/api/news/search', searchLimiter);

// Ruta de información general
app.get('/api/info', (req, res) => {
  res.json({
    platforms: {
      trueblock: {
        name: 'TrueBlock API',
        description: 'Plataforma descentralizada para validación de noticias contra desinformación',
        blockchain: 'Ethereum/Polygon compatible',
        features: [
          'Validación multicapa con IA y comunidad',
          'Sistema de staking y slashing',
          'Oráculos especializados',
          'Almacenamiento descentralizado en IPFS',
          'Consenso on-chain'
        ],
        endpoints: {
          validation: '/api/validation',
          oracle: '/api/oracle',
          staking: '/api/staking',
          news: '/api/news'
        }
      },
      truthboard: {
        name: 'TruthBoard API',
        description: 'Plataforma anónima de periodismo con pruebas ZK en Citrea Bitcoin rollup',
        blockchain: 'Citrea Bitcoin rollup',
        features: [
          'Publicación anónima con ZK proofs',
          'Validación comunitaria preservando privacidad',
          'Donaciones anónimas',
          'Anclaje en Bitcoin para inmutabilidad',
          'Resistencia a censura',
          'Archivado permanente en Filecoin'
        ],
        endpoints: {
          publish: '/api/truthboard/publish',
          validate: '/api/truthboard/validate',
          donate: '/api/truthboard/donate',
          stats: '/api/truthboard/stats',
          citrea: '/api/truthboard/citrea/status'
        }
      },
      confidential: {
        name: 'TruthBoard Confidential API',
        description: 'Validación confidencial con Fully Homomorphic Encryption de Zama',
        blockchain: 'Zama Protocol',
        features: [
          'Validación completamente confidencial',
          'Protección de identidad de validadores',
          'Operaciones homomórficas en votos cifrados',
          'Reputación cifrada preservando privacidad',
          'Pruebas criptográficas sin revelar datos'
        ],
        endpoints: {
          initialize: '/api/confidential/initialize',
          register: '/api/confidential/register-validator',
          validate: '/api/confidential/submit-validation',
          aggregate: '/api/confidential/aggregate-validations',
          reputation: '/api/confidential/update-reputation',
          stats: '/api/confidential/validator-stats/:address',
          info: '/api/confidential/service-info',
          verify: '/api/confidential/verify-proof'
        }
      },
      filecoin: {
        name: 'Filecoin Storage API',
        description: 'Almacenamiento permanente y recuperación de contenido validado',
        blockchain: 'Filecoin Virtual Machine (FVM)',
        features: [
          'Archivado automático de noticias validadas',
          'Almacenamiento permanente de evidencia',
          'Snapshots públicos inmutables',
          'Recuperación garantizada',
          'Políticas de financiamiento DAO'
        ],
        endpoints: {
          archive: '/api/filecoin/archive/news',
          evidence: '/api/filecoin/evidence/store',
          retrieve: '/api/filecoin/retrieve/:hash',
          statistics: '/api/filecoin/statistics',
          network: '/api/filecoin/network/status'
        }
      }
    },
    integrations: {
      'ZK + Filecoin': 'Anonymous journalism with permanent archival',
      'Citrea + Bitcoin': 'Bitcoin rollup with L1 settlement',
      'IPFS + FVM': 'Decentralized storage with smart contracts'
    },
    version: '1.0.0'
  });
});

// Endpoint para verificar balance de wallet
app.get('/api/blockchain/balance', async (req, res) => {
  try {
    const { BlockchainService } = require('./services/blockchainService');
    const blockchainService = new BlockchainService();

    const balanceInfo = await blockchainService.checkBalance();

    res.json({
      success: true,
      balance: balanceInfo,
      chainId: await blockchainService.getChainId(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error verificando balance:', error);
    res.status(500).json({
      success: false,
      error: 'Error verificando balance',
      message: error.message
    });
  }
});

// Endpoint para obtener tareas/validaciones pendientes
app.get('/api/tasks', async (req, res) => {
  try {
    const databaseService = require('./services/databaseService');
    const tasks = await databaseService.getTasks();

    res.json({
      success: true,
      tasks: tasks || [],
      count: tasks ? tasks.length : 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error obteniendo tareas:', error);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo tareas',
      message: error.message
    });
  }
});

// Crear endpoint de debug para proxy
createProxyTestEndpoint(app);

// Middleware de manejo de errores
app.use((err, req, res, next) => {
  console.error('Error:', err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Error de validación',
      message: err.message
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      error: 'Formato de datos inválido',
      message: 'ID o parámetro inválido'
    });
  }

  res.status(500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Algo salió mal'
  });
});

// Middleware para rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    message: `La ruta ${req.originalUrl} no existe`,
    suggestion: 'Revisa la documentación de la API en /api/info'
  });
});

// Manejo de cierre graceful
process.on('SIGTERM', () => {
  console.log('SIGTERM recibido, cerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT recibido, cerrando servidor...');
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🚀 TrueBlock & TruthBoard API ejecutándose en puerto ${PORT}`);
  console.log(`📊 Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📖 Info API: http://localhost:${PORT}/api/info`);
  console.log(`\n🔍 TrueBlock: Validación descentralizada de noticias`);
  console.log(`🔒 TruthBoard: Periodismo anónimo con ZK en Citrea`);
});

module.exports = app;
