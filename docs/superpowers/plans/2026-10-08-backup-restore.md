# Local Backup and Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task in the current session. Follow test-driven-development and request an independent final review.

**Goal:** 用户可创建本地资料备份、预览冲突并合并恢复，失败或进程中断不留下混合版本的数据。

**Architecture:** 保留摘录 JSON 和资料索引，PowerShell 统一目录 Mutex，Node 继续使用 named pipe 串行访问索引。新增独立备份格式、合并计算与事务模块；浏览器只提交选择凭证和预览编号。

**Tech Stack:** Windows PowerShell 5.1、现有 Node.js、Chrome MV3、原生 HTML/CSS/JavaScript，无新增依赖或权限。

**Spec:** ../specs/2026-10-08-backup-restore-design.md（用户已确认）

## Global Constraints

- 目标版本 1.26.0，扩展与本地程序一起更新；验收前不声称已实现。
- 默认摘录、来源、整理信息和下载快照纳入备份；实际下载文件、Cookie、引擎、浏览器注册不纳入。
- 只提供合并恢复；同编号冲突保留当前内容；恢复前备份成功后才写入。
- 单文件上限精确定为 100 MiB（104857600 字节），摘录上限 100000 条；界面使用一致单位。
- 恢复预览有效期 15 分钟；冲突摘要最多 50 项，返回完整冲突数量。
- 不自动删除历史备份；不上传、不合并外部 JSON、不修改真实 Chrome 注册。
- 保留当前 codex 分支和本地开发方式，沿用之前已确定的当前会话顺序实施；不推送、不发布。

## Review Focus

1. 恢复替换第一份文件后进程被终止：下次任何读写须先恢复一致状态（任务 2、3）。
2. 预览后其他窗口保存新摘录或修改标签：确认恢复应拒绝旧预览，不能覆盖新修改（任务 3）。
3. 任意 JSON、深嵌套对象、重复编号、危险属性和越界路径：校验失败且不改动资料（任务 1）。
4. 用户双击确认、连接丢失后重试：同一预览只提交一次，已提交结果可确认（任务 3、4）。
5. 空资料库、原文件不存在、同编号跨目录下载快照：恢复和回滚保留正确状态、冲突不混淆（任务 1、2）。

## 文件与接口约定

新增 native/library-backup-model.cjs：纯验证、编码、比较、合并，不读取文件。
新增 native/library-backup.cjs：受控路径、选择凭证、预览、备份与事务。
新增 native/journal-lock.ps1：公共目录 Mutex 帮助函数。
新增 extension/library-backup.js：独立备份面板交互，不继续扩大 library.js。
新增 tests/backup-model.cjs、backup-transaction.cjs、backup-native.cjs、backup-ui.cjs。

统一消息动作：library-backup-create、library-backup-list、library-backup-open、library-restore-choose、library-restore-preview、library-restore-apply、library-restore-result。另设内部 library-recover，只由宿主在读写前调用，不列入浏览器白名单。

`Context = {root:string, directory:string}`，目录来源于本地配置。
`RawPair = {journal:null|string, index:null|string}`，null 表示原文件不存在。
`Snapshot = {records:Array, index:Object, exists:{journal:boolean,index:boolean}, origin:string}`，origin 为标准化资料目录的 SHA-256。
`MergeResult = {snapshot:Snapshot, counts:{added,same,conflicts,downloadsAdded,downloadConflicts,tagsAdded,collectionsAdded}, conflicts:Array<{id,title}>}`。

### Task 1: 备份格式与纯合并规则

**Files:** 新建 native/library-backup-model.cjs、tests/backup-model.cjs。

**Interfaces:** `encodeBackup(snapshot, {createdAt,appVersion}) -> Buffer`；`decodeBackup(buffer) -> {snapshot,createdAt,appVersion}`；`mergeSnapshots(current,incoming) -> MergeResult`；`validateSnapshot(value) -> Snapshot`。schemaVersion=1，format='jingcai-backup'。内容摘要针对规范化数据段计算；对象键排序，数组顺序保留。

- [ ] 编写空库、中文、未知合法字段和合并测试，先运行看到缺少模块失败：

```js
const {encodeBackup,decodeBackup,mergeSnapshots}=require('../native/library-backup-model.cjs');
const empty={records:[],index:{schemaVersion:1,tags:[],collections:[],annotations:{},downloads:{}},exists:{journal:false,index:false},origin:'a'.repeat(64)};
assert.deepEqual(decodeBackup(encodeBackup(empty,{createdAt:'2026-10-08T00:00:00Z',appVersion:'1.26.0'})).snapshot,empty);
assert.equal(mergeSnapshots(empty,empty).counts.added,0);
```

