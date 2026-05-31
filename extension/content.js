// content.js — Injects download button into YouTube player controls

(function () {
  // Only run on YouTube watch pages
  if (!window.location.href.includes('youtube.com/watch?v=')) return;

  let injected = false;
  let retryCount = 0;
  const MAX_RETRIES = 10;
  const RETRY_INTERVAL = 500;

  function injectButton() {
    // Avoid duplicate injection
    if (document.getElementById('yt-downloader-btn')) return;

    // Target YouTube's right-side controls area
    const controls = document.querySelector('.ytp-right-controls');
    if (!controls) {
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        setTimeout(injectButton, RETRY_INTERVAL);
      }
      return;
    }

    const btn = document.createElement('button');
    btn.id = 'yt-downloader-btn';
    btn.title = 'Download Video';
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="white">
        <path d="M12 16l-6-6h4V4h4v6h4l-6 6zm-7 2h14v2H5v-2z"/>
      </svg>
    `;
    btn.style.cssText = `
      background: none;
      border: none;
      cursor: pointer;
      padding: 0 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      opacity: 0.9;
      vertical-align: middle;
    `;

    btn.addEventListener('mouseenter', () => btn.style.opacity = '1');
    btn.addEventListener('mouseleave', () => btn.style.opacity = '0.9');

    btn.addEventListener('click', () => {
      // Open extension popup programmatically by sending message to background
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
    });

    controls.prepend(btn);
    injected = true;
  }

  // Watch for YouTube SPA navigation (URL changes without page reload)
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      const existingBtn = document.getElementById('yt-downloader-btn');
      if (existingBtn) existingBtn.remove();
      injected = false;
      retryCount = 0;

      if (currentUrl.includes('youtube.com/watch?v=')) {
        setTimeout(injectButton, 1000);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial injection
  injectButton();
})();
