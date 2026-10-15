# 视频下载配套图文 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 获取视频时自动预填当前帖子的标题、正文、作者与一张封面，允许下载前编辑、补图；把确认的图文与视频一同保存，并在同一条资料库记录中搜索、查看和导出，同时让悬浮下载开关的状态一眼可辨。

**Architecture:** `video-info` 在本地生成绑定当前视频与来源页的短期草稿，侧栏只提交编辑后的文字和图片 ID。系统文件选择、区域截图和远端封面分别进入受控暂存；`video-start` 把选择固化到任务，媒体校验后原子写入旁存文件。资料库从已完成任务读取正文与实际保存的文件，配套文件重试后显式刷新记录。

**Tech Stack:** Chrome MV3 扩展（HTML/CSS/JavaScript）、Windows PowerShell 5.1 Native Messaging、随包 Node.js、yt-dlp、现有资料库 Node 模块；现有 Playwright、Node `assert` 与 PowerShell 测试。

**Spec:** `docs/superpowers/specs/2026-10-15-video-companion-design.md`

## Global Constraints

- 只自动带入解析器明确属于当前视频的 `description`、作者与一张封面；不扫描推荐位、头像、评论或视频画面文字。
- 标题与作者各最多 120 字；正文最多 20,000 字且 UTF-8 不超过 64 KiB；来源超限显示截断，用户输入超限拒绝保存，不静默裁剪。
- 草稿绑定规范化视频网址与原来源帖页，解析后 30 分钟过期；任务创建后其图片暂存保留到配套保存成功或明确删除。
- 仅接受 JPEG、PNG、WEBP、GIF 和 PNG 截图；单张至多 8 MiB、总计至多 10 张（含封面），截图至多 4000 万像素。普通 Native Messaging 请求至多 1 MiB，截图使用专门的 12 MiB 入口。
- 图片不能访问本机/私网，不能由页面指定落盘路径；不把 Cookie、Authorization 或原来源页 Referer 发给图片服务器。来源网址写入说明前删除凭据型查询参数。
- 仅视频模式带配套图文；仅音频、图集、文件下载保持原行为。视频成功与配套文件失败独立显示；重试不重复下载媒体，也不覆盖已有文件。
- 悬浮下载按钮保持图标按钮尺寸；开启、关闭和切换中的外观与 `aria-pressed`、标题一致，失败保持原状态。悬停时保留对应状态的下凹反馈。
- 更新 `showcase/features.json`、`使用说明.md` 后运行 `native/bin/node.exe tools/build-showcase.cjs`。本任务可准备下一版号，但不发布公共 Release 或打包公开 ZIP。

## Review Focus

1. 含 `xsec_token` 或其他签名参数的小红书来源：解析仍用原链接，`说明.txt` 和资料库只显示清理后的链接；Task 1、3、4 分别测试。
2. 恶意封面地址、私网跳转、伪造本地图片路径与错误格式：拒绝入稿或保存，视频仍能下载；Task 1、2、4 测试。
3. 解析另一篇帖子、草稿过期或活动标签页改变：不混用前一帖的正文/截图；Task 1、2、5 测试。
4. 同网址同画质重复点击且正文有新编辑：不默默复用旧任务并声称新资料已保存；Task 4、5 测试。
5. 配套图片部分失败、重试后资料库已建索引、文件后来缺失：成功媒体保持完成，重试刷新文件清单，导出显示缺失；Task 3、4、5 测试。

---

## File Map and Interface Contract

