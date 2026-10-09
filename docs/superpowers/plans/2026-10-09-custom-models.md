# Unified Custom Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 AI 设置改为统一模型列表，导入本机 WorkBuddy/CC-Switch 模型，支持草稿测试、加密保存与默认模型，并实际验证导入模型。

**Architecture:** Node 负责协议、来源解析和导入比较，PowerShell 负责 DPAPI、互斥和原子配置写入。扩展只显示公开模型信息并调用白名单操作；摘要仍沿用原有准备、确认、生成、恢复与保存流程。

**Tech Stack:** Node 24（项目 native/bin/node.exe）、PowerShell 5.1、Chrome MV3、原生 HTML/CSS/JavaScript、现有 Playwright 测试环境。

**Spec:** `docs/superpowers/specs/2026-10-09-custom-models-design.md`（用户已确认）。

## Global Constraints

- 所有模型都能编辑、测试、删除、设为默认，不在界面上区分个人与公司。
- 支持多个同供应商配置，来源只作为导入去重和配置维护的内部记录。
- 自动导入不调用生成接口。
- 测试只发送简短固定消息，不发送资料库内容。
- 保存不隐式改变默认模型。
- 已删除或失效的默认模型不自动切换到其他服务。
- 修改接口后不能把旧密钥自动发送到新地址，需要用户重新填写密钥。
- 跨电脑资料迁移仍不实施。
- 保留现有摘要去重和未知状态恢复；网络请求不得持有资料库或设置互斥锁。
- Windows PowerShell 文件保留 UTF-8 BOM；密钥不得进入浏览器查询结果、Git、日志或测试报告。
- 每个任务使用有意义的失败测试再实现；不以模拟 UI 测试冒充真实扩展或真实接口验证。
- 在当前已采用的 checkout 内继续，由主代理实施；最终按执行技能安排独立审阅。无需再次选择执行方式。

## Review Focus

1. 两个页面同时编辑同一模型：后写者必须得到 CONFIG_CHANGED，不能覆盖先写者。（任务 2、4）
2. 导入读取损坏文件、超大文件、符号链接或未知字段：拒绝危险输入，保留已有配置，错误中无密钥。（任务 3）
3. 测试期间关闭弹窗或切换模型：迟到结果不得写入另一模型的状态。（任务 4）
4. 改默认后确认先前准备的摘要：旧准备必须失效；已运行请求仍可恢复。（任务 5）
5. 重装或配置升级时源应用不可用：保存过的加密配置和默认模型继续有效。（任务 2、6）

## 文件职责和契约

- `native/ai-provider.cjs`：独立协议字段、预设、请求体和响应解析。
- 新建 `native/ai-model-registry.cjs`：纯配置升级、模型校验、导入差异计算，禁止网络和解密。
- 新建 `native/ai-model-import.cjs`：固定来源文件解析、模型列表查询及别名匹配；完整候选仅在本机进程内使用。
- `native/ai-config.ps1`：schema 2 读写、DPAPI、乐观并发、默认设置。
- `native/ai.ps1`、`native/ai-runner.cjs`：操作编排、草稿测试、公开字段投影。
- `extension/background.js`：新增操作白名单，保留来源/顶层页面校验。
- `extension/library-ai-settings.js`：模型列表、弹窗、导入预览、默认模型状态。
- `extension/library-ai.js`、`native/library-ai.cjs`：默认选择与已准备任务失效。
- `extension/library.html`、`extension/library.css`：语义化模型列表和响应式对话框。

公共 Model 字段：`profileId,label,provider,protocol,baseUrl,model,auth,hasKey,revision,lastTest`。`protocol` 为 `responses|chat-completions|anthropic`；`provider` 为预设提示，不决定通用协议的专属参数。lastTest 为 `{revision,ok,code,at,elapsedMs}`，公开错误只允许已知错误码。

