const assert = require('node:assert/strict');
const fs = require('node:fs');

const catalog = JSON.parse(fs.readFileSync('showcase/features.json', 'utf8'));
assert.ok(catalog.description.length <= 140, '首页简介应能一眼读完');
assert.ok(catalog.features.some(feature => /提取文字|文字识别/.test(feature.title)), '截图文字识别需要独立介绍');
assert.ok(catalog.features.every(feature => ['clips', 'downloads'].includes(feature.group)), '安装说明放在安装区，避免重复功能卡');
for (const feature of catalog.features) {
  assert.ok(feature.text.length <= 70, `${feature.title} 的概述过长`);
  assert.ok((feature.details || []).length <= 3, `${feature.title} 的展开项过多`);
  for (const detail of feature.details || []) {
    assert.ok(detail.text.length <= 170, `${feature.title} / ${detail.title} 的说明过长`);
  }
}
const allCopy = JSON.stringify(catalog);
assert.doesNotMatch(allCopy, /目前不提供独立聊天、图片识字/);

const page = fs.readFileSync('功能介绍.html', 'utf8');
const embedded = JSON.parse(page.match(/<script id="showcaseData" type="application\/json">([^<]+)<\/script>/)[1]);
assert.ok(embedded.changes.length <= 5, '介绍页只展示最近几个版本');
assert.ok(embedded.changes.every(change => change.summary.length <= 140), '更新摘要应简短');
assert.equal(embedded.features.length, catalog.features.length);
console.log('PASS concise showcase copy and release summaries');