- [ ] 实现验证。拒绝非普通对象、重复 UUID、超过 100000 条、深度超过 20 层、递归出现 __proto__/constructor/prototype 键、非有限数和未知 schema。记录仍兼容现有 type/time/content 与合法未知字段。来源协议和凭据校验复用现有规则，不能默默清洗后造成备份不保真；错误须指出记录编号。
- [ ] 索引分类为名称数组，标签/集合名称限制 1–60 字；annotation 的键必须引用备份记录或下载快照，关联名称必须存在。下载快照按现有字段校验，禁止路径穿越；验证不打开引用的下载文件。
- [ ] 对象比较用规范化值，不用属性插入顺序判断冲突。摘录同 ID 不同内容保留当前；分类名称并集；现有作者优先；不同 origin 下相同下载 ID、不同路径计冲突且不混用其分类关联。
- [ ] 增加输入上限、修改字节校验失败、重复 ID、未知字段保留和跨目录冲突用例；运行 `node tests/backup-model.cjs`，预期全部通过。提交本任务源码和测试。

### Task 2: 一致快照、事务与中断恢复

**Files:** 新增 native/library-backup.cjs、native/journal-lock.ps1；修改 native/host.ps1、native/library.ps1、native/library.cjs；测试 tests/backup-transaction.cjs、tests/backup-native.cjs。

**Interfaces:** `readPair(ctx) -> RawPair`；`snapshotPair(raw,ctx) -> Snapshot`；`recover(ctx) -> {recovered:boolean}`；`commitPair(ctx, previewId, rawBefore, nextSnapshot, result) -> result`。测试可传独立依赖对象中的故障钩子；CLI/浏览器消息不暴露故障注入参数。

- [ ] 编写事务边界测试，先观察失败：

```js
await assert.rejects(commitPair(ctx,id,before,next,result,{afterJournal:()=>{throw Error('simulated failure')}}));
assert.deepEqual(readPair(ctx),before);
await recover(ctx);
assert.deepEqual(readPair(ctx),before);
```

- [ ] 建立公共 `Enter-JournalLock(directory)` / `Exit-JournalLock(handle)`，命名与现有 Local\JingcaiClipper_ 哈希完全一致。宿主 save/list/read/delete 在持有 Mutex 时先调用内部恢复检查；Invoke-LibraryAction 从所有调用入口获取相同 Mutex，随后 Node 获取现有 pipe。Mutex 是同线程可重入的，严格配对释放。
- [ ] 所有 Node 资料库动作先在 pipe 内执行 recover，再载入索引和摘录。PowerShell 的直接摘录读写在 Mutex 内通过同一 Node 路径完成 recover 后继续。启动备份选择器前释放锁，避免文件对话框长时间阻塞保存。
- [ ] 事务文件固定为资料目录内 `.jingcai-restore-transaction.json`；只允许处理两个固定目标文件名，不能接受事务数据里的任意写入路径。记录原始字节、存在状态、前后哈希、预览编号与结果；先原子写 pending 标记，再原子替换两份文件，最后持久化 committed 标记。
- [ ] pending 状态回滚两份原始字节；committed 状态保留新数据并补写结果回执。回执持久化后清理事务。回滚和清理可重复执行。校验不通过的事务停止操作并保留证据，不能删除标记后继续写入。
- [ ] 在创建临时文件、替换每份文件、写 committed、写回执和清理前设置单元测试故障点；子进程测试在第一个替换后被终止，再由新进程调用 recover。测试 null 文件恢复为不存在、回滚失败后保留事务、committed 状态不回滚。
- [ ] 模拟并发原生保存、分类编辑及资料快照，确认无死锁和丢失。运行 `node tests/backup-transaction.cjs`、`node tests/backup-native.cjs`、`node tests/library-lock.cjs`、`node tests/test.cjs`；预期全部通过后提交。

### Task 3: 原生备份与恢复流程

**Files:** native/library-backup.cjs、native/library.ps1、native/host.ps1、extension/background.js；tests/backup-native.cjs、tests/library-background.cjs。

**Interfaces:**

```js
// 输入仅示意已约定的消息字段，完整数据保存在本机。
{action:'library-backup-create'} // -> id,file,createdAt,bytes,counts
{action:'library-backup-list',offset:0} // -> items,total,offset，20 项/页
{action:'library-backup-open',id} // -> ok
{action:'library-restore-choose'} // -> cancelled 或 selectionId
{action:'library-restore-preview',selectionId} // -> previewId,expiresAt,counts,conflicts,targetDirectory
{action:'library-restore-apply',previewId,confirmed:true} // -> counts,beforeBackup,receiptId
{action:'library-restore-result',previewId} // -> notStarted/applied，及已提交结果
```

