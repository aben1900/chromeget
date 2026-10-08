# P0 First Use, Collection and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成安装连接自检、统一内容收集与可执行错误恢复，使用户能完成首次保存并从常见故障中恢复。

**Architecture:** 保留现有 app 外壳与三个功能 iframe，增加收集页；通过 background 管理可信消息、草稿和摘录提交。诊断使用独立原生动作；共享错误契约贯穿原生响应、后台任务和页面呈现。三个 P0 共享该契约，按下面六个可独立验证的任务顺序实现。

**Tech Stack:** Chrome MV3、原生 JavaScript/CSS、Windows PowerShell 5.1、WinForms、Node.js assert/vm、现有 Playwright 测试。

**Spec:** `docs/superpowers/specs/2026-10-08-p0-first-use-collection-recovery-design.md`（已确认）

## Global Constraints

- 保留一个 Chrome 扩展与一个根目录入口“开始使用.cmd”。
- 不加入云同步、AI 整理、团队协作或新下载引擎。
- 引擎下载沿用明确 URL 与 SHA-256 锁定策略。
- 不扫描浏览器配置目录、不修改 Chrome 配置。
- 浏览器中的真实 Native Messaging 响应才允许显示“Chrome 已连接”。
- 不后台读取剪贴板；用户确认后才保存或开始下载。
- 旧任务、JSON、暂停续传、按窗口隔离和现有权限边界必须兼容。
- 不支持绕过 DRM，不宣称所有网站可用，不制造进度或诊断成功。
- 仅在临时目录做安装验证，使用 SkipRegistration；不修改用户真实注册。
- 不提交 work、outputs、Cookie、运行时 JSON、任务历史或引擎二进制。
- 实施时先使用 using-git-worktrees 确认隔离环境；通过后按精确文件清单提交，禁止 git add .。

## Review Focus

1. 两个窗口提交同一草稿、重复点击或丢失响应：不能重复写入；任务 4 的同 ID 并发/重试测试负责。
2. 安装注册指向便携路径或另一个旧目录：检测实际注册，不根据默认 AppData 猜测；任务 2 的夹具负责。
3. 源站返回 403、带签名网址或恶意错误字符串：不能误报登录、泄漏令牌或执行 HTML；任务 1、5 负责。
4. 检测时用户切页、改变输入或重新打开面板：旧异步结果不覆盖新状态；任务 3、4 负责。
5. 图集/HF/批量任务部分成功：重试不重复成功项，不凭失败文字显示续传；任务 5 负责。

## 文件责任

| 文件 | 责任 |
| --- | --- |
| extension/recovery.js、recovery.css | 错误兼容分类、脱敏、恢复卡；也可在 background 载入纯函数 |
| native/recovery.ps1 | 稳定原生错误响应与异常 code 映射 |
| native/diagnostics.ps1 | 本机状态快照、注册解析、目录与依赖检查 |
| extension/connection.js | 扩展诊断状态、复制 ID、安装说明 |
| extension/collect-model.js | 纯输入分类、草稿约束 |
| extension/collect.html、collect.js、collect.css | 收集预览、草稿恢复、确认与分流 |
| extension/background.js | 可信消息校验、入队、诊断/错误透传、右键入口 |
| tools/start-center.ps1 | 管理中心三步引导及异步检查 |
| 现有下载、任务、摘录页面 | 接入恢复卡及对应动作，不重写下载引擎 |

## Task 1：建立错误契约与保守兼容分类

**Files:** 新增 `extension/recovery.js`、`native/recovery.ps1`、`tests/recovery.cjs`；修改 `extension/background.js`、`native/host.ps1`、`native/video-worker.ps1`、`native/range-worker.ps1`、`native/install.ps1`、`native/portable.ps1`、`tests/test.cjs`。

**Interfaces:** `Recovery.normalize(value, context={}) -> {code,message,retryable,details}`；`Recovery.redact(text) -> string`。原生 `New-RecoveryError -Message <string> -Code <string> -Retryable <bool>` 返回 `{ok:false,error,code,retryable,details}`。异常通过 `Exception.Data['code']` 标记；未知异常保留 UNKNOWN。任务 JSON 增加可选 code/retryable/details，旧 error 保留。