ConfigV2：`{schemaVersion:2,profiles:{[id]:StoredModel},defaultProfileId:null|string,selectionRevision:string,imports:{completed:boolean,ignored:[]}}`。StoredModel 增加 `ciphertext`、`origin:{source,sourceId,fingerprint,locallyEdited}`。不接受客户端提交 ciphertext、origin 或测试成功标志。

AI 操作契约：

```js
// 所有失败返回 {ok:false,code}；所有设置变更返回最新公开设置。
// 公共设置：{ok:true,profiles,defaultProfileId,selectionRevision}
send('ai-settings-get', {legacySelection}); // legacySelection 仅首次升级使用
send('ai-settings-save', {profileId,expectedRevision,label,provider,protocol,baseUrl,model,auth,key});
send('ai-model-delete', {profileId,expectedRevision});
send('ai-default-set', {profileId,expectedSelectionRevision});
send('ai-model-import-preview', {source:'workbuddy'}); // 或 ccswitch
// 预览返回 {ok:true,previewId,items:[{candidateId,label,model,change,conflict}],expiresAt}
send('ai-model-import-apply', {previewId,candidateIds,overwriteIds,restoreIds});
send('ai-test', {profileId,expectedRevision,confirmed:true});
send('ai-test-draft', {draft:{profileId,expectedRevision,label,provider,protocol,baseUrl,model,auth,key},confirmed:true});
```

预览有效期 10 分钟，保存在本机临时内存/受控临时加密状态，不能把候选密钥或任意文件路径交给浏览器。应用时重读来源并核对指纹及当前配置 revision；变化则返回 IMPORT_CHANGED 重新预览。首次自动导入复用同一流水线，只应用无冲突、未忽略项。源读取失败不标记 completed。

### Task 1: 协议解耦和 schema 2 纯模型

**Files:** 修改 `native/ai-provider.cjs`、`native/ai-runner.cjs`；新建 `native/ai-model-registry.cjs`、`tests/ai-model-registry.cjs`；修改 `tests/ai-provider.cjs`。

**Interfaces:** `upgradeSettings(value)` 返回 ConfigV2；`normalizeProfile(value)` 返回 Model；`buildRequest(profile,text,length,isTest)` 保持签名；`parseResponse(protocolOrLegacyProvider,json)` 兼容旧调用。

- [ ] 加入失败断言，覆盖保留密文、空默认、非法 ID/协议、通用 Chat 不携带专属参数：

```js
const {upgradeSettings}=require('../native/ai-model-registry.cjs');
const old={schemaVersion:1,profiles:{openai:{...presets().openai,ciphertext:'fixture-cipher'},deepseek:presets().deepseek}};
const next=upgradeSettings(old);
assert.equal(next.schemaVersion,2);
assert.equal(next.profiles.openai.ciphertext,'fixture-cipher');
assert.equal(next.defaultProfileId,null);
const request=buildRequest({...presets().openai,protocol:'chat-completions',secret:'sk-fixture'},'OK','short',true);
assert.ok(request.url.endsWith('/chat/completions'));
assert.equal(request.body.thinking,undefined);
```

- [ ] 运行 `native/bin/node.exe tests/ai-model-registry.cjs` 和 `native/bin/node.exe tests/ai-provider.cjs`，确认新增断言因缺少行为失败。
- [ ] 实现升级和协议分派：旧 openai→responses、deepseek→chat-completions、claude→anthropic。新模型 ID 使用 UUID；保留旧 openai/deepseek ID。拒绝 `__proto__` 等保留属性名，profiles 最大 200 项、配置文件最大 2 MiB。纯函数不修改传入对象。

```js
const legacyProtocol={openai:'responses',deepseek:'chat-completions',claude:'anthropic'};
const protocol=value.protocol||legacyProtocol[value.provider];
if(!['responses','chat-completions','anthropic'].includes(protocol))throw Error('CONFIG_INVALID');
```

- [ ] 对上述套件跑绿，并检查旧协议测试保留；提交 `feat: add model registry schema and explicit protocols`。

### Task 2: 本机多模型存储、默认模型和草稿测试

