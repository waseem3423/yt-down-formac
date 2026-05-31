// popup.js — Quality selector and download trigger

let currentUrl = null;
let selectedQuality = null;
let lastRequest = null;

const videoUrlEl = document.getElementById('video-url');
const downloadBtn = document.getElementById('download-btn');
const statusEl = document.getElementById('status');
const retryBtn = document.getElementById('retry-btn');
const mainContent = document.getElementById('main-content');
const noVideo = document.getElementById('no-video');
const qualityBtns = document.querySelectorAll('.quality-btn');

// Get current tab URL
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (tab && tab.url && tab.url.includes('youtube.com/watch?v=')) {
    currentUrl = tab.url;
    videoUrlEl.textContent = currentUrl;
    mainContent.style.display = 'block';
    noVideo.style.display = 'none';
  } else {
    mainContent.style.display = 'none';
    noVideo.style.display = 'block';
  }
});

// Quality selection
qualityBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    qualityBtns.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedQuality = btn.dataset.quality;
    updateDownloadBtn();
  });
});

function updateDownloadBtn() {
  downloadBtn.disabled = !(currentUrl && selectedQuality);
}

// Download button
downloadBtn.addEventListener('click', () => {
  if (!currentUrl || !selectedQuality) return;
  lastRequest = { url: currentUrl, quality: selectedQuality };
  startDownload(lastRequest);
});

// Retry button
retryBtn.addEventListener('click', () => {
  if (lastRequest) startDownload(lastRequest);
});

function startDownload({ url, quality }) {
  setStatus('loading', 'Sending to server...');
  downloadBtn.disabled = true;
  retryBtn.style.display = 'none';

  chrome.runtime.sendMessage(
    { type: 'START_DOWNLOAD', url, quality },
    (response) => {
      if (chrome.runtime.lastError) {
        setStatus('error', 'Extension error: ' + chrome.runtime.lastError.message);
        showRetry();
        return;
      }

      if (response && response.success) {
        setStatus('success', '✓ Download started!');
        downloadBtn.disabled = false;
      } else {
        const msg = response?.error || 'Unknown error occurred.';
        setStatus('error', msg);
        showRetry();
        downloadBtn.disabled = false;
      }
    }
  );
}

function setStatus(type, message) {
  statusEl.className = 'status ' + type;
  if (type === 'loading') {
    statusEl.innerHTML = `<span class="spinner"></span>${message}`;
  } else {
    statusEl.textContent = message;
  }
}

function showRetry() {
  retryBtn.style.display = 'block';
  downloadBtn.disabled = false;
}
