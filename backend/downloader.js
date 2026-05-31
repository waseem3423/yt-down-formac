// downloader.js — yt-dlp + FFmpeg wrapper

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TEMP_DIR = path.join(os.tmpdir(), 'yt-downloader');

// FFmpeg path — winget install location (exact exe path)
const FFMPEG_PATH = 'C:\\Users\\Wasee\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe';

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Download a YouTube video/audio using yt-dlp
 * @param {string} url - YouTube video URL
 * @param {string} quality - '720p' | '1080p' | 'audio'
 * @returns {Promise<{ filePath: string, filename: string, mimeType: string }>}
 */
async function download(url, quality) {
  const timestamp = Date.now();
  const outputTemplate = path.join(TEMP_DIR, `${timestamp}_%(title)s.%(ext)s`);

  let ytdlpArgs;
  let expectedExt;
  let mimeType;

  if (quality === 'audio') {
    // Audio only — extract and convert to MP3
    ytdlpArgs = [
      url,
      '-f', 'bestaudio',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--ffmpeg-location', FFMPEG_PATH,
      '-o', outputTemplate,
      '--no-playlist',
      '--no-warnings',
    ];
    expectedExt = 'mp3';
    mimeType = 'audio/mpeg';
  } else {
    // Video — download best video+audio up to specified height, merge to mp4
    const maxHeight = quality === '1080p' ? '1080' : '720';
    ytdlpArgs = [
      url,
      '-f', `bestvideo[height<=${maxHeight}]+bestaudio/best[height<=${maxHeight}]`,
      '--merge-output-format', 'mp4',
      '--ffmpeg-location', FFMPEG_PATH,
      '-o', outputTemplate,
      '--no-playlist',
      '--no-warnings',
    ];
    expectedExt = 'mp4';
    mimeType = 'video/mp4';
  }

  // Run yt-dlp
  const filePath = await runYtDlp(ytdlpArgs, TEMP_DIR, timestamp, expectedExt);

  // Extract clean filename
  const filename = path.basename(filePath);

  return { filePath, filename, mimeType };
}

/**
 * Spawn yt-dlp and resolve with the output file path
 */
function runYtDlp(args, tempDir, timestamp, expectedExt) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args);
    let stderr = '';
    let stdout = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      console.log('[yt-dlp stdout]', stdout);
      console.log('[yt-dlp stderr]', stderr);
      if (code !== 0) {
        reject(new Error(`yt-dlp failed: ${stderr.trim() || stdout.trim() || 'Unknown error'}`));
        return;
      }

      // Find the output file matching our timestamp prefix
      try {
        const files = fs.readdirSync(tempDir).filter(f => f.startsWith(`${timestamp}_`));
        if (files.length === 0) {
          reject(new Error('yt-dlp completed but output file not found'));
          return;
        }
        // Prefer the expected extension
        const target =
          files.find(f => f.endsWith(`.${expectedExt}`)) || files[0];
        resolve(path.join(tempDir, target));
      } catch (err) {
        reject(new Error(`Failed to locate output file: ${err.message}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });
  });
}

/**
 * Delete a temp file after streaming
 */
function cleanup(filePath) {
  fs.unlink(filePath, (err) => {
    if (err) console.error(`[cleanup] Failed to delete ${filePath}:`, err.message);
  });
}

module.exports = { download, cleanup };