**Files:** 修改 `native/ai-config.ps1`、`native/ai.ps1`、`native/ai-runner.cjs`；新建 `tests/ai-model-config.cjs`；修改 `tests/ai-config.cjs`、`tests/ai-native.cjs`。

**Interfaces:** 保留 Get-AiPublicSettings、Save-AiSettings、Resolve-AiProfile；新增 Remove-AiModel、Set-AiDefault、Resolve-AiDraft；实现上文 settings/delete/default/test 操作契约。

- [ ] 用现有测试的临时目录和 PowerShell 子进程模式加入 RED：两个同 provider 模型独立保存；草稿测试不写文件；接口改变不复用密钥；旧密文升级可解密；默认删除清空；revision 冲突拒绝；源文件移走不影响保存配置。

```powershell
$a=Save-AiSettings $PSScriptRoot @{label='A';provider='openai';protocol='responses';baseUrl='https://example.test/v1';model='m';auth='bearer';key='sk-fixture'}
$id=$a.profileId
$before=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'ai-settings.json'))
$draft=Resolve-AiDraft $PSScriptRoot @{profileId=$id;expectedRevision=$a.profiles.$id.revision;model='draft-model'}
if($draft.model -ne 'draft-model'){throw 'draft'}
if([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'ai-settings.json')) -cne $before){throw 'draft persisted'}
```

- [ ] 运行 `native/bin/node.exe tests/ai-model-config.cjs`，确认缺少操作失败。真实用户 DPAPI 测试遇到沙箱用户限制时申请执行权限，测试只使用假密钥。
- [ ] 用现有互斥锁包围读改写，锁内比较 expectedRevision，写入新 revision；网络测试先解析快照、释放锁，再发送，返回后仅在 revision 未变时保存结果。

```powershell
if($message.expectedRevision -cne $old.revision){throw 'CONFIG_CHANGED'}
# Save-AiSettings 返回公开设置并额外返回 profileId，便于 UI 定位新条目。
# Resolve-AiDraft 合并允许字段；地址改变且没有新 key 时抛 KEY_NOT_CONFIGURED。
```

- [ ] 配置首次升级只接受可验证的 legacySelection；不能解析的 cc: 选择在任务 3 导入匹配后再保存，否则保持空默认。default-set 使用 selectionRevision 乐观锁。
- [ ] 运行 config、新 model-config、native 三套件；确认查询响应不含 ciphertext/secret；提交 `feat: persist custom models and default selection securely`。

### Task 3: WorkBuddy 和 CC-Switch 导入

**Files:** 新建 `native/ai-model-import.cjs`、`tests/ai-model-import.cjs`；修改 `native/ai-model-registry.cjs`、`native/ai-ccswitch.cjs`、`native/ai-runner.cjs`、`native/ai-config.ps1`、`native/ai.ps1`。

**Interfaces:** `readWorkBuddy(filePath)`、`readCcSwitch(dbPath)` 返回本机候选；`resolveModelId(localId,availableIds)` 返回 `{model,verified}`；`compareImports(settings,candidates)` 返回差异；外部仅使用固定源类型，不接受浏览器指定路径。

- [ ] 加入脱敏 RED，覆盖 13 项夹具、别名映射、同模型不同密钥不误合并、重复导入、本地修改冲突、删除抑制/显式恢复、来源改变、坏 JSON/超限/链接拒绝：

```js
assert.deepEqual(resolveModelId('custom:smec-glm-5.2',['glm-5.2']),{model:'glm-5.2',verified:true});
assert.equal(resolveModelId('custom:smec-unknown',['glm-5.2']).verified,false);
const changes=compareImports(settingsWithLocallyEditedModel,[changedSourceCandidate]);
assert.equal(changes[0].conflict,true);
assert.equal(JSON.stringify(publicPreview(changes)).includes('sk-fixture'),false);
```

