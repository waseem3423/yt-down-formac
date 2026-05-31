import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';

const urlInput = document.getElementById('url-input');
const downloadBtn = document.getElementById('download-btn');
const statusBox = document.getElementById('status-box');
const outputDirEl = document.getElementById('output-dir');
const browseBtn = document.getElementById('browse-btn');
const qualityBtns = document.querySelectorAll('.quality-btn');

let selectedQuality = null;
let outputDir = '';
let isDownloading = false;

// Load default downloads directory
invoke('get_default_download_dir').then((dir) => {
  outputDir = dir;
  outputDirEl.textContent = dir;
});

// Listen for download progress events from Rust
listen('download-progress', (event) => {
  const { status, message } = event.payload;
  if (status === 'downloading') {
    // Show last meaningful yt-dlp line
    const clean = message.replace(/\[download\]\s*/, '').trim();
    if (clean) setStatus('loading', clean);
  } else if (status === 'done') {
    setStatus('success', '✓ Download complete! Saved to: ' + outputDir);
    isDownloading = false;
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download';
  } else if (status === 'error') {
    setStatus('error', '✗ ' + message);
    isDownloading = false;
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download';
  }
});

// Quality selection
qualityBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    qualityBtns.forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedQuality = btn.dataset.quality;
    updateDownloadBtn();
  });
});

// URL input validation
urlInput.addEventListener('input', updateDownloadBtn);

function updateDownloadBtn() {
  const url = urlInput.value.trim();
  const validUrl = url.includes('youtube.com/watch?v=') || url.includes('youtu.be/');
  downloadBtn.disabled = !(validUrl && selectedQuality && !isDownloading);
}

// Browse folder
browseBtn.addEventListener('click', async () => {
  const selected = await open({
    directory: true,
    multiple: false,
    defaultPath: outputDir,
    title: 'Select Download Folder',
  });
  if (selected) {
    outputDir = selected;
    outputDirEl.textContent = selected;
  }
});

// Download
downloadBtn.addEventListener('click', async () => {
  if (isDownloading) return;

  const url = urlInput.value.trim();
  if (!url || !selectedQuality) return;

  isDownloading = true;
  downloadBtn.disabled = true;
  downloadBtn.textContent = 'Downloading...';
  setStatus('loading', 'Starting download...');

  try {
    await invoke('start_download', {
      request: {
        url,
        quality: selectedQuality,
        output_dir: outputDir,
      },
    });
  } catch (err) {
    setStatus('error', '✗ ' + err);
    isDownloading = false;
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download';
  }
});

function setStatus(type, message) {
  statusBox.className = 'status-box show ' + type;
  if (type === 'loading') {
    statusBox.innerHTML = `<span class="spinner"></span>${message}`;
  } else {
    statusBox.textContent = message;
  }
}