- [ ] 编写纯函数失败测试，覆盖所有 code：HOST_UNAVAILABLE、HOST_OUTDATED、ENGINE_MISSING、AUTH_REQUIRED、LINK_EXPIRED、DISK_FULL、DIRECTORY_UNAVAILABLE、NETWORK_TEMPORARY、TLS_INVALID、CHECKSUM_MISMATCH、UNSUPPORTED、DRM、SUBMISSION_UNKNOWN、UNKNOWN。

```js
const assert = require('node:assert/strict');
const Recovery = require('../extension/recovery.js');
assert.equal(Recovery.normalize({error:'HTTP Error 403: Forbidden'}).code,'UNKNOWN');
assert.equal(Recovery.normalize({code:'AUTH_REQUIRED',error:'Sign in required'}).code,'AUTH_REQUIRED');
assert.equal(Recovery.normalize({code:'TLS_INVALID',error:'certificate invalid'}).retryable,false);
assert.ok(!Recovery.redact('https://a.test/file?token=secret#private').includes('secret'));
assert.ok(!Recovery.redact('Authorization: Bearer secret\nCookie: session=private').includes('secret'));
```

- [ ] 运行 `native/bin/node.exe tests/recovery.cjs`，确认缺少模块导致失败。
- [ ] 实现 UMD 风格模块，同时支持 CommonJS 与扩展全局；以已知 code 为先，文字规则仅匹配明确证据。脱敏删除 URL userinfo/query/hash、Cookie/Authorization 值及诊断中的本机路径；不对真实下载 URL 本身做修改。

```js
function responseError(response) {
  const error = new Error(response.error || '操作未完成');
  for (const key of ['code','retryable','details']) error[key] = response[key];
  return error;
}
// native() 和页面 send() 保留这些字段，而不是重新拼接成纯文字。
```

- [ ] 在能确定故障的原生检查点写 code；worker catch 保存可选字段，成功/续传时清除旧错误字段。导入 recovery.ps1 的宿主测试沙箱同步复制该脚本；安装器与便携依赖检查加入它。
- [ ] 运行上述测试与 `native/bin/node.exe tests/test.cjs`，断言原生错误仍有 error，新增 code 不破坏旧客户端；模拟 worker 失败保存再读取，确认 code 未丢失。
- [ ] 通过后精确提交本任务文件，提交信息 `feat: add structured recovery errors`。

## Task 2：本机诊断与管理中心步骤

**Files:** 新增 `native/diagnostics.ps1`、`tests/diagnostics.ps1`；修改 `native/host.ps1`、`native/install.ps1`、`native/portable.ps1`、`tools/start-center.ps1`、`tests/public-install.cjs`。

**Interfaces:** `Get-SetupDiagnostics -HostRoot <path> -ExpectedExtensionId <id> -RegistrationPaths <string[]> -FullIntegrity` 返回 `{checks:[{id,state,message}],hostVersion,capabilities}`，state 为 pass/fail/pending。注册读取与纯检查分开，测试传夹具路径；FullIntegrity 由用户显式触发。原生新动作 `diagnostics` 接受扩展 ID，返回诊断；不得触发摘录 flush。

- [ ] 编写失败测试，至少检查不存在的安装目录和冲突注册，建立独立临时文件夹，不写真实注册。

```powershell
. "$PSScriptRoot\..\native\diagnostics.ps1"
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('chromeget-diag-'+[guid]::NewGuid().ToString('N'))
$r=Get-SetupDiagnostics -HostRoot $fixture -ExpectedExtensionId ('a'*32) -RegistrationPaths @()
if(-not ($r.checks | Where-Object {$_.id -eq 'host' -and $_.state -eq 'fail'})){throw 'Missing host reported as ready'}
if($r.checks | Where-Object {$_.id -eq 'browser' -and $_.state -eq 'pass'}){throw 'Cannot infer browser connection'}
```