- [ ] 运行 `native/bin/node.exe tests/ai-model-import.cjs` 确认 RED。测试 publicPreview 是导入模块导出的白名单投影函数，完整候选不从 native 消息返回。
- [ ] 按固定路径读取、验证来源 URL 是 `aigateway.smec-cn.com`，HTTPS，最大 2 MiB；查询模型列表复用传输的超时/响应上限/不跟随重定向约束；只能剥除已知 SMEC 前缀，并精确匹配列表。CC 源保留实际 Anthropic 协议。
- [ ] 实现 preview/apply、来源指纹和凭据指纹、DPAPI 副本、忽略标记及首次导入；手动变更置 locallyEdited。加密预览暂存使用随机 ID，10 分钟过期，来源变化拒绝应用。
- [ ] 同时跑 import、registry、config 套件；检查来源文件字节保持不变；提交 `feat: import editable models from WorkBuddy and CC-Switch`。

### Task 4: 统一列表和编辑弹窗

**Files:** 修改 `extension/library.html`、`extension/library.css`、`extension/library-ai-settings.js`、`extension/background.js`；新建 `tests/ai-model-ui.cjs`；修改 `tests/ai-background.cjs`、`tests/ai-usability.cjs`、`tests/ai-ui.cjs`、`tests/ai-ui-recovery.cjs`。

**Interfaces:** 保留 `window.LibraryAi={send,selected,explain}`，selected 返回已保存默认模型或抛 DEFAULT_MODEL_REQUIRED；变更派发 ai-profile-changed。列表使用 `[data-model-id]`，行内按钮有可访问名称；编辑使用原生 dialog。

- [ ] 加入 Playwright RED：两个同供应商模型显示独立；编辑弹窗保存前测试；无密钥回显；测试迟到结果隔离；设默认并刷新保留；删除默认提示；导入冲突不被默认勾选。加入后台全部新 action 的信任页面/iframe 拒绝测试。

```js
await page.getByRole('button',{name:'添加模型',exact:true}).click();
await page.getByLabel('显示名称').fill('我的模型');
await page.getByRole('button',{name:'测试连接',exact:true}).click();
assert.equal(sent.at(-1).action,'ai-test-draft');
assert.equal(sent.some(x=>x.action==='ai-settings-save'),false);
await page.getByRole('button',{name:'取消',exact:true}).click();
```

- [ ] 运行 `tests/ai-model-ui.cjs` 和 `tests/ai-background.cjs`，确认新增场景失败。
- [ ] 替换旧三来源卡片，渲染统一模型列表、默认标记、弹窗、导入面板；每次打开弹窗创建递增 sessionToken，异步结果只有 token 与 revision 同时匹配才更新状态。保存成功清空 SK DOM 字段。

```js
const token=++dialogSession;
const result=await send('ai-test-draft',{draft:readDraft(),confirmed:true});
if(token!==dialogSession||!dialog.open)return;
renderTestResult(result);
```

- [ ] 在 320/390/600/1440 宽度断言无横向溢出，验证 Escape、Tab、错误 live region、关闭焦点恢复；更新旧 UI 测试以验证相同用户能力，不能直接删除旧行为断言。
- [ ] 运行新 UI、background、旧 AI UI/recovery/usability、library-ui；提交 `feat: add unified model manager and edit dialog`。

### Task 5: 默认模型贯通摘要流程

**Files:** 修改 `extension/library-ai.js`、`native/ai.ps1`、`native/library-ai.cjs`；修改 `tests/ai-generation.cjs`、`tests/ai-native.cjs`、`tests/ai-ui-recovery.cjs`。

**Interfaces:** ai-prepare 从当前 defaultProfileId 解析配置；旧客户端提交 profileId/model 时必须与默认一致。准备任务记录 selectionRevision；ai-generate 在 claim 前比较当前 selectionRevision 与 profileRevision。已有 running/completed 请求先返回已存状态，不因默认变化重新发送。

- [ ] RED：准备 A 后切默认 B 拒绝确认；A 已运行后切默认 B 仍能查询和保存 A；无默认显示设置入口；未知请求不重发。

```js
assert.equal(afterDefaultChanged.code,'CONFIG_CHANGED');
assert.equal(recoveredRunningRequest.profileId,originalProfileId);
assert.equal(networkRequestCount,1);
```

