# 自定义配置、多模型选择与紧凑布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以标签组织自定义接口配置，在每份配置内用下拉选择当前模型，保留密钥、默认选择和有效测试记录，并提高页面信息密度。

**Architecture:** 将单模型 profile 升级为有模型清单的配置，保留 profileId、model、lastTest 的公共兼容投影。纯数据验证与升级独立为模块，PowerShell 负责 DPAPI、文件原子替换和配置锁；浏览器只接收白名单字段。

**Tech Stack:** Chrome Manifest V3、原生 JavaScript/CSS、Node.js 24、Windows PowerShell 5.1、DPAPI、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-09-model-config-groups-design.md`，用户已确认。

## Global Constraints

- 配置最多 200 份，每份最多 200 个模型；标签沿用最多 10 个、每个 24 字。
- 模型 ID 只要求在本配置内唯一。
- 不能解密或条件不一致时保持独立，并在升级结果中提示，不能丢弃或覆盖条目。
- 迁移不调用模型生成接口，不自动重新测试或改变用户默认选择。
- 请求已发出后继续使用它认领时的模型快照，不中途切换或自动重发。
- 获取失败不更改已保存清单。
- 桌面主列表一份配置一行，目标常规行高 48–56px；名称 16–18px，主要控件和状态 14px，文字行高约 1.35–1.45。
- 320、390、600、1000、1440px 下无横向溢出。
- 不增加聊天、多模型并发调用、自动批量测试或新电脑迁移功能。
- 更新 `showcase/features.json`、`使用说明.md`，用 `native/bin/node.exe tools/build-showcase.cjs` 生成介绍，用 `tools/package.ps1 -PublicRelease` 打包。
- 不提交 work、outputs、运行 JSON、密钥、Cookie 或引擎文件；PowerShell 文件保留 UTF-8 BOM 和 5.1 兼容语法。

## Review Focus

1. 同地址、不同实际密钥或不同协议不能被合并（Task 1、2）。
2. 导入源换密钥只影响部分旧模型时，不得静默修改整组凭证（Task 3）。
3. 测试进行中切换模型、编辑配置或关闭弹窗，旧结果不得被挂到新模型（Task 2、5）。
4. 搜索命中非当前模型或同配置多标签重复显示，不得隐式切换、重复计数（Task 5）。
5. 畸形模型清单、特殊模型 ID 和重定向，不能导致 DOM 注入、对象原型污染或凭证外传（Task 1、4、5）。

## 文件职责与契约

- 新建 `native/ai-config-model.cjs`：schema 3 验证、旧数据归组、公共投影和单配置纯数据更新。
- 新建 `native/ai-model-discovery.cjs`：只读模型清单 HTTP 请求、协议头、超时/大小约束。
- 修改 `native/ai-model-registry.cjs` 为兼容入口；`ai-provider.cjs` 保留请求构造和协议验证；`ai-config.ps1` 管理加密及并发；`ai-model-import.cjs` / `.ps1` 管理来源映射和预览；`ai-runner.cjs` 只做操作分派。
- 新建 `extension/library-ai-view.js`：标签分组、排序、过滤的无副作用函数，浏览器与 Node 测试均可加载。
- 修改 `extension/library-ai-settings.js`、`library.html`、`library.css`：列表和编辑交互；`app.css`、`interface.css`、`collect.css`、`download.css`：侧栏间距，仅调整实际造成空白的规则。
- 修改 `extension/background.js`、`native/host.ps1`、`native/ai.ps1`：能力检查、动作路由及摘要快照。
- 修改 `native/install.ps1`：加入新 native 模块；版本拟定 1.29.0，连同 manifest、host、backup 默认版本同步。

数据类型（私有字段只能存在本地程序）：

```js
// ModelEntry: {id:string,label:string,origins:Origin[],locallyEdited:boolean,
//              lastTest?:{connectionRevision:string,ok:boolean,code:string,at:string,elapsedMs:number}}
// Config: {profileId,label,tags,provider,protocol,baseUrl,auth,ciphertext,
//          revision,connectionRevision,model:string,models:ModelEntry[]}
// Settings: {schemaVersion:3,profiles:Record<string,Config>,defaultProfileId,
//            selectionRevision,imports:{completed,ignored},legacySelectionPending,legacySelectionHandled}
// Origin 保留现有 source/sourceId/fingerprint/credentialFingerprint，增加必要的模型映射。
```

配置使用普通 UUID；模型条目用数组与 Map 查找，不以外部模型 ID 给普通对象动态赋属性。当前 model 必须存在于 models。配置 revision 每次写入变化；connectionRevision 仅在凭证/请求连接参数变化时变化；模型测试挂在模型条目下，公共 lastTest 投影到当前配置 revision。

## Task 1：数据契约与纯数据升级

**Files:** 新建 `native/ai-config-model.cjs`、`tests/ai-config-model.cjs`；修改 `native/ai-model-registry.cjs`、`native/ai-provider.cjs`、`native/ai-runner.cjs`。

**Interfaces:** `normalizeConfig(value) -> Config`；`migrateSettings(settings, credentialGroups) -> {settings,aliases,warnings}`；`publicConfig(config) -> object`。credentialGroups 是本地生成的 profileId 到随机分组 ID 的映射；没有映射的条目不得自动归组。aliases 是旧 profileId 到保留 profileId 的映射，仅用于此次升级。

- [ ] 新增纯数据测试，先运行确认缺少模块导致失败。用两个相同地址、不同 credentialGroups 的已导入 profile 验证不合并；相同组但不同标签/协议/本地修改也不能合并；保留默认条目 ID、当前模型和每模型测试。

```js
const assert=require('node:assert/strict');
const {normalizeConfig}=require('../native/ai-config-model.cjs');
const base={profileId:'openai',label:'Demo',tags:['SMEC'],provider:'custom',
 protocol:'chat-completions',baseUrl:'https://example.test/v1',auth:'bearer',
 ciphertext:'',revision:'r',connectionRevision:'c',model:'deepseek-flash',
 models:[{id:'deepseek-flash',label:'Flash'},{id:'deepseek-v4-pro',label:'Pro'}]};