- [ ] 写真实 Native Messaging fixture：备份两份文件、删除一条后预览、确认恢复、重复提交；断言新增一次、现有新增资料不丢失、结果回执可查询。先运行并观察不支持动作失败。
- [ ] 创建备份时持有两层锁，完成 recover 后读取一致原始文件。备份写到“备份”子目录，采用时间+UUID，exclusive 创建临时文件、校验成功后发布；索引本身损坏时拒绝，不生成看似完整的备份。
- [ ] 文件选择由 native/library.ps1 的 Windows OpenFileDialog 完成，返回随机 selectionId；本机保存实际路径、哈希与过期时间。浏览器传入 path/directory/sourcePath 均不参与选源。先 stat 大小，再读取，并检查完整路径各级符号链接。
- [ ] preview 重新验证选源并在本机持久化预览内容及当前两份文件指纹；apply 校验 confirmed、预览有效期、目标目录、备份哈希及当前数据指纹。内容变动返回“资料已变化，请重新预览”。检查旧回执优先于已过期预览，避免超时后的重复提交。
- [ ] apply 在锁内创建恢复前备份并读回验证，成功后调用 commitPair；恢复不读取媒体文件。备份路径可能含私人信息，只在受信任资料库界面显示。
- [ ] background 只允许 library.html 的上述动作，要求 library-backup-v1；从扩展本地 pending 队列检查未保存内容，有待保存记录时拒绝 apply 并引导先完成保存。调用不接受网页 iframe 或内容脚本。旧版本提示更新本地程序。
- [ ] 对取消选择、15 分钟过期、备份被修改、预览后新保存、损坏现有索引、非法编号和磁盘写入失败分别测试，失败前后比较原始字节。运行相关测试全部通过后提交。

### Task 4: 资料库备份面板

**Files:** 新增 extension/library-backup.js；修改 extension/library.html/css；新建 tests/backup-ui.cjs。

**Interfaces:** 面板独立读取备份 API；恢复成功发出 `window.dispatchEvent(new Event('library-restored'))`，library.js 监听后刷新列表、清空勾选及关闭旧详情。元素 ID 使用 backup/restore 前缀避免混淆已有导出按钮。

- [ ] 写 Playwright 测试：开始时“确认合并恢复”不可用；选择取消不显示失败；有效预览后才启用；未确认时没有 apply 消息。

```js
assert.equal(await page.locator('#restoreApply').isEnabled(),false);
await page.click('#restoreChoose');
await page.waitForSelector('#restorePreview:not([hidden])');
assert.equal((await page.evaluate(()=>calls)).filter(x=>x.action==='library-restore-apply').length,0);
```

- [ ] 用明确文案展示备份范围、当前目标目录、预览统计、冲突保留规则、恢复前自动备份及同磁盘风险。正文和路径用 textContent 渲染；冲突摘要折叠显示。
- [ ] 选择与预览采用请求序号，过期响应不得重新启用旧确认按钮。apply 防重入、禁用选择器；超时后提供“核对恢复结果”，先查原 previewId 回执，不创建新任务或自动重试合并。
- [ ] 成功展示 beforeBackup 和统计；失败保留备份文件及错误提示。历史备份分页读取，打开目录只提交 id。测试双击、切换备份、关闭重开、HTML 字符与 320/390/600/1440 宽度。
- [ ] 使用真实隔离 Node/原生服务执行创建→预览→恢复的端到端测试，检查文件字节和页面统计一致；全部通过后提交。

### Task 5: 安装、版本和交付

**Files:** native/install.ps1、portable.ps1、tools/package.ps1、native/diagnostics.ps1、extension/manifest.json、README.md、PRIVACY.md、使用说明.md、showcase/features.json；tests/public-install.cjs、release-audit.cjs。

- [ ] 安装/修复/便携清单加入 library-backup-model.cjs、library-backup.cjs、journal-lock.ps1；所有隔离原生测试夹具复制新依赖，保留源文件 BOM 与 PS 5.1 兼容。公开包不含备份、预览、回执和事务运行数据。
- [ ] 完成功能后将扩展和宿主升级为 1.26.0，增加 library-backup-v1 capability。介绍与说明明确备份不含真实下载文件、只合并恢复、100 MiB 与 100000 条限制、未验证真实断电不能宣传为磁盘级容灾。
- [ ] 运行新增四项测试、七项 library 测试及 collect/collect-ui/connection/app/test/recovery/recovery-ui/interface-layout/showcase；运行 tasks、queue、transfer-recovery 的 PowerShell 回归及全部 PS 5.1 语法检查。逐项记录结果，不能以某一层通过替代原生测试。
- [ ] 执行 `native/bin/node.exe tools/build-showcase.cjs`，再运行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/package.ps1 -PublicRelease`。使用新临时目录和 SkipRegistration 验证安装、升级保留资料以及备份接口；运行 release-audit。
- [ ] 独立审查事务和锁顺序、恢复校验、权限边界及失败回滚。修复重要问题并补失败回归；检查精确暂存清单和 diff 后本地提交。保留分支，不合并、不上传 GitHub。

## 自检与执行建议

设计验收 1/2 属于任务 1/3/4；输入安全属于任务 1/3；崩溃恢复属于任务 2；并发和旧预览属于任务 2/3；界面状态属于任务 4；分发属于任务 5。五项 Review Focus 均有测试归属，动作名称及数据类型在后续任务保持一致。

建议沿用当前会话顺序实施，最后独立审查。锁、事务、原生桥接与 UI 共享协议，不适合并行改动。用户审阅本计划后开始产品代码实现，实施中不再逐项停下来询问是否继续。