- Create `native/video-companion.ps1`: 解析清洗、30 分钟草稿、图片 ID 与暂存、任务快照、配套文件写入/重试。调用现有 `gallery-image.ps1` 的图片判型和截图真实解码，调用 `Invoke-GalleryNetwork` 抓取封面。它不修改图库草稿。
- Modify `native/gallery-http.cjs` and `native/gallery-image.ps1`: `fetchImage({url,sourceKind,method,destination,maxBytes})`、`Invoke-GalleryNetwork($url,$sourceKind,$method,$destination,[int]$maxBytes=33554432)`，既有图库默认 32 MiB，配套封面传 8 MiB。
- Modify `native/video.ps1` and `native/video-worker.ps1`: 点源新模块；新增 `video-companion-stage-cover`、`video-companion-choose`、`video-companion-capture`、`video-companion-retry`；`video-info` 返回 `companion`，`video-start` 接收 `companionDraftId`、`companionTitle`、`companionText`、`companionImageIds`。任务 `companion` 为 `{title,text,author,publicSourceUrl,digest,images,status,files,errors}`；`video-job` 返回 `companionStatus`、`companionError`、`companionRetryable`。
- Modify `native/host.ps1` and `extension/background.js`: 新增能力 `video-companion-v1`，仅可信 `video.html` 可调用新动作；`video-companion-capture` 使用 12 MiB 白名单，普通开始下载不接收 base64 或本地路径。
- Modify `native/library.cjs`: 从完成任务建一条视频记录，正文为 `content`，`files` 含视频、说明和成功的配套图片；新增仅供本地调用的 `library-refresh-download`，用任务真实状态更新已有记录。
- Create `extension/video-companion.js`; modify `extension/video.html`、`video.css`、`video.js`、`task-ui.js`、`library.js`: 卡片、缩略图、选图/截图、任务重试提示及资料库“视频说明”标签。图集卡不承担配套图职责。
- Modify `showcase/features.json`、`使用说明.md`、`extension/manifest.json`、`native/host.ps1`：以最终通过的代码准备 `1.40.0` 说明与能力标记；不创建或推送 Release。
- Modify `extension/icon-buttons.css`、`extension/video.css`、`extension/transfers.js`：修复通用图标样式盖过悬浮下载状态的问题，显示清楚的开关状态。

`video-info` 返回的 `companion` 格式固定为：

```json
{"draftId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","title":"果冻码头","author":"你的提示音","text":"Day 2\n从想要一座海边小镇开始","truncated":false,"sourcePageUrl":"https://www.xiaohongshu.com/explore/abc123","images":[{"id":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","role":"cover","previewUrl":"https://sns-webpic-qc.xhscdn.com/cover.jpg","source":"视频信息","staged":false}]}
```

`video-companion-stage-cover` 接收草稿 ID 和封面 ID，在任务互斥锁之外抓取并暂存封面，返回 `staged:true` 或明确错误；`video-companion-choose` 和 `video-companion-capture` 均返回 `{ok:true,images:[{id,role,format,previewData,source}]}`。`previewData` 是受限尺寸的静态缩略图，不返回用户的本地绝对路径。开始下载只发送草稿 ID、编辑文字与已暂存图片的 ID；本地端根据草稿解析真实文件，不接受浏览器传来的图片 URL。封面准备失败时界面取消选中封面并提示，用户仍可下载视频。

### Task 1: 视频元数据与安全草稿

**Files:**
- Create: `native/video-companion.ps1`
- Modify: `native/video.ps1:1,327-356`
- Test: `tests/video-companion-info.ps1`

**Interfaces:**
- Consumes: yt-dlp `--dump-single-json` 的 `title`、`description`、`uploader`、`thumbnail` / `thumbnails`；规范化后的 `$url` 与原来源页 URL。
- Produces: `New-VideoCompanionDraft($info,$url,$sourcePageUrl,$jobs,$site)` → 上述 `companion` 响应，和 `<draftId>.companion.json`；`Read-VideoCompanionDraft($draftId,$url,$jobs)` → 验证过期与网址的草稿。

- [ ] **Step 1: 写失败测试。** 在 `tests/video-companion-info.ps1` 中用现有 `tests/multisite.ps1` 的模拟 yt-dlp 进程样式，给 `note.desc` 映射后的 `description`、`uploader` 和 `thumbnails`；检查只返回一个封面、正文保留换行、XHS 只接受 `xhscdn.com`、含签名的原链接用于解析而公开链接不含令牌、换网址和过期草稿被拒绝：