assert.equal(normalizeConfig(base).models.length,2);
assert.throws(()=>normalizeConfig({...base,model:'missing'}),/CONFIG_INVALID/);
assert.throws(()=>normalizeConfig({...base,models:[]}),/CONFIG_INVALID/);
assert.equal(normalizeConfig({...base,model:'__proto__',models:[{id:'__proto__',label:'Safe'}]}).model,'__proto__');
```

- [ ] 实现清单验证：1–200 项，ID 非空、不含控制字符、最长 200；区分大小写去重；显示名最长 200；字段白名单；非数组/重复 ID 报错。复用现有标签/URL/协议校验。
- [ ] 实现 schema 1/2 转换；单条目迁入 models；只使用 credentialGroups 及相同连接字段、标签、无本地编辑条件归组；将重复来源并入 origins；默认项优先保留，无默认时按 profileId 稳定排序。
- [ ] 实现公共投影，从 models 选当前模型，仅返回白名单元信息及有效测试；不允许原样透传 models 中的 origin、密文、额外字段。
- [ ] 运行 `native/bin/node.exe tests/ai-config-model.cjs`、`tests/ai-model-registry.cjs`、`tests/ai-provider.cjs`；更新旧测试对 schema 的断言，同时保留原有数据保护断言；提交本任务。

## Task 2：加密升级、配置保存、模型切换和独立测试

**Files:** 修改 `native/ai-config.ps1`、`native/ai.ps1`、`native/ai-runner.cjs`；新建 `tests/ai-config-multimodel.cjs`；扩展 `tests/ai-config-race.cjs`、`tests/ai-model-config.cjs`。

**Interfaces:** 新动作 `ai-model-select {profileId,model,expectedRevision}` 返回完整公共设置；模型保存沿用 `ai-settings-save` 并新增 models；新 `Select-AiModel(root,message)`；测试结果含 model ID 和 connectionRevision，持久化仍须匹配发起时 revision。

- [ ] 使用现有测试复制 native 文件到 work 隔离目录的模式，写假密钥 DPAPI 测试；先运行得到新动作/多模型字段缺失失败。

```powershell
$saved=Save-AiSettings $PSScriptRoot @{label='Demo';tags=@('个人');provider='custom';protocol='chat-completions';baseUrl='https://example.test/v1';auth='bearer';key='sk-fixture';model='a';models=@(@{id='a';label='A'},@{id='b';label='B'})}
$id=$saved.profileId
$chosen=Set-AiDefault $PSScriptRoot @{profileId=$id;expectedSelectionRevision=$saved.selectionRevision}
$next=Select-AiModel $PSScriptRoot @{profileId=$id;model='b';expectedRevision=$saved.profiles.$id.revision}
if($next.profiles.$id.model -cne 'b' -or $next.selectionRevision -ceq $chosen.selectionRevision){throw 'default selection not invalidated'}
try{Select-AiModel $PSScriptRoot @{profileId=$id;model='a';expectedRevision='stale'};throw 'stale accepted'}catch{if($_.Exception.Message -ne 'CONFIG_CHANGED'){throw}}
```

- [ ] 在配置锁内首次读旧格式时解密可归组的凭证，仅以内存随机组 ID 传给纯升级逻辑；解密失败保留独立条目并返回不含密钥的警告。验证新结果后，先原样写入唯一旧格式快照，再原子替换新设置文件；测试故障注入确保替换失败不损坏旧文件。
- [ ] 实现保存和选择：后端禁止空清单/移除当前项却未选替代；请求连接字段/密钥变化清空所有旧测试；名称、标签、显示名和清单增减保留未受影响条目的结果。非默认选择不改 selectionRevision，默认选择必须改。
- [ ] 正式测试严格绑定 model/revision；编辑草稿测试采用本地加密、10 分钟有效的随机测试回执，绑定规范化连接参数、实际密钥和模型。保存时只接受匹配回执，不相信浏览器传入的成功状态；失败/修改参数不转移结果。
- [ ] 保留摘要的配置锁内认领，新增测试：切换后旧预览不发送；已认领请求保留旧模型；并发改动后迟到的测试不覆盖。升级快照只含原加密内容，不进入资料备份。
- [ ] 运行 `tests/ai-config-multimodel.cjs`、`tests/ai-model-config.cjs`、`tests/ai-config.cjs`、`tests/ai-config-race.cjs`、`tests/ai-native.cjs`。DPAPI 测试用当前用户权限与虚构密钥，不连接真实模型；提交。

## Task 3：按配置导入并保留来源映射

**Files:** 修改 `native/ai-model-import.cjs`、`native/ai-model-import.ps1`、`tests/ai-model-import.cjs`、`tests/ai-import-native.cjs`。

**Interfaces:** 保留 previewId/candidateId 契约；预览新增 targetModelId、affectedModels、connectionChange。来源匹配遍历 models[].origins；应用后返回 schema 3 公共设置。

- [ ] 写导入测试覆盖 2 个同连接模型归入一份配置，重复读取无新增，手动标签保留，删除一个模型后来源抑制，恢复需明确勾选。

```js
// 在现有 ai-import-native 的假 CC-Switch 数据库中增加同凭证第二个模型。
// 拿到公共配置后用唯一 ID 计数，不能再断言每个模型都是一个 profile。
assert.equal(Object.values(imported.profiles).filter(p=>p.tags.includes('SMEC')).length,1);
assert.equal(Object.values(imported.profiles).find(p=>p.tags.includes('SMEC')).models.length,2);
assert.equal(reimported.defaultProfileId,imported.defaultProfileId);
```

- [ ] 实现 import compare 先按来源定位条目，再核对目标配置连接；新来源按实际凭证与连接条件寻找归组目标，不跨手动配置自动归组。
- [ ] 来源换密钥/协议/地址时显示整配置受影响范围。若只更新其中部分模型，将被更新模型拆成新配置，原配置保留其他模型；若默认当前模型被拆出，明确保持它为默认目标；全部模型一致更新才更新整配置连接。应用必须核对预览和源指纹、预期版本，要求显式覆盖选择。
- [ ] 对本地改过标签/显示名/清单的情况保留对应数据；旧单 profile 删除抑制转换为各模型来源抑制。新来源不得自动切换当前模型。
- [ ] 扩展换凭证/部分来源更新测试断言未选模型密文、当前选择不变；原默认模型拆出后默认仍指该模型；预览过期/并发修改保持报错。运行两项导入测试及 Task 1、2 相关测试，提交。

## Task 4：模型发现和后台动作协议

**Files:** 新建 `native/ai-model-discovery.cjs`、`tests/ai-model-discovery.cjs`；修改 `native/ai-runner.cjs`、`native/ai.ps1`、`extension/background.js`、`native/host.ps1`、`tests/ai-background.cjs`。

**Interfaces:** `discoverModels(profile) -> Promise<Array<{id,label}>>`；新动作 `ai-models-discover {draft}`，通过 Resolve-AiDraft 取得密钥，但不要求草稿已有当前模型；复用独立连接字段验证。返回清单不自动保存。

- [ ] 用 loopback 假 HTTP 服务写失败测试；客户端请求只发当前协议认证头，不带正文，不跟随 302。

```js
const http=require('node:http'),assert=require('node:assert/strict');
const {discoverModels}=require('../native/ai-model-discovery.cjs');
const server=http.createServer((req,res)=>{assert.equal(req.url,'/v1/models');assert.equal(req.headers.authorization,'Bearer sk-fixture');res.end(JSON.stringify({data:[{id:'a'},{id:'b'}]}));});
server.listen(0,'127.0.0.1',async()=>{try{const rows=await discoverModels({baseUrl:`http://127.0.0.1:${server.address().port}/v1`,protocol:'chat-completions',auth:'bearer',secret:'sk-fixture'});assert.deepEqual(rows.map(r=>r.id),['a','b']);}finally{server.close()}});
```

- [ ] 实现 GET models：基地址末尾已有 /v1 时追加 /models；OpenAI responses 与 Anthropic 无 /v1 时追加 /v1/models，其他兼容协议追加 /models。Anthropic 使用 anthropic-version 和配置指定认证方式；其他用 Bearer。10 秒总超时、256 KiB 响应、200 条模型上限，超限报错；去重后白名单字符串，禁止控制字符。
- [ ] 覆盖 401/403→AUTH_FAILED、429→RATE_LIMITED、404/405→MODELS_UNAVAILABLE、302→MODELS_UNAVAILABLE、空 data→空列表、无 data/畸形 JSON→RESPONSE_INVALID、超时/过大响应；UI 可手动添加。
- [ ] 后台加 `ai-config-models-v1` 能力检查，新路由只接受现有受信任扩展页面；更新 runner 错误白名单。草稿换地址不能沿用旧密钥，发现接口不可借草稿结果写配置。
- [ ] 运行发现和 background 测试，校验现有请求构造测试，提交。

## Task 5：标签分组、模型下拉与编辑清单

**Files:** 新建 `extension/library-ai-view.js`、`tests/ai-config-view.cjs`、`tests/ai-config-ui.cjs`；修改 `extension/library-ai-settings.js`、`extension/library.html`、现有模型 UI 测试。

**Interfaces:** `buildConfigView(profiles,defaultId,view) -> {groups,uniqueCount}`，groups 为 `{tag,rows}` 数组，row 引用公共 Config，附 matchOtherModel 布尔值；通过 UMD 暴露 `LibraryAiView` 和 module.exports。view 沿用 query/tag/status/sort/defaultFirst，增加 collapsedTags。

- [ ] 编写纯数据测试和 Playwright 假消息测试，先验证新下拉/分组不存在导致失败。覆盖多标签配置显示两处但 uniqueCount 为 1、搜索非当前模型不改选择、跨标签相同模型 ID 不冲突。

```js
// Playwright：使用现有 page.exposeFunction 的 mock storage/runtime 模式。
await page.getByLabel('公司网关：当前启用模型').selectOption('deepseek-v4-pro');
await page.waitForFunction(()=>document.querySelector('#aiDefaultLabel').textContent.includes('deepseek-v4-pro'));
await page.getByLabel('搜索配置、模型或标签').fill('deepseek-flash');
assert.equal(await page.getByLabel('公司网关：当前启用模型').inputValue(),'deepseek-v4-pro');
assert.ok(await page.getByText('匹配其他模型',{exact:true}).isVisible());
```

- [ ] 实现 buildConfigView，以配置名/全模型/标签匹配，状态按当前模型；每标签分组，多标签重复引用，唯一计数。默认组优先与默认行置顶遵从筛选条件；折叠状态存 chrome.storage.local，搜索时临时展开，不覆盖用户折叠偏好。
- [ ] 重写列表渲染为配置名、默认徽标、当前模型 select、测试状态、测试/编辑/更多；下拉保存期间禁用相关控件，失败恢复并可刷新。切换成功更新所有标签下的镜像行和全局默认提示。
- [ ] 编辑器提供连接字段、模型条目增删/名称编辑、当前模型下拉、获取模型与勾选追加区。取消不写配置；删除当前模型时要求先替换；回填现有密钥状态，不显示秘密。DeepSeek 预设补上截图两个 ID，任意自定义配置同样允许添加。
- [ ] 草稿测试/发现的异步响应绑定弹窗 session 和参数快照，关闭或修改后不应用旧结果；保存成功测试回执由 Task 2 后端验证。所有外部字符串用 textContent/new Option，不拼 HTML。
- [ ] 增加测试：旧结果迟到、两个窗口冲突、接口切换密钥隔离、未保存取消、危险 HTML 模型名、发现失败后手动添加、模型保存后重开、默认切换后摘要使用新 model。运行 `tests/ai-config-view.cjs`、`tests/ai-config-ui.cjs`、`tests/ai-model-ui.cjs`、`tests/ai-model-list-ui.cjs`、`tests/ai-usability.cjs`，提交。

## Task 6：信息密度和可访问性

**Files:** 修改 `extension/library.css`、`library.html`、`app.css`、`interface.css`、`collect.css`、`download.css`；扩展 `tests/interface-layout.cjs`、`tests/ai-config-ui.cjs`。

- [ ] 在 1440px 宽、常规配置名和按钮的固定 fixture 上断言行高；在窄屏只验证不溢出和可操作，不强求 56px。

```js
await page.setViewportSize({width:1440,height:950});
const height=await page.locator('.config-row').first().evaluate(e=>e.getBoundingClientRect().height);
assert.ok(height>=48&&height<=56);
for(const width of [320,390,600,1000,1440]){await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
```

- [ ] 设置配置行 grid 同排布局，padding 6px 10px、gap 8px；取消行内 actions/label 的全局 margin，名称 16–18px、状态14px；长名称省略并可查看全名；编辑/更多有键盘可见焦点。窄屏改两行或必要的自然换行，不裁掉操作。
- [ ] 资料库标题/筛选/备份面板采用 8–12px 常规间隔，帮助折叠，空提示使用 hidden。检查侧栏现有规则后压缩表单组空隙；正文/帮助文章行距保持。
- [ ] 用 Playwright 渲染真实页面+虚构模型数据，在 390px 与1440px 截图查看，检查中文长标签、错误状态、默认徽标和键盘展开。运行布局、app、library-ui、library-e2e、backup-ui 测试；提交。

## Task 7：集成、发布与本机验证

**Files:** `native/install.ps1`、`extension/manifest.json`、`native/host.ps1`、`native/library-backup-model.cjs`、`showcase/features.json`、`使用说明.md`、`README.md`、`PRIVACY.md`、`tests/public-install.cjs`、`tests/release-audit.cjs`。

- [ ] 安装脚本列入新 native 模块；版本统一1.29.0。说明书给出「模型管理 → 编辑配置 → 可选模型 → 当前启用模型」路径，以及默认配置切换含义、获取失败手动添加、标签非供应商限制。介绍功能与能力限制同步。
- [ ] 公共安装测试增加旧 schema 2 假配置升级后模型数/密钥/默认/测试记录保留、快照存在且加密、重复安装不再次覆盖快照，新模块均复制。发布审计明确排除运行快照/回执。
- [ ] 运行所有本次新增测试与既有 AI、导入、摘要竞态、资料库/备份/界面回归，记录每项退出码。解析全部 PowerShell 脚本确认 5.1 兼容；失败修复后运行受影响测试。
- [ ] 发起一次独立最终代码审查，提供 spec、plan 和基础提交范围，重点检查归组凭证、迁移原子性、异步测试错挂、源更新影响范围；修复重要问题并回归。
- [ ] 构建介绍并打包，隔离安装再做发布内容审计：

```powershell
native/bin/node.exe tools/build-showcase.cjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/package.ps1 -PublicRelease
$env:PUBLIC_INSTALL_TEST_ROOT='work/public-install-model-configs-1290'
native/bin/node.exe tests/public-install.cjs
native/bin/node.exe tests/release-audit.cjs
```

- [ ] 使用项目现有安装器升级本机程序，保留注册信息及资料目录。调用公共 settings-get 只输出唯一配置数、模型总数、测试成功/失败数及默认是否保留；不打印密钥，不重新调用真实模型测试。若实际归组条件不成立，报告保留独立项的原因，不强行归并。
- [ ] 提交源码、测试和文档，确认工作区状态；最终说明实现结果、验证范围及 `chrome://extensions` 精彩摘录卡片 ⟳ 重新加载、关闭旧资料库再打开的操作。此次不发布 GitHub、不上传配置。

## 计划自检与执行方式

- 覆盖检查：界面/编辑/密度对应 Task 5–6；存储/升级对应 Task 1–2；导入/发现对应 Task 3–4；兼容与发版对应 Task 7。
- 依赖顺序：1 → 2 → 3 → 4 → 5 → 6 → 7。分组与保存接口耦合，不并行修改相同模块。
- 推荐当前会话内由主代理顺序实施，完成后一次独立审查；也可选择逐任务子代理实施与审查。待用户审阅计划并确认执行方式。
