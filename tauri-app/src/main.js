import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';

const urlInput       = document.getElementById('url-input');
const downloadBtn    = document.getElementById('download-btn');
const outputDirEl    = document.getElementById('output-dir');
const browseBtn      = document.getElementById('browse-btn');
const qualityBtns    = document.querySelectorAll('.quality-btn');

// Progress elements
const progressSection = document.getElementById('progress-section');
const progressLabel   = document.getElementById('progress-label');
const progressPercent = document.getElementById('progress-percent');
const progressBar     = document.getElementById('progress-bar');
const progressStatus  = document.getElementById('progress-status');

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
  const { status, message, percent } = event.payload;

  progressSection.classList.add('show');

  if (status === 'downloading') {
    // Extract clean label from yt-dlp line
    const clean = message
      .replace(/\[download\]\s*/, '')
      .replace(/\[info\]\s*/, '')
      .trim();

    // Show percent in bar
    if (percent > 0) {
      setProgress(percent, clean, 'Downloading...', '');
    } else {
      // No percent yet — indeterminate
      progressBar.classList.add('indeterminate');
      progressLabel.textContent = clean || 'Downloading...';
      progressPercent.textContent = '';
      progressStatus.textContent = 'Downloading...';
      progressStatus.className = 'progress-status';
    }

  } else if (status === 'merging') {
    progressBar.classList.remove('indeterminate');
    setProgress(99, message, message, 'merging');

  } else if (status === 'done') {
    progressBar.classList.remove('indeterminate');
    setProgress(100, 'Download complete!', '✓ Saved to: ' + outputDir, 'success');
    isDownloading = false;
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download';

  } else if (status === 'error') {
    progressBar.classList.remove('indeterminate');
    progressBar.style.width = '100%';
    progressBar.style.background = '#ff4444';
    progressLabel.textContent = 'Download failed';
    progressPercent.textContent = '';
    progressStatus.textContent = '✗ ' + message;
    progressStatus.className = 'progress-status error';
    isDownloading = false;
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download';
  }
});

function setProgress(percent, label, statusText, statusClass) {
  progressBar.classList.remove('indeterminate');
  progressBar.style.width = percent + '%';
  progressBar.style.background = percent === 100
    ? 'linear-gradient(90deg, #4caf50, #66bb6a)'
    : 'linear-gradient(90deg, #ff4444, #ff7744)';
  progressLabel.textContent = label;
  progressPercent.textContent = percent > 0 ? Math.round(percent) + '%' : '';
  progressStatus.textContent = statusText;
  progressStatus.className = 'progress-status' + (statusClass ? ' ' + statusClass : '');
}

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

  // Reset progress bar
  progressSection.classList.add('show');
  progressBar.classList.remove('indeterminate');
  progressBar.style.width = '0%';
  progressBar.style.background = 'linear-gradient(90deg, #ff4444, #ff7744)';
  progressLabel.textContent = 'Starting...';
  progressPercent.textContent = '0%';
  progressStatus.textContent = 'Connecting to YouTube...';
  progressStatus.className = 'progress-status';

  try {
    await invoke('start_download', {
      request: { url, quality: selectedQuality, output_dir: outputDir },
    });
  } catch (err) {
    progressBar.style.width = '100%';
    progressBar.style.background = '#ff4444';
    progressLabel.textContent = 'Error';
    progressPercent.textContent = '';
    progressStatus.textContent = '✗ ' + err;
    progressStatus.className = 'progress-status error';
    isDownloading = false;
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download';
  }
});
