// background.js — Service worker, handles API requests to VPS

const VPS_URL = 'http://localhost:3000';
const TIMEOUT_MS = 120000; // 2 minutes — video processing takes time

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_DOWNLOAD') {
    handleDownload(message.url, message.quality, sendResponse);
    return true; // Keep message channel open for async response
  }
});

async function handleDownload(url, quality, sendResponse) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${VPS_URL}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, quality }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMsg = `Server error (${response.status})`;
      try {
        const errData = await response.json();
        errorMsg = errData.error || errorMsg;
      } catch (_) {}
      sendResponse({ success: false, error: errorMsg });
      return;
    }

    // Get filename from Content-Disposition header
    const disposition = response.headers.get('Content-Disposition') || '';
    let filename = quality === 'audio' ? 'download.mp3' : 'download.mp4';
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match) {
      // Decode URI encoded filename
      try {
        filename = decodeURIComponent(match[1]);
      } catch (_) {
        filename = match[1];
      }
    }

    // Service workers cannot use URL.createObjectURL
    // Use chrome.downloads with fetch response converted to base64 data URL
    const arrayBuffer = await response.arrayBuffer();
    const mimeType = quality === 'audio' ? 'audio/mpeg' : 'video/mp4';

    // Convert ArrayBuffer to base64 data URL
    const base64 = arrayBufferToBase64(arrayBuffer);
    const dataUrl = `data:${mimeType};base64,${base64}`;

    await chrome.downloads.download({
      url: dataUrl,
      filename: sanitizeFilename(filename),
      saveAs: false,
    });

    sendResponse({ success: true });

  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      sendResponse({ success: false, error: 'Request timed out. Video processing takes time, try again.' });
    } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      sendResponse({ success: false, error: 'Server unreachable. Check VPS connection.' });
    } else {
      sendResponse({ success: false, error: err.message });
    }
  }
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function sanitizeFilename(name) {
  // Remove characters not allowed in filenames
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}