```powershell
$info=[pscustomobject]@{title='果冻码头';description="Day 2`n从想要一座海边小镇开始";uploader='你的提示音';thumbnails=@(@{url='https://sns-webpic-qc.xhscdn.com/cover.jpg';width=640;height=960},@{url='http://127.0.0.1/private';width=900;height=900})}
$draft=New-VideoCompanionDraft $info $url $url $jobs 'xiaohongshu'
if($draft.text -notlike 'Day 2*' -or $draft.images.Count -ne 1 -or $draft.images[0].role -ne 'cover'){throw '当前帖元数据未正确入稿'}
try{$null=Read-VideoCompanionDraft $draft.draftId 'https://www.xiaohongshu.com/explore/another' $jobs;throw '串帖草稿被接受'}catch{if($_.Exception.Message -eq '串帖草稿被接受'){throw}}
```

- [ ] **Step 2: 运行测试确认失败。** `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tests/video-companion-info.ps1`；预期因 `New-VideoCompanionDraft` 不存在而失败。
- [ ] **Step 3: 实现最小解析/清洗/草稿。** 在新模块中实现 `Assert-CompanionText`（来源截断并返回 `truncated`，用户输入超限抛错）、`Get-CompanionPublicUrl`（与 `native/library.cjs:sourceUrl` 同样移除 `token|sign|auth|cookie|secret|key|credential|expires|policy` 参数）、`New-VideoCompanionDraft`、`Read-VideoCompanionDraft`；`video-info` 读 JSON 后立即生成并返回草稿。关键分支：

```powershell
$companion=New-VideoCompanionDraft $info $url $(if($message.referer){Assert-MediaPageUrl $message.referer}else{$url}) $jobs $site
return @{ok=$true;title=$info.title;heights=$heights;qualities=$qualities;qualityNotice=$notice;directory=$settings.directory;companion=$companion}
```

- [ ] **Step 4: 运行测试确认通过。** 运行 Task 1 测试及 `tests/multisite.ps1`、`tests/video-quality.ps1`；再加超长正文、NUL、无描述、非同帖封面测试，确保旧模拟解析仍通过。
- [ ] **Step 5: 提交。** `git add native/video-companion.ps1 native/video.ps1 tests/video-companion-info.ps1`，`git commit -m "feat: capture video companion metadata in scoped drafts"`。

### Task 2: 补图暂存、图片安全与消息边界

**Files:**
- Modify: `native/video-companion.ps1`, `native/gallery-http.cjs`, `native/gallery-image.ps1`, `native/video.ps1`, `native/host.ps1`, `extension/background.js`
- Test: `tests/video-companion-images.ps1`, `tests/video-companion-background.cjs`, `tests/gallery-http.cjs`, `tests/gallery-capture.ps1`

**Interfaces:**
- Consumes: Task 1 草稿；本地文件选择框返回的真实路径；`GalleryCapture.capture()` 的 PNG 与来源页。
- Produces: `Stage-VideoCompanionCover($draftId,$imageId,$jobs)`、`Add-VideoCompanionFiles($draftId,$paths,$jobs)` 和 `Add-VideoCompanionCapture($draftId,$png,$sourceUrl,$jobs)` → 暂存状态、缩略图与 ID；三个对应的 Native Messaging 动作。

- [ ] **Step 1: 写失败测试。** PS 测试调用两种添加函数，验证选择两张 PNG/JPEG 后返回 ID 而不返回路径、截图确实绑定来源帖页、SVG/伪装 JPEG/超过 8 MiB/第 11 张拒绝；Node 测试模拟扩展后台，验证网页脚本无法调用、普通 `video-start` 不能转发 `png` 或 `paths`，大图只走截图动作：

```javascript
const untrustedSender={id:'outside',url:'https://example.com'};
const result=await send({action:'video-companion-capture',draftId:'a'.repeat(32),png:'data:image/png;base64,TEST',sourceUrl:'https://example.com/post'});
assert.equal(result.ok,true);
assert.equal(requests.at(-1).action,'video-companion-capture');
assert.equal(await send({action:'video-companion-capture',png:'x'},untrustedSender),null);
await send({action:'video-start',url:'https://example.com/v.mp4',png:'SECRET',paths:['C:/secret']});
assert.equal(requests.at(-1).png,undefined);assert.equal(requests.at(-1).paths,undefined);
```

- [ ] **Step 2: 运行测试确认失败。** `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tests/video-companion-images.ps1` 和 `native/bin/node.exe tests/video-companion-background.cjs`；预期缺少动作/函数而失败。
- [ ] **Step 3: 实现图片暂存。** 选择动作只在 Native 端打开多选 `OpenFileDialog`；图片入稿时复制到 `video-jobs/<id>.companion-image`，用 `Get-GalleryImageExtension` 加 `System.Drawing.Image.FromStream` 验真实格式/像素，缩略图压到每张 40 KiB 以内。截图动作解码 `data:image/png;base64,` 并调用 `Get-GalleryCapturePngInfo`，仅接受与草稿 `sourcePageUrl` 相同的页面。`gallery-http.cjs` 为 `fetchImage` 增加 `maxBytes`，封面准备动作传 8 MiB，其他图库调用默认 32 MiB；下载后按真实格式复验并写入草稿，网络请求绝不在任务互斥锁内执行。`host.ps1` 把 `video-companion-capture` 加入 12 MiB 例外并声明 `video-companion-v1`。后台只对可信 `video.html` 放行三个动作和白名单字段，旧 Native 缺能力时显示更新/修复提示。

```powershell
if($message.action -eq 'video-companion-capture'){return Add-VideoCompanionCapture $message.draftId $message.png $message.sourceUrl $jobs}
if($message.action -eq 'video-companion-choose'){return Show-VideoCompanionFilePicker $message.draftId $jobs}
if($message.action -eq 'video-companion-stage-cover'){return Stage-VideoCompanionCover $message.draftId $message.imageId $jobs}
```

- [ ] **Step 4: 运行测试确认通过。** Task 2 新测试、`tests/gallery-http.cjs`、`tests/gallery-capture.ps1`、`tests/gallery-background.cjs` 全部通过；另测试公网网址跳私网时 `fetchImage` 拒绝且删除临时文件。
- [ ] **Step 5: 提交。** `git add` 本任务列出的文件，`git commit -m "feat: stage validated companion images and captures"`。

### Task 3: 一条资料库记录关联正文和文件

**Files:**
- Modify: `native/library.cjs`, `extension/library.js`
- Test: `tests/video-companion-library.cjs`, `tests/library-export.cjs`, `tests/library-native.cjs`

**Interfaces:**
- Consumes: 已完成视频任务 `job.companion={title,text,author,publicSourceUrl,files,status}` 和实际 `job.file`。
- Produces: `library-refresh-download`（仅本地程序调用，参数为 32 位十六进制任务 `id`）；视频记录 `content=text`，文件清单 `[video,...companion.files]`。

- [ ] **Step 1: 写失败测试。** 用合成已完成任务创建视频、`说明.txt`、一张 PNG，调用 `Library.dispatch({action:'library-query'})` 和 `library-read`，检查正文可搜索、作者与标题正确、文件数为 3；模拟首次只保存说明，之后加图片并调用 `library-refresh-download`，文件数由 2 变 3；ZIP 导出含三个文件，删除图片后预览/导出报缺失。示例断言：

```javascript
const id='c'.repeat(32),record=await request({action:'library-query',query:'果冻码头'});
assert.equal(record.items.find(x=>x.id==='download:'+id)?.preview,'Day 2\n从想要一座海边小镇开始');
assert.equal((await request({action:'library-read',id:'download:'+id})).item.fileCount,3);
await request({action:'library-refresh-download',id});
assert.equal((await request({action:'library-read',id:'download:'+id})).item.fileCount,3);
```

- [ ] **Step 2: 运行测试确认失败。** `native/bin/node.exe tests/video-companion-library.cjs`；预期新记录正文为空、文件数为 1 或刷新动作不受支持。
- [ ] **Step 3: 实现索引和刷新。** 将 `load()` 中下载记录构建抽成 `downloadFromJob(j,id)`：只从下载目录下的实际文件读取 `fileInfo`，正文只取已确认 `j.companion.text`，标题/作者用伴随字段，来源 URL 调用现有 `sourceUrl()` 清理。`library-refresh-download` 在资料库锁内重新读已完成任务，原子替换该 `download:<id>` 记录，不更改标签/集合/删除标记。`extension/library.js` 对视频下载正文显示“视频说明”，其余类型标签不改。

```javascript
const paths=[j.file,...(j.companion?.files||[])];
const files=[...new Set(paths)].map(p=>fileInfo(p,j.directory));
const content=typeof j.companion?.text==='string'?j.companion.text:'';
```

- [ ] **Step 4: 运行测试确认通过。** Task 3 新测试、`tests/library-export.cjs`、`tests/library-native.cjs`、`tests/library-e2e.cjs` 通过；核对现有旧视频任务仍保持空正文与单个媒体文件。
- [ ] **Step 5: 提交。** `git add native/library.cjs extension/library.js tests/video-companion-library.cjs`，`git commit -m "feat: index video companion content and files together"`。

### Task 4: 下载任务快照、旁存文件和失败重试

**Files:**
- Modify: `native/video-companion.ps1`, `native/video.ps1`, `native/video-worker.ps1`, `native/gallery-image.ps1`, `native/gallery-http.cjs`
- Test: `tests/video-companion-job.ps1`, `tests/video-companion-files.ps1`, `tests/multisite.ps1`, `tests/download-engine.cjs`

**Interfaces:**
- Consumes: Task 1/2 草稿与图片，Task 3 `library-refresh-download`。
- Produces: `Commit-VideoCompanion($message,$url,$jobs)` → 固定快照与 SHA-256 `digest`；`Write-VideoCompanionFiles($job,$jobPath)` → 更新 `files/status/errors`；`video-companion-retry` 动作。

- [ ] **Step 1: 写失败测试。** `tests/video-companion-job.ps1` 使用模拟引擎检查有效草稿快照、正文限长、图片 ID 串帖与过期拒绝、仅音频不附带；相同 URL/格式且正文不同的二次开始明确报错，同内容返回同任务 ID。`tests/video-companion-files.ps1` 用已校验媒体文件和暂存图，检查 `说明.txt` 用 UTF-8、公开 URL 去除 `xsec_token`、目录由媒体实际路径和任务 ID 派生、同名文件不覆盖，模拟一张图复制失败后状态为 `partial`，重试只补缺失图、不下载媒体并刷新资料库：

```powershell
$snapshot=Commit-VideoCompanion ([pscustomobject]@{companionDraftId=$draft.draftId;companionTitle='果冻码头';companionText='Day 2';companionImageIds=@($draft.images[0].id)}) $url $jobs
if($snapshot.text -ne 'Day 2' -or $snapshot.images.Count -ne 1){throw '任务未固化配套快照'}
$job=[pscustomobject]@{file=$media;directory=$root;source=$url;companion=$snapshot}
Write-VideoCompanionFiles $job $jobPath
if($job.companion.status -ne 'complete' -or -not (Test-Path -LiteralPath $job.companion.files[0])){throw '视频旁存文件未完成'}
```

- [ ] **Step 2: 运行测试确认失败。** 运行两个新 PS 测试；预期 `Commit-VideoCompanion` / `Write-VideoCompanionFiles` 不存在。
- [ ] **Step 3: 实现任务与旁存。** `video-start` 在现有任务互斥锁内验证草稿，仅接收 Task 2 已暂存的图片 ID，按选择固化快照；把 `digest` 与已有任务比较，相同才复用，不同则抛出解释本次修改未应用的错误。`video-worker.ps1` 在媒体 FFprobe 成功后调用 `Write-VideoCompanionFiles`，记录 `partial/complete` 并写任务 JSON，再标记 `completed` 与建立资料库快照。旁存目录名采用媒体文件 stem + 任务 ID 前 8 位，逐个以临时文件写入后无覆盖改名；重试保持原路径/编号。`video-job` 投影配套状态及可重试标志，`video-jobs` 的“未完成”筛选还包括配套状态 `partial` 的已完成视频。`video-companion-retry` 在任务互斥锁内只重写缺失文件并调用 `library-refresh-download`，不改变媒体状态。

```powershell
if($job.companion){Write-VideoCompanionFiles $job $JobPath;Write-VideoJson $JobPath $job}
$job.state='completed'
```

- [ ] **Step 4: 运行测试确认通过。** 新 PS 测试、`tests/multisite.ps1`、`tests/video-quality.ps1`、`tests/download-engine.cjs` 通过；额外验证断点续传沿用原快照、删除已完成任务前的资料库快照包含正文/配图，以及图片部分失败时媒体仍为 `completed`。
- [ ] **Step 5: 提交。** `git add` 本任务列出的文件，`git commit -m "feat: save and retry video companion sidecars"`。

### Task 5: 侧栏编辑、截图与任务反馈

**Files:**
- Create: `extension/video-companion.js`
- Modify: `extension/video.html`, `extension/video.css`, `extension/video.js`, `extension/task-ui.js`, `extension/background.js`
- Test: `tests/video-companion-ui.cjs`, `tests/video-companion-background.cjs`, `tests/media-acquisition-ui.cjs`, `tests/audio-ui.cjs`, `tests/video-state.cjs`

**Interfaces:**
- Consumes: `video-info.companion`、Task 2 补图动作、Task 4 `video-start` / `video-job` / `video-companion-retry`。
- Produces: `VideoCompanion.create({send,capture})` → `{show,reset,hasChanges,selection,setDisabled}`，`selection()` → `{companionDraftId,companionTitle,companionText,companionImageIds}`。

- [ ] **Step 1: 写失败 Playwright/UI 测试。** 模拟 `video-info` 返回一段正文与一张封面，断言卡片展开、正文可编辑、移除封面后 `video-start` 只带保留的图片 ID；模拟系统文件选择和截图返回缩略图，检查取消/Esc 不新增图片、来源页不一致有明确错误。切换到仅音频时开始消息不带伴随字段；改网址/重新解析前有未提交编辑时要求确认；360px 视口不横向溢出。任务模拟 `companionStatus:'partial'` 时显示视频已完成及“重试配套资料”，按钮只发 `video-companion-retry`。关键断言：

```javascript
await page.click('#inspect');
await page.fill('#companionText','修改后的正文');
await page.click('[data-companion-remove="cover"]');
await page.click('#download');
const started=await page.evaluate(()=>sent.find(m=>m.action==='video-start'));
assert.equal(started.companionText,'修改后的正文');
assert.equal(started.companionImageIds.length,0);
```

- [ ] **Step 2: 运行测试确认失败。** `native/bin/node.exe tests/video-companion-ui.cjs`；预期找不到配套卡/文字框。
- [ ] **Step 3: 实现侧栏。** 在画质卡与图库卡之间加 `#companionCard`，加载 `video-companion.js`；首个视频解析后打开，折叠摘要清楚显示自动/手动来源。解析后异步请求 `video-companion-stage-cover`，准备成功才默认选中封面；失败时取消选中并显示原因，允许继续下载。配套图片用轻量缩略图条和统一的移除图标按钮，图片 `referrerpolicy="no-referrer"`，纯文字用 `textContent`。`video.js` 的 `inspectVideo`、`useVideoUrl`、`controls`、`video-start` 与 `mediaMode` 交给组件同步；截图复用 `GalleryCapture.capture(windowId,{confirmLabel:'加入配套图片'})`，但调用新配套动作，不污染图集草稿。普通网页直链使用 `video-source:<windowId>.referer` 作为补图来源页。新操作的超时按系统文件选择和远端封面准备各自设置，不沿用普通开始下载的 20 秒；失败保留用户文字。任务卡在 `partial` 时显示独立告警及重试按钮。

