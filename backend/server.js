// server.js — Fastify API server

const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const downloadRoutes = require('./routes/download');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Register CORS — allow extension requests
fastify.register(cors, {
  origin: '*',
  methods: ['POST', 'GET'],
});

// Register routes
fastify.register(downloadRoutes, { prefix: '/api' });

// Health check
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Start server
fastify.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`YT Downloader API running at ${address}`);
});
