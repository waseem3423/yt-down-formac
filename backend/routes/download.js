// routes/download.js — POST /api/download endpoint

const fs = require('fs');
const { download, cleanup } = require('../downloader');

const VALID_QUALITIES = ['720p', '1080p', 'audio'];
const YT_URL_REGEX = /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/;

async function downloadRoutes(fastify, options) {
  fastify.post('/download', async (request, reply) => {
    const { url, quality } = request.body || {};

    // Log incoming request
    fastify.log.info({
      msg: 'Download request received',
      timestamp: new Date().toISOString(),
      url,
      quality,
    });

    // Validate URL
    if (!url || !YT_URL_REGEX.test(url)) {
      return reply.code(400).send({ error: 'Invalid or missing YouTube URL' });
    }

    // Validate quality
    if (!quality || !VALID_QUALITIES.includes(quality)) {
      return reply.code(400).send({ error: 'Invalid quality option' });
    }

    let filePath = null;

    try {
      // Download via yt-dlp
      const result = await download(url, quality);
      filePath = result.filePath;

      const stat = fs.statSync(filePath);

      // Set response headers
      reply.header('Content-Type', result.mimeType);
      reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(result.filename)}"`);
      reply.header('Content-Length', stat.size);

      // Stream file to client
      const stream = fs.createReadStream(filePath);

      // Cleanup after stream ends
      stream.on('close', () => {
        cleanup(filePath);
      });

      return reply.send(stream);
    } catch (err) {
      fastify.log.error({ msg: 'Download failed', error: err.message, stack: err.stack });

      // Cleanup on error
      if (filePath) cleanup(filePath);

      // yt-dlp specific errors (unavailable, geo-restricted, etc.)
      if (err.message.startsWith('yt-dlp failed:')) {
        return reply.code(422).send({ error: err.message.replace('yt-dlp failed: ', '') });
      }

      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
}

module.exports = downloadRoutes;
