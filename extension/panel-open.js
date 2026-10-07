const panelButton = document.getElementById('openVideoPanel');
let panelWindowId;
chrome.windows.getCurrent().then(current => {
  panelWindowId = current.id;
  panelButton.disabled = false;
}).catch(error => { document.getElementById('error').textContent = error.message; });
panelButton.addEventListener('click', () => {
  // No asynchronous work before open: Chrome requires the user's click gesture.
  const opening = chrome.sidePanel.open({windowId: panelWindowId});
  const extracting = currentBiliVideo(panelWindowId).then(url => url && chrome.storage.session.set({[`video-url:${panelWindowId}`]:url}));
  Promise.all([opening, extracting]).then(() => window.close())
    .catch(error => { document.getElementById('error').textContent = error.message; });
});
