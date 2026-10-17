const $ = id => document.getElementById(id);
let records = [], offset = 0, total = 0, busy = false, journalPath, defaultJournalPath;
const selected = new Set();
function showJournalLocation(result) {
  journalPath = result.journalPath;
  defaultJournalPath = result.defaultJournalPath || defaultJournalPath || journalPath;
  const normalize = path => String(path || '').replace(/\\/g, '/').toLowerCase();
  $('jsonSwitchLabel').textContent = normalize(journalPath) === normalize(defaultJournalPath) ? '当前已是默认保存文件' : '正在查看其他摘录文件';
  $('jsonPath').textContent = journalPath;
  $('jsonPath').title = journalPath;
}
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
    const bookmarkMeta = document.createElement('div');
    function renderBookmark(values) {
      if(record.type!=='网页地址')return;
      bookmarkMeta.replaceChildren();
      for(const [label,value] of [['名称',values.title||record.title||'未命名'],['备注',values.note??record.note??''],['作者',values.author??record.author??'']]){
        const field=document.createElement('p');field.className='record-meta';field.textContent=label+'：'+(value||'未填写');field.style.whiteSpace='pre-wrap';bookmarkMeta.append(field);
      }
    }
    renderBookmark(record);
    const contentLabel=document.createElement('p');contentLabel.className='record-meta';contentLabel.textContent='网址';contentLabel.hidden=record.type!=='网页地址';
    const more = document.createElement('button'); more.className = 'secondary'; more.textContent = '加载完整内容';
    let loaded = 0, loading = false;
    async function loadContent() {
      if (loading) return;
      loading = true; more.disabled = true;
      try {
        const result = await request('read', {id: record.id, offset: loaded, journalPath});
        content.textContent = (loaded ? content.textContent : '') + result.content;
        renderBookmark(result);
        loaded = result.nextOffset;
        more.hidden = loaded >= result.total;
        more.textContent = '继续显示内容';
      } catch (error) { if(typeof Recovery!=='undefined')Recovery.setError($('listError'),error);else $('listError').textContent=error.message; }
      finally { loading = false; more.disabled = false; }
    }
    more.addEventListener('click', loadContent);
    detail.addEventListener('toggle', () => { if (detail.open && !loaded) loadContent(); });
    detail.append(summary, meta, bookmarkMeta, contentLabel, content, more); row.append(checkbox, detail); $('records').append(row);
  }
  $('listStatus').textContent = total ? '' : '此 JSON 暂无保存记录，可选择其他 JSON 文件';
  $('totalRecords').textContent = `共 ${total} 条记录`;
  $('pageInfo').textContent = total ? `${Math.floor(offset / 10) + 1} / ${Math.ceil(total / 10)}` : '0 / 0';
  controls();
}
async function loadRecords(newOffset = offset) {
  busy = true; controls(); $('listError').textContent = ''; $('confirmDelete').hidden = true;
  try {
    let result = await request('list', {offset: newOffset});
    if (newOffset && newOffset >= result.total) {
      newOffset = Math.max(0, Math.floor((result.total - 1) / 10) * 10);
      result = await request('list', {offset: newOffset});
    }
    records = result.records.slice(0,10); total = result.total; offset = newOffset; selected.clear(); render();
    showJournalLocation(result);
  } catch (error) { if(typeof Recovery!=='undefined')Recovery.setError($('listError'),error);else $('listError').textContent=error.message; $('listStatus').textContent = '读取失败，可点击刷新重试'; }
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
  } catch (error) { if(typeof Recovery!=='undefined')Recovery.setError($('listError'),error);else $('listError').textContent=error.message; }
  finally { busy = false; controls(); }
});
$('reload').addEventListener('click', () => loadRecords());
$('previous').addEventListener('click', () => loadRecords(Math.max(0, offset - 10)));
$('next').addEventListener('click', () => loadRecords(offset + 10));
loadRecords();
async function chooseJson(action) {
  busy = true; controls(); $('listError').textContent = '';
  try {
    const result = await request(action);
    if (result.cancelled) return;
    showJournalLocation(result);
    records = result.records.slice(0,10); total = result.total; offset = 0; selected.clear();
    $('confirmDelete').hidden = true; render();
  } catch (error) { if(typeof Recovery!=='undefined')Recovery.setError($('listError'),error);else $('listError').textContent=error.message; }
  finally { busy = false; controls(); }
}
$('chooseJson').addEventListener('click', () => chooseJson('choose-json'));
$('defaultJson').addEventListener('click', () => chooseJson('default-json'));