- [ ] 运行 generation/native/UI-recovery 确认新增失败。
- [ ] 摘要区始终显示当前默认名称；默认或配置变化失效准备 UI；本机独立校验以覆盖另一个窗口改默认场景。旧 prepared 缺少 selectionRevision 时要求重新准备，旧已运行任务仍可恢复。
- [ ] 上述套件跑绿并检查原文、摘要保存幂等性及备份保留；提交 `feat: use default custom model for intelligent summaries`。

### Task 6: 真实验证、文档和本地发布

**Files:** 新建 `tools/test-ai-models.cjs`（开发者维护工具）、`docs/superpowers/plans/2026-10-09-custom-models-results.md`；修改 `tests/public-install.cjs`、`showcase/features.json`、`使用说明.md`、`PRIVACY.md`、`README.md`、`extension/manifest.json`、`native/host.ps1` 及实际版本常量。

- [ ] 先增加 public-install RED：加密模型、默认选择和导入状态在修复安装后保留；WorkBuddy 缺失不破坏已保存模型。版本按现有 1.27.1 升为 1.28.0，用 `rg -n '1\.27\.1'` 核对所有活跃版本常量，历史发布记录保留。
- [ ] 维护测试工具通过本机白名单 ai-test 调用已保存模型，最多 2 并发、单模型一次、不自动重试；只落盘 `{label,model,ok,code,elapsedMs}`。固定消息“请仅回复 OK”，64 token 上限；不输出响应原文或凭据。使用网关列表成功只记录发现阶段，不计作生成成功。

```js
const result=await callNative({action:'ai-test',profileId:p.profileId,expectedRevision:p.revision,confirmed:true});
report.push({label:p.label,model:p.model,ok:result.ok,code:result.code||'OK',elapsedMs:Date.now()-started});
// callNative 在本工具内实现现有 Native Messaging 长度前缀协议，不接受任意动作。
```

- [ ] 安装或同步本地程序后，从真实模型管理路径完成导入，逐个测试 13 个 SMEC 配置。用户已授权这些小额固定测试，无需再次询问；没有真实 SK 的手动条目标为未配置，不捏造成功。真实 Chrome 无法自动加载扩展时如实记录限制，不以 mocked UI 替代。
- [ ] 更新产品介绍和操作文档，写明模型管理入口、默认选择、保存前测试、导入副本更新规则、失败解释和能力边界；运行 `native/bin/node.exe tools/build-showcase.cjs`。
- [ ] 运行全部相关 AI/library/backup/connection/showcase 测试及 PowerShell 5.1 解析检查；对新失败修复后仅重跑相关检查。不运行真实资料备份/恢复作为测试。
- [ ] 主代理完成实施后按 executing-plans 的规则进行一次独立全局审阅，处理重要问题；结果文件记录已运行命令、真实结果、限制和剩余事项。
- [ ] 用 `tools/package.ps1 -PublicRelease` 生成本地 1.28.0 ZIP 和校验文件，按项目安装测试使用临时目录及 SkipRegistration；执行 release-audit 检查运行时配置、密钥、模型源文件和第三方引擎未混入。只发布本地文件，不自动推送公开 GitHub release。
- [ ] 最终交付注明入口“资料库 → 模型管理”、需要的扩展重新加载操作、默认模型如何选择，以及逐模型实测结果；不自动替用户挑选默认模型。

## 自检与交接

方案覆盖：统一列表/弹窗（任务 4），多配置/默认/加密与升级（任务 1–2），两个来源/去重/编辑保护（任务 3），摘要使用与恢复（任务 5），真实测试/发布与文档（任务 6）。五项 Review Focus 均有所属任务的验证。任务 2 的 save 返回值额外带 profileId，其余响应遵循公共设置契约；导入候选和存储密文不会混入 Model。

本文待用户审阅确认。确认后沿用当前会话主代理实施方式，按任务记录 RED/GREEN 和交付证据，不再重复选择执行方式。
