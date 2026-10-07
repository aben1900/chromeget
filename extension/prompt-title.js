// Local extractive title: prefer an explicit heading, then a task sentence.
function summarizePromptTitle(content) {
  const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const explicit = lines.find(line => /^(?:#{1,6}\s+|(?:标题|主题|任务名称|title)\s*[:：])/i.test(line));
  const sentences = content.split(/[。！？!?\r\n]+/).map(line => line.trim()).filter(Boolean);
  const task = sentences.find(line => /^(?:请|帮我|请你|你需要|你的任务|任务|目标|生成|编写|撰写|设计|分析|总结|提取|翻译|优化|整理|写|create\b|write\b|generate\b|summarize\b|translate\b)/i.test(line));
  let title = (explicit || task || lines[0] || '新提示词')
    .replace(/^#{1,6}\s+/, '').replace(/^(?:标题|主题|任务名称|title)\s*[:：]\s*/i, '')
    .replace(/^(?:请你|请|帮我|你需要|你的任务是)\s*/, '')
    .replace(/\s+/g, ' ').replace(/[。；;：:，,\s]+$/, '').trim();
  if (!title) title = '新提示词';
  return Array.from(title).length > 36 ? Array.from(title).slice(0, 35).join('') + '…' : title;
}