```javascript
const companion=VideoCompanion.create({send,capture:options=>GalleryCapture.capture(chrome.windows.getCurrent().then(w=>w.id),options)});
// inspectVideo 成功后：
companion.show(data.companion);
// video-start：
const extra=$('mediaMode').value==='video'?companion.selection():{};
await send('video-start',{url:parsedUrl,height:Number($('height').value),...extra});
```

- [ ] **Step 4: 运行测试确认通过。** 新测试、`tests/media-acquisition-ui.cjs`、`tests/audio-ui.cjs`、`tests/video-state.cjs`、`tests/gallery-ui.cjs`、`tests/gallery-capture-flow.cjs`、`tests/task-controls.cjs`、`tests/task-metrics.cjs` 通过；检查截图确认文字和键盘关闭行为。
- [ ] **Step 5: 提交。** `git add` 本任务列出的文件，`git commit -m "feat: edit and attach companion content before video download"`。

### Task 6: 悬浮下载按钮状态可见

**Files:**
- Modify: `extension/video.css`, `extension/icon-buttons.css`, `extension/transfers.js`
- Test: `tests/video-login-quality.cjs`, `tests/button-feedback-ui.cjs`

**Interfaces:**
- Consumes: `chrome.storage.local.hoverDownloadEnabled`、`hover-download-set` 结果。
- Produces: `#hoverToggle[aria-pressed]` 与视觉状态同步；开为高亮、关为中性，切换中禁用，失败回到原状态。

