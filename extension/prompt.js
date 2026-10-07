const titleInput = document.getElementById('title');
const saveButton = document.getElementById('save');
const cancelButton = document.getElementById('cancel');
const errorBox = document.getElementById('error');
async function send(action, extra = {}) {
  const result = await chrome.runtime.sendMessage({action, ...extra});
  if (!result?.ok) throw new Error(result?.error || '操作失败，请重试。');
  return result;
}
send('prompt-load').then(draft => {
  titleInput.value = draft.title;
  document.getElementById('preview').value = draft.content;
  titleInput.disabled = saveButton.disabled = false;
  titleInput.focus();
  titleInput.select();
}).catch(error => { errorBox.textContent = error.message; });
document.getElementById('form').addEventListener('submit', async event => {
  event.preventDefault();
  if (saveButton.disabled) return;
  saveButton.disabled = cancelButton.disabled = true;
  errorBox.textContent = '';
  try {
    await send('prompt-save', {title: titleInput.value});
    window.close();
  } catch (error) {
    errorBox.textContent = error.message;
    saveButton.disabled = cancelButton.disabled = false;
  }
});
cancelButton.addEventListener('click', async () => {
  try { await send('prompt-cancel'); window.close(); }
  catch (error) { errorBox.textContent = error.message; }
});
