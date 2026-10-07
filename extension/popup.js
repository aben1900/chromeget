const $ = id => document.getElementById(id);
async function refresh() {
  const result = await chrome.runtime.sendMessage({action: 'status'});
  const data = await chrome.storage.local.get(['pending', 'lastError', 'lastSaved', 'path']);
  const count = (data.pending || []).length;
  $('hostInfo').textContent = result.ok ? `实际连接的本地程序：${result.version || '未知版本'} · ${result.storageFormat || '未知格式'}` : '本地程序尚未连接';
  $('status').textContent = count ? `${count} 条待保存，尚未全部写入文件` : result.ok ? '本地保存程序已连接' : '本地保存程序未连接';
  $('error').textContent = result.ok ? (result.storageFormat !== 'json' ? '本地保存程序需要更新为仅 JSON 版本，请运行本项目的“安装.cmd”。' : (data.lastError || '')) : `请运行“安装.cmd”完成本地程序安装。${result.error || ''}`;
  const isJsonPath = value => typeof value === 'string' && /\.json$/i.test(value);
  const savePath = [result.journalPath, result.path, ...(result.ok ? [] : [data.path])].find(isJsonPath);
  $('path').textContent = savePath || '尚未获取 JSON 保存路径';
  // Replace obsolete TXT cache only with a host-reported JSON path; never relabel a TXT path.
  if (result.ok && savePath) await chrome.storage.local.set({path: savePath});
  else if (data.path && !isJsonPath(data.path)) await chrome.storage.local.set({path: ''});
  $('last').textContent = data.lastSaved ? new Date(data.lastSaved).toLocaleString() : '暂无记录';
}
$('extensionId').value = chrome.runtime.id;
$('extensionId').addEventListener('click', event => event.target.select());
$('retry').addEventListener('click', async () => {
  $('retry').disabled = true;
  $('status').textContent = '正在重试保存…';
  try { await request('retry'); await refresh(); await loadRecords(0); }
  catch(error) {
    const {pending = []} = await chrome.storage.local.get('pending');
    $('status').textContent = pending.length ? `${pending.length} 条待保存，尚未全部写入文件` : '待保存队列已清空';
    $('error').textContent = error.message;
  }
  finally { $('retry').disabled = false; }
});
refresh().catch(error => { $('status').textContent = '检查失败'; $('error').textContent = error.message; });

let records = [], offset = 0, total = 0, busy = false, journalPath;
const selected = new Set();
async function request(action, extra = {}) {
  const result = await chrome.runtime.sendMessage({action, ...extra});
  if (!result?.ok) throw new Error(result?.error || '操作失败，请重试');
  return result;
}
function controls() {
  $('delete').disabled = busy || selected.size === 0;
  $('delete').textContent = `删除选中（${selected.size}）`;
  $('selectAll').checked = records.length > 0 && selected.size === records.length;
  $('selectAll').indeterminate = selected.size > 0 && selected.size < records.length;
  $('selectAll').disabled = busy || !records.length;
  $('previous').disabled = busy || offset === 0;
  $('next').disabled = busy || offset + records.length >= total;
  $('reload').disabled = busy;
  $('chooseJson').disabled = $('defaultJson').disabled = busy;
  $('confirmButton').disabled = busy;
  $('cancelDelete').disabled = busy;
  for (const box of document.querySelectorAll('.record-check')) box.disabled = busy;
}
function render() {
  $('records').replaceChildren();
  for (const record of records) {
    const row = document.createElement('article');
    row.className = 'record';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.className = 'record-check';
    checkbox.setAttribute('aria-label', `选择 ${record.title || record.type} ${record.time}`);
    checkbox.checked = selected.has(record.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selected.add(record.id); else selected.delete(record.id);
      $('confirmDelete').hidden = true; controls();
    });
    const detail = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = record.title || record.preview.slice(0, 65) || record.type;
    const meta = document.createElement('p'); meta.className = 'record-meta';
    meta.textContent = `${record.type} · ${record.time}`;
    const content = document.createElement('pre'); content.textContent = record.preview;
    const more = document.createElement('button'); more.className = 'secondary'; more.textContent = '加载完整内容';
    let loaded = 0, loading = false;
    async function loadContent() {
      if (loading) return;
      loading = true; more.disabled = true;
      try {
        const result = await request('read', {id: record.id, offset: loaded, journalPath});
        content.textContent = (loaded ? content.textContent : '') + result.content;
        loaded = result.nextOffset;
        more.hidden = loaded >= result.total;
        more.textContent = '继续显示内容';
      } catch (error) { $('listError').textContent = error.message; }
      finally { loading = false; more.disabled = false; }
    }
    more.addEventListener('click', loadContent);
    detail.addEventListener('toggle', () => { if (detail.open && !loaded) loadContent(); });
    detail.append(summary, meta, content, more); row.append(checkbox, detail); $('records').append(row);
  }
  $('listStatus').textContent = total ? `共 ${total} 次保存 · 每项是一整次保存，点击展开原文` : '此 JSON 暂无保存记录，可选择其他 JSON 文件';
  $('pageInfo').textContent = total ? `${Math.floor(offset / 20) + 1} / ${Math.ceil(total / 20)}` : '0 / 0';
  controls();
}
async function loadRecords(newOffset = offset) {
  busy = true; controls(); $('listError').textContent = ''; $('confirmDelete').hidden = true;
  try {
    let result = await request('list', {offset: newOffset});
    if (newOffset && newOffset >= result.total) {
      newOffset = Math.max(0, Math.floor((result.total - 1) / 20) * 20);
      result = await request('list', {offset: newOffset});
    }
    records = result.records; total = result.total; offset = newOffset; selected.clear(); render();
    journalPath = result.journalPath; $('jsonPath').textContent = journalPath;
  } catch (error) { $('listError').textContent = error.message; $('listStatus').textContent = '读取失败，可点击刷新重试'; }
  finally { busy = false; controls(); }
}
$('selectAll').addEventListener('change', () => {
  selected.clear(); if ($('selectAll').checked) for (const record of records) selected.add(record.id);
  $('confirmDelete').hidden = true; render();
});
$('delete').addEventListener('click', () => {
  $('confirmText').textContent = `从当前 JSON 删除选中的 ${selected.size} 次保存记录？每次保存的完整内容会一起删除，无法撤销。`;
  $('confirmDelete').hidden = false;
});
$('cancelDelete').addEventListener('click', () => { $('confirmDelete').hidden = true; });
$('confirmButton').addEventListener('click', async () => {
  if (busy || !selected.size) return;
  busy = true; controls(); $('listError').textContent = '';
  try {
    await request('delete', {ids: [...selected], journalPath});
    await loadRecords();
    await refresh();
  } catch (error) { $('listError').textContent = error.message; }
  finally { busy = false; controls(); }
});
$('reload').addEventListener('click', () => loadRecords());
$('previous').addEventListener('click', () => loadRecords(Math.max(0, offset - 20)));
$('next').addEventListener('click', () => loadRecords(offset + 20));
loadRecords();
async function chooseJson(action) {
  busy = true; controls(); $('listError').textContent = '';
  try {
    const result = await request(action);
    if (result.cancelled) return;
    journalPath = result.journalPath; $('jsonPath').textContent = journalPath;
    records = result.records; total = result.total; offset = 0; selected.clear();
    $('confirmDelete').hidden = true; render();
  } catch (error) { $('listError').textContent = error.message; }
  finally { busy = false; controls(); }
}
$('chooseJson').addEventListener('click', () => chooseJson('choose-json'));
$('defaultJson').addEventListener('click', () => chooseJson('default-json'));