- [ ] **Step 1: 写失败 UI 测试。** 在 `tests/video-login-quality.cjs` 中分别模拟初始开/关、点击成功/失败及存储变更，检查 `aria-pressed`、标题和实际计算样式：开启时有明显的有色背景，关闭时为中性背景；鼠标悬停后的有色开启态仍可辨，切换中无双击。`tests/button-feedback-ui.cjs` 检查开启/关闭两态的悬停下凹阴影。
- [ ] **Step 2: 运行测试确认失败。** `native/bin/node.exe tests/video-login-quality.cjs` 与 `native/bin/node.exe tests/button-feedback-ui.cjs`；预期开启态的计算样式仍是通用透明背景。
- [ ] **Step 3: 实现最小样式与状态反馈。** 让 `#hoverToggle` 退出通用透明背景覆盖，使用与其他图标按钮相同的 32px 尺寸；开启时用有色背景和状态标记，关闭时用中性背景及关闭标记，悬停保持各自配色与内凹阴影；点击期间保持旧状态并显示忙碌，成功或外部存储变化才更新，失败不误报开启。同步更新动态 `aria-label` 和 `title`。
- [ ] **Step 4: 运行测试确认通过。** 运行本任务测试及 `tests/media-acquisition-ui.cjs`；在 360px 视口确认标题行没有溢出。
- [ ] **Step 5: 提交。** `git add extension/video.css extension/icon-buttons.css extension/transfers.js tests/video-login-quality.cjs tests/button-feedback-ui.cjs`，`git commit -m "fix: show hover download toggle state clearly"`。