- [ ] 运行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/diagnostics.ps1`，确认缺少实现而失败。
- [ ] 拆出实际 Registry32/Registry64 读取，检查默认值指向的 manifest、host 路径、allowed_origins 与选定 ID。优先检查有效注册来源，标准路径仅作为未注册时的安装候选；冲突显示待修复。逐项 catch，目录故障不能掩盖其他检查。
- [ ] 引擎文件存在与完整校验分开显示；没有可靠哈希证据时显示待验证。完整校验复用锁文件/现有安装清单，安装复制所需诊断元数据，不把在线检查改为任意 URL 更新。目录写入探测只清理自己创建的随机文件。
- [ ] 在管理中心增加三步状态、自检按钮和逐项结果，用后台进程运行检查并在 UI 线程渲染结果。安装成功只提示“本机安装完成，请在扩展验证连接”。修复结束自动重新检查；保留已有 ID 复用与目录选择。

```powershell
# 诊断运行独立于真实浏览器通信，不能写“Chrome 已连接”。
$stateLabel.Text='本机检查完成，请在 Chrome 扩展中点击“重新检测”。'
```

- [ ] 扩充夹具：损坏 manifest、错误 ID、便携注册、缺失引擎、哈希不匹配、目录不可写；确认无残留探测文件。运行 diagnostics.ps1 和管理中心 `-SelfTest`，检查异步 UI、重复点击与失败恢复。
- [ ] 精确提交本任务文件，提交信息 `feat: guide setup with isolated diagnostics`。

## Task 3：扩展中的真实连接面板

**Files:** 新增 `extension/connection.js`、`tests/connection.cjs`；修改 `extension/app.html`、`extension/app.js`、`extension/app.css`、`extension/background.js`、`tests/app.cjs`。

**Interfaces:** `check-connection` 消息仅由 app.html/collect.html 发起；返回 `{ok,connected,checks,hostVersion,capabilities}`。`connected` 仅来自成功 Native Messaging；引擎未准备好可以 connected=true，但总体不可用。使用原生 status 的只读原始调用兼容旧宿主，不调用 background 中带 flush 的 status 分支。

- [ ] 用现有 vm/Playwright mock 写失败测试：未安装、宿主可通信但引擎缺失、旧宿主、并发两次检测；确认检测不发 save/retry。

```js
// mock.calls 记录真实发送动作；连接卡通过既定 DOM 选择器断言。
assert.equal(calls.some(x => x.action === 'save' || x.action === 'retry'), false);
assert.equal(await page.locator('[data-check="browser"]').textContent(), 'Chrome 已连接');
assert.equal(await page.locator('[data-check="engines"]').textContent(), '引擎需要修复');
```

- [ ] 运行 `native/bin/node.exe tests/connection.cjs`，先确认失败。
- [ ] 增加可折叠连接面板：正在检测、未连接、已连接但需处理、可用四类状态。提供复制 ID、重试及管理中心操作说明；clipboard 写入失败保留可选中文字。检测序号隔离过期返回，按钮 pending 时禁用。
- [ ] 后台严格检查 sender.id 与 URL origin/path；content script、任意 iframe 和相似路径不得调用 diagnostics。连接失败也能打开收集页编辑草稿。无法可靠确定管理中心路径时显示指引，不新增任意程序启动协议。
- [ ] 运行 connection.cjs、app.cjs，补测 320 像素布局和键盘可达；精确提交 `feat: verify native connection from the sidebar`。

## Task 4：统一收集入口与幂等保存

**Files:** 新增 `extension/collect-model.js`、`extension/collect.html`、`extension/collect.js`、`extension/collect.css`、`tests/collect.cjs`、`tests/collect-ui.cjs`；修改 `extension/app.html`、`extension/app.js`、`extension/app.css`、`extension/background.js`、`tests/app.cjs`、`tests/test.cjs`。

**Interfaces:** `Collect.classify(text) -> {kind:'empty'|'text'|'url'|'multi',text,url?}`。草稿 session key `collect-draft:<windowId>`，值 `{id,revision,text,type,title,sourceUrl,sourceTitle,time,submissionState}`。`collect-save` 只接受草稿 ID、windowId、revision；后台从 session 取内容，不信任 UI 提供的任意记录。返回 `{ok,id,state:'saved'|'pending'}`。`collect-state` 查询同 ID，超时后先查询再决定重试。

- [ ] 编写输入分类与后台幂等测试；引入真实 native JSON 落盘去重测试，不能仅靠前端禁用按钮。

```js
const assert=require('node:assert/strict');
const Collect=require('../extension/collect-model.js');
assert.equal(Collect.classify('www.example.com/a?x=1').url,'https://www.example.com/a?x=1');
assert.equal(Collect.classify('一段正文 https://example.com').kind,'text');
assert.equal(Collect.classify('https://a.test\nhttps://b.test').kind,'multi');
assert.notEqual(Collect.classify('javascript:alert(1)').kind,'url');
```

- [ ] 运行 collect.cjs 确认缺少模块失败，然后实现分类。URL 规则复用 video-url.js；不解析文本内任意链接为自动动作。
- [ ] 提取后台 `enqueueRecord(record)`，旧右键与新收集共用 exclusive 队列。同 ID pending 合并，已保存回执记录到草稿；宿主同 ID 保存仍沿用既有去重。提交前持久化 submissionState，响应丢失后保留草稿 ID；内容修改产生新 revision，成功保存后明确清空/新建，不偷偷复用旧 ID 保存不同文字。
- [ ] 收集页默认预览文字，确认类型/提示词标题后提交；网址显示保存地址和下载内容两个按钮。下载仅设置已有 download-link/app-view 或 video-url/app-view 会话键，让现有页面解析并确认。HF 不跳过文件选择，多链接引导现有批量区域，不自动入队。

```js
await chrome.storage.session.set({
  [`download-link:${windowId}`]: {url: draft.url, time: Date.now()},
  [`app-view:${windowId}`]: 'download'
});
// 此分流步骤不调用 video-file-start 或 video-start。
```

- [ ] 新用户默认 collect，已存 app-view 继续使用；iframe 懒加载保留原状态。增加统一右键收集菜单，旧保存菜单保留。右键打开侧栏必须在用户手势内执行，随后存入窗口草稿。
- [ ] 执行 collect.cjs、collect-ui.cjs、app.cjs、test.cjs、easy-download.cjs：覆盖双击、两个窗口、同 ID 丢失响应、断连 pending、快速编辑、提示词修改标题、重新打开恢复、只预览不下载、HF 勾选流程、HTML 文本无执行。
- [ ] 精确提交 `feat: collect text and links in one entry`。

## Task 5：恢复卡与真实动作接入

**Files:** 新增 `extension/recovery.css`、`tests/recovery-ui.cjs`；修改 `extension/recovery.js`、`extension/popup.html/js`、`extension/download.html/js`、`extension/video.html/js`、`extension/transfers.js`、`extension/task-ui.js`、`extension/download-tasks.js`、`extension/collect.js`、相关测试载入脚本。

**Interfaces:** `Recovery.render(container,error,{retention,actions})`，actions 为可信代码传入的 `{id,label,run}` 数组；模块不依据日志构造 URL/命令。`Recovery.actionsFor(error,{canResume,hasSource,canChooseFolder,hasTask,hasPending}) -> string[]` 仅返回允许动作 ID。renderer 用 textContent，折叠 details 只放脱敏内容。

- [ ] 编写失败测试：旧 403 无登录提示、失败图集不能续传、网络失败且可续传时只发送一次原任务 video-resume，未知提交超时只显示查看任务。

```js
assert.deepEqual(Recovery.actionsFor({code:'SUBMISSION_UNKNOWN'}, {hasTask:true}), ['view-tasks']);
assert.ok(!Recovery.actionsFor({code:'NETWORK_TEMPORARY'}, {canResume:false}).includes('resume'));
assert.ok(!Recovery.actionsFor({code:'DRM'}, {hasSource:true}).includes('retry'));
```

- [ ] 运行 recovery.cjs、recovery-ui.cjs 确认失败，再实现卡片与 action 白名单。每卡只突出一个主动作，说明“草稿保留/已下载片段保留/状态待核对”；没有证据时不宣称已保存。
- [ ] 下载/视频 send 保留结构化错误；task card 优先读取新字段、旧任务走兼容分类。目录不足只打开原目录和允许原任务继续，不自动迁移片段；链接过期进入重新解析并要求确认；登录态仅复用对应已支持平台的主动操作。
- [ ] 摘录错误复用已有 retry 与管理中心说明。新输入/成功操作清理对应卡片，旧请求错误不能覆盖新输入。批量操作记录逐项失败，重试只处理失败项。
- [ ] 全部页面加载 shared 模块时更新现有测试脚本注入顺序。运行 recovery-ui.cjs、task-controls.cjs、task-loading.cjs、gallery-ui.cjs、audio-ui.cjs、easy-download.cjs；检查 320/390px、键盘焦点、错误详情脱敏与 HTML 注入。
- [ ] 精确提交 `feat: offer contextual recovery actions`。

## Task 6：版本、文档、完整回归与交付

**Files:** 修改 `extension/manifest.json`、`native/host.ps1` 中协议版本/能力、`showcase/features.json`、`README.md`、`使用说明.md`，按实际权限变化核对 `PRIVACY.md`；生成 `功能介绍.html`；必要时修改 `tools/package.ps1`、`tests/release-audit.cjs`。

**Interfaces:** 扩展与宿主目标版本 1.24.0；新增能力 `setup-diagnostics`、`structured-errors`。能力判断优先于字符串版本比较，旧宿主提供更新引导，不直接崩溃。

- [ ] 检查 installer 复制 diagnostics.ps1/recovery.ps1 及诊断所需元数据，便携/修复也可用。以任务列表与错误恢复的实际实现更新文档，不提前写成功声明。

```powershell
& native/bin/node.exe tools/build-showcase.cjs
if($LASTEXITCODE){throw 'Showcase generation failed'}
```

- [ ] 执行核心及本轮测试：test.cjs、recovery.cjs、diagnostics.ps1、connection.cjs、collect.cjs、collect-ui.cjs、recovery-ui.cjs、app.cjs、easy-download.cjs、task-controls.cjs、task-loading.cjs、interface-layout.cjs、showcase.cjs。逐条记录退出码；失败先定位，修复后重跑受影响用例。
- [ ] 运行与异步错误字段有关的任务/续传回归：tasks.ps1、transfer-recovery.ps1、queue.ps1；所有夹具位于临时目录或 work，不触碰真实用户任务。
- [ ] 使用管理中心 SelfTest 生成快照、浏览器测试输出 320/390 像素截图，人工检查视觉布局，不只依赖 DOM 断言。没有完整验证的环境差异在交付说明中列出。
- [ ] 使用 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/package.ps1 -PublicRelease` 构建本地验证包，再运行 public-install.cjs 和 release-audit.cjs。仅构建与验证，不上传 GitHub。若依赖下载受网络阻断，保留失败证据，不把缓存存在视为新电脑安装验证完成。
- [ ] 检查 `git diff --check`、精确暂存列表与敏感文件排除；更新计划勾选状态。按 verification-before-completion 确认结果，执行最终代码审查后交付代码、版本、已通过测试与限制。

## 计划自检

设计覆盖：安装与实际连接由任务 2/3 承担；统一收集、状态隔离、确认及幂等由任务 4 承担；结构化错误与动作由任务 1/5 承担；协议兼容、安装分发、文档和窄侧栏验证由任务 6 收口。五项 Review Focus 均有测试归属。新接口已在所属任务定义，后续任务使用同名字段。无需要用户补充的产品选项。

## 执行建议

推荐当前会话顺序实施：六项共用 background、host 和页面消息协议，顺序实施方便保持接口一致；结束时做独立整体验证与代码审查。计划待用户审阅及选择执行方式后开始实现。