### Task 7: 产品说明、版本和完整验证

**Files:**
- Modify: `showcase/features.json`, `使用说明.md`, `extension/manifest.json`, `native/host.ps1`
- Generated: `功能介绍.html`
- Test: `tests/showcase.cjs`, `tests/installed-smoke.cjs` 及前述受影响测试

**Interfaces:**
- Consumes: 完成并通过测试的 Task 1–6 行为。
- Produces: 对用户准确说明 `1.40.0` 的功能和限制；扩展与本地程序版本一致，功能介绍由来源构建。

- [ ] **Step 1: 写失败文档契约测试。** `tests/video-companion-docs.cjs` 读取功能介绍来源和使用说明，检查“视频配套图文”、自动带入范围、手动补图、仅视频模式及可能的部分失败提示，而不声称所有站点/DRM 内容都可获取：

```javascript
const fs=require('node:fs'),assert=require('node:assert/strict');
const features=fs.readFileSync('showcase/features.json','utf8'),guide=fs.readFileSync('使用说明.md','utf8');
assert.match(features,/视频配套图文/);assert.match(guide,/只自动带入当前视频/);assert.match(guide,/配套图片.*失败/);
```

- [ ] **Step 2: 运行测试确认失败。** `native/bin/node.exe tests/video-companion-docs.cjs`；预期缺少新说明。
- [ ] **Step 3: 更新说明与版本。** 在 `showcase/features.json` 的视频卡加入“视频配套图文”及悬浮下载开关状态说明，在 `使用说明.md` 顶部写 `v1.40.0` 操作说明、失败/隐私边界及开关状态提示；`extension/manifest.json` 与 `native/host.ps1` 的公开版本统一 `1.40.0`，保留 Task 2 加入的能力标记。运行 `native/bin/node.exe tools/build-showcase.cjs` 生成 `功能介绍.html`；不直接编辑生成文件。
- [ ] **Step 4: 运行完整验证。** 新文档测试、`tests/showcase.cjs`、`tests/installed-smoke.cjs`、Task 1–6 新测试及所有本计划列出的回归测试；`git diff --check`，并核对 `git status --short` 只含预期源码/文档与生成页面。涉及发布前完整性/隔离安装仅在以后用户请求发布时按 AGENTS.md 执行。
- [ ] **Step 5: 提交。** 只暂存上述源文件、测试及 `功能介绍.html`，明确排除 `work`、`outputs`、native 运行时 JSON、Cookie、任务历史和第三方引擎；`git commit -m "docs: describe video companion downloads in 1.40.0"`。

## Final Review

- 对照规格逐项核验：XHS 当前帖预填、编辑/补图、来源绑定、配套文件、资料库搜索/导出、任务部分失败/重试、音频/图集不受影响；悬浮下载开关的可见状态与实际状态同步。
- 用新扩展连接旧 Native 测试能力标记提示；用新 Native 跑旧视频/图库任务测试兼容。
- 请一个独立代码审查者检查安全边界、重复任务和资料库索引刷新，再运行针对其修复的测试。发布、推送和创建 Release 均不在本计划自动执行范围内。
