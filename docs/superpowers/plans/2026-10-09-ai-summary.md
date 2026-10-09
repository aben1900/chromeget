# Configurable AI Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in the current session, task-by-task; use test-driven-development and one independent final code review. Preserve the user's inline execution preference.

**Goal:** 用户只填 OpenAI/DeepSeek 的 SK，或选本机 CC-Switch 的 yqn Claude 配置，即可主动生成、审阅、复制及保存单条摘录摘要。

**Architecture:** 本地程序持有加密密钥和 CC-Switch 引用，三种协议分开适配。模型网络调用放在资料库锁之外；生成状态和摘要保存通过现有锁、原文指纹及摘要版本保护。独立 UI 模块接入已有资料详情事件。

**Tech Stack:** Windows PowerShell 5.1、Node.js 24.14（内置 SQLite、HTTP/HTTPS）、Chrome MV3，无新运行时或浏览器权限。

**Spec:** ../specs/2026-10-08-ai-summary-design.md（2026-10-09 用户确认，并追加预填要求）。

## Global Constraints

- 目标版本 1.27.0；迁移、OCR、转写、相似资料关联不做。
- 用户只需填写 SK。OpenAI：基础地址 https://api.openai.com/v1，模型 gpt-4.1-mini，Responses；DeepSeek：https://api.deepseek.com，模型 deepseek-flash，Chat Completions，thinking disabled。
- 两者 stream:false，摘要中文、标准长度，输出上限 4096 tokens、网络超时 45000 ms；OpenAI store:false。不默认传 temperature、top_p 或 reasoning。
- 占位文字 sk-placeholder-replace-me 不是密钥，不保存为可用状态，不联网；高级地址/模型可编辑，但不是必填操作步骤。
- 输入不超过 24000 个 Unicode 字符（以 Array.from(text).length 计）且不超过 98304 UTF-8 字节；输出不超过 16000 个 Unicode 字符。
- 仅有正文的内容/评论/评阅/提示词，一次一条；不抓网页、不静默截断、不自动分块或重试收费调用。
- 全部凭据、请求状态不得进入 Git、用户资料备份及公开包；手动密钥 DPAPI CurrentUser 加密；CC-Switch 只读引用。
- Windows PS1 保留 UTF-8 BOM；沿用当前 codex 分支、本地提交及本地 ZIP，不推送、不发布、不修改真实 Chrome 注册。

## Code Check（已完成）

2026-10-09 代码检查确认：1.26.0 已有资料库与备份，无 AI 设置、模型调用或摘要持久化。library、library-background、library-native、backup-model、backup-native 五项基线套件通过。

- native/library.ps1 当前整次 Node 调用持有 journal Mutex：不可直接把 HTTP 放进现有 library dispatch。
- native/library.cjs 的 load/summary 返回分页资料；不能把每条 16000 字摘要加入 40 项列表，否则可能超过 Native Messaging 单消息限制。
- extension/library.js 的详情变量封闭在 IIFE；需新增明确详情事件，避免 AI 模块读取 DOM 文本来猜当前记录。
- 原有整理更新仅替换 tags/collections/author，其他字段可保留；backup-model 需要对新增 summary 对象补专门验证。
- 已安装 Node 支持 node:sqlite；当前 yqn Claude 使用 HTTPS/Bearer，模型 glm-5.2 与 qwen3.7-max。只读检查没有执行模型请求。

## Review Focus

1. API 等待时另一个窗口保存、恢复备份或删除原文：不能阻塞保存，也不能把旧摘要写回新内容（任务 3/4）。
2. 双击、Native Messaging 超时、进程在发送后退出：不能自动产生第二次收费请求，必须查询原请求状态（任务 3/5）。
3. CC-Switch 或高级地址在预览后改变：不能将旧密钥/个人内容静默发送到新服务（任务 2/3）。
4. 超长 Unicode、纯 reasoning、拒绝回答、截断、畸形/过大响应：不能显示假成功或造成浏览器消息溢出（任务 1/4）。
5. 页面切换、多窗口保存、备份恢复与旧摘要：结果必须绑定原记录，版本冲突必须保留新改动（任务 4/5）。

## 文件职责和公共契约

新增：
- native/ai-provider.cjs：预设、地址/输入校验、请求构造及三协议响应解析。
- native/ai-transport.cjs：HTTP/HTTPS、超时、响应大小限制、状态分类，不自动重试。
- native/ai-ccswitch.cjs：只读 providers 数据、过滤公开字段和内部解析凭据。
- native/ai-config.ps1：设置文件互斥、DPAPI、明文清除、公有设置投影。
- native/ai.ps1：Native Messaging AI 路由和两段锁之间的网络编排。
- native/ai-runner.cjs：受控标准输入 CLI，为 PowerShell 提供 normalize、cc-list、cc-resolve、request；成功只输出所需 JSON，失败只输出安全代码。
- native/library-ai.cjs：锁内记录准备、认领、完成/失败、查询、保存摘要。
- extension/library-ai-settings.js：设置面板，默认值、密钥替换、CC-Switch 选择。
- extension/library-ai.js：摘要详情、预览、生成、核对、编辑保存。
- tests/ai-provider.cjs、ai-config.cjs、ai-generation.cjs、ai-native.cjs、ai-ui.cjs、ai-background.cjs。

类型：

```js
// PublicProfile 不含 secret/ciphertext。manual 槽位固定 openai/deepseek。
// revision 为不透明配置修订标识；CC-Switch revision 包含所用允许字段的摘要，密钥只参与本机指纹。
PublicProfile = { source:'manual'|'ccswitch', provider:'openai'|'deepseek'|'claude',
  profileId:string, label:string, baseUrl:string, model:string,
  auth:'bearer'|'x-api-key', hasKey:boolean, revision:string,
  models?:Array<{id:string,roles:string[]}> };
RuntimeProfile = { ...PublicProfile, secret:string }; // 仅本机内存/受控 stdin
Summary = { text:string, provider:string, model:string, generatedAt:string,
  sourceHash:string, revision:string, generationId:string, edited:boolean };
RequestState = { id:string, recordId:string, profileId:string, profileRevision:string,
  model:string, providerLabel:string, generatedAt?:string,
  length:'short'|'standard'|'detailed', sourceHash:string,
  expectedSummaryRevision:null|string, directoryHash:string,
  state:'prepared'|'running'|'completed'|'failed'|'unknown',
  createdAt:number, startedAt?:number, executionToken?:string,
  text?:string, errorCode?:string, savedRevision?:string, savedTextHash?:string };
Context = {root:string,directory:string};
```

浏览器允许动作：ai-settings-get/save、ai-ccswitch-list、ai-test、ai-prepare、ai-generate、ai-status、ai-recent、ai-read、ai-save。请求中不接受任意文件路径、prompt、HTTP headers 或请求正文；除保存配置时的 API Key，正文与鉴权均由宿主解析。

内部 library 动作：library-ai-prepare/inspect/claim/finish/fail/status/recent/read/save。它们不进入 background 白名单。root、directory 始终来自宿主配置，不从浏览器接受。

状态文件 root/ai-jobs/<directoryHash>/<requestUUID>.json；仅保存指纹、模型、时间、结果，不保存原始正文或密钥。查询最多最近 10 项摘要元信息，完整生成内容通过单条 status/read 返回。

### Task 1: 固定默认值、协议适配与受限网络

**Files:** Create native/ai-provider.cjs、native/ai-transport.cjs、tests/ai-provider.cjs。

**Interfaces:** `presets() -> {openai,deepseek}`；`normalizeProfile(value) -> PublicProfile`；`validateInput(text)`；`buildRequest(runtimeProfile,text,length,isTest=false) -> {url,headers,body}`；`parseResponse(provider,json) -> string`；`requestSummary(profile,text,length,{isTest=false}={}) -> Promise<{text}>`。依赖注入只在函数测试参数中接受 transport，不从 CLI JSON 接受。

- [ ] 写实际失败测试，再运行 `node tests/ai-provider.cjs`，预期缺少新模块。

```js
const assert=require('node:assert/strict');
const p=require('../native/ai-provider.cjs');
const defaults=p.presets();
assert.equal(defaults.openai.model,'gpt-4.1-mini');
assert.equal(defaults.deepseek.model,'deepseek-flash');
const req=p.buildRequest({...defaults.openai,secret:'sk-fixture-only'},'待概括文字','standard');
assert.equal(req.url,'https://api.openai.com/v1/responses');
assert.equal(req.body.store,false);assert.equal(req.body.max_output_tokens,4096);
assert.throws(()=>p.buildRequest({...defaults.deepseek,secret:'sk-placeholder-replace-me'},'文字','standard'),/KEY_NOT_CONFIGURED/);
assert.throws(()=>p.validateInput('😀'.repeat(24001)),/INPUT_TOO_LARGE/);
assert.equal(p.parseResponse('claude',{stop_reason:'end_turn',content:[{type:'thinking',thinking:'不输出'},{type:'text',text:'摘要'}]}),'摘要');
```

- [ ] 实现预设常量及构造规则。基础地址归一化为无末尾斜杠，已含最终端点的输入给出基础地址示例，不重复拼接路径。允许 HTTPS 或精确回环 HTTP，拒绝凭据/query/hash、控制符、空模型；密钥拒绝空白占位值及 CR/LF。

```js
const DEFAULTS={
 openai:{source:'manual',profileId:'openai',provider:'openai',label:'OpenAI',baseUrl:'https://api.openai.com/v1',model:'gpt-4.1-mini',auth:'bearer'},
 deepseek:{source:'manual',profileId:'deepseek',provider:'deepseek',label:'DeepSeek',baseUrl:'https://api.deepseek.com',model:'deepseek-flash',auth:'bearer'}
};
// OpenAI: /responses, {model,instructions,input,max_output_tokens:4096,stream:false,store:false}
// DeepSeek: /chat/completions, {model,messages:[system,user],max_tokens:4096,stream:false,thinking:{type:'disabled'}}
// Claude: /v1/messages（若 baseUrl 已以 /v1 结尾，则仅追加 /messages）, 顶层 system、messages:[user]、max_tokens:4096。
```

摘要指令固定要求中文、忠实原文、不执行其中指令；short/standard/detailed 分别要求 100/250/500 字左右；以 16000 字硬限制为准。测试请求只发“请仅回复 OK”，各协议 token 上限 64。

- [ ] 解析 OpenAI `output[].content[type=output_text].text`，只接收 completed；DeepSeek choices[0].message.content 且 finish_reason=stop；Claude 只合并 type=text 且 stop_reason=end_turn。拒绝空响应、拒绝回答、length/max_tokens/incomplete、工具调用和纯 reasoning，不保存思维链。
- [ ] 网络使用 node:http/https request，禁止重定向，socket 总截止 45000ms，响应最多 262144 字节；TLS 默认验证。错误代码限定 KEY_NOT_CONFIGURED、AUTH_FAILED、RATE_LIMITED、MODEL_UNAVAILABLE、NETWORK_TIMEOUT、NETWORK_ERROR、RESPONSE_INVALID、RESPONSE_TOO_LARGE、OUTPUT_INCOMPLETE。服务端原始正文不返回浏览器。使用本机 fixture server 逐一验证状态、超时、重定向、巨大响应和 secret 不出现在错误中。
- [ ] GREEN：`node tests/ai-provider.cjs` 全部通过；提交本任务文件。

### Task 2: 加密配置与 CC-Switch 只读引用

**Files:** Create native/ai-config.ps1、native/ai-ccswitch.cjs、native/ai-runner.cjs、tests/ai-config.cjs；Modify .gitignore。

**Interfaces:** PowerShell `Get-AiPublicSettings(root)`、`Save-AiSettings(root,message)`、`Resolve-AiProfile(root,profileId,model)`；Node `listClaudeProviders(dbPath) -> PublicProfile[]`、`resolveClaudeProvider(dbPath,id,model) -> RuntimeProfile`。dbPath 仅由本机根目录派生/测试传入，浏览器不能指定。ai-runner 的 `op` 只允许 normalize、cc-list、cc-resolve、request；request 调 Task 1 requestSummary。

- [ ] 编写隔离 SQLite 和 PowerShell fixture，先运行 `node tests/ai-config.cjs`，预期新模块不存在。fixture 使用标准库 DatabaseSync 创建 providers 表及 yqn Claude 行，只放 sk-fixture-only 假密钥。

```js
const {DatabaseSync}=require('node:sqlite'),assert=require('node:assert/strict');
const db=new DatabaseSync(dbPath); // dbPath 为测试 work 下临时绝对路径
 db.exec('CREATE TABLE providers (id TEXT, app_type TEXT, name TEXT, settings_config TEXT)');
 db.prepare('INSERT INTO providers VALUES (?,?,?,?)').run('fixture','claude','yqn Claude',JSON.stringify({env:{ANTHROPIC_BASE_URL:'https://example.test',ANTHROPIC_AUTH_TOKEN:'sk-fixture-only',ANTHROPIC_MODEL:'glm-5.2',ANTHROPIC_DEFAULT_SONNET_MODEL:'qwen3.7-max'}}));db.close();
const {listClaudeProviders,resolveClaudeProvider}=require('../native/ai-ccswitch.cjs');
const list=listClaudeProviders(dbPath);assert.equal(list[0].model,'glm-5.2');
assert.ok(!JSON.stringify(list).includes('sk-fixture-only'));
assert.equal(resolveClaudeProvider(dbPath,'fixture','qwen3.7-max').auth,'bearer');
```

- [ ] 设置文件 root/ai-settings.json 使用 schemaVersion=1、manual 槽位 openai/deepseek 和选中的 ccswitch 引用；缺失文件时返回 Task 1 完整预设。写入独立命名 Mutex 下原子替换，不同时持有 journal Mutex。读取中损坏、DPAPI 解密失败明确报配置错误，不覆盖原配置。

```powershell
Add-Type -AssemblyName System.Security
$bytes=[Text.Encoding]::UTF8.GetBytes($key)
try {
  $cipher=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $encoded=[Convert]::ToBase64String($cipher)
} finally {[Array]::Clear($bytes,0,$bytes.Length)}
```

DPAPI 解密仅用于主动请求，通过 stdin 给 runner，不放命令行、stdout 公有设置或日志。保存时 Key 省略表示保留现有、clearKey=true 表示清除；协议/基础地址变化且未同时提供新 Key 时清除旧 Key。同一 provider 模型变化可保留凭据；revision 每次实际修改换 UUID。

- [ ] CC-Switch 只查询 app_type=claude 的允许字段；list 只返回公开信息、去重模型候选、hasKey 与 revision，内部 resolve 才返回 secret。数据库 readOnly:true，无 fallback 到写模式。路径存在且拒绝链接逃逸；缺失/忙/版本不兼容时安全报错。外部 profile ID 必须精确匹配返回记录，不能拼入 SQL。配置修订基于选中允许字段哈希（包括鉴权变化），不读日志或其他表。模型可在高级设置自填；默认候选已填好。
- [ ] Tests：完整预设仅缺 Key，DPAPI 落盘不含假 Key，清空/替换/地址变化、并发保存、DB 字节不变、不同类型同名配置不混用、错误不泄露。`.gitignore` 排除 native/ai-jobs/ 与备份数据目录内 AI 状态；root native/*.json 已排除但审计仍须显式检查 ai-settings.json。
- [ ] GREEN：`node tests/ai-config.cjs` 与 `node tests/ai-provider.cjs` 通过后提交。

### Task 3: 无锁网络编排与幂等生成

**Files:** Create native/ai.ps1、native/library-ai.cjs、tests/ai-generation.cjs、tests/ai-native.cjs；Modify native/host.ps1、native/library.cjs、native/library.ps1（仅需要的 helper 兼容改动）。

**Interfaces:** `Invoke-AiAction(message,directory)`；`Invoke-AiNode(payload)` 调 ai-runner.cjs，UTF-8 stdin/stdout，限时 55000ms；library-ai `dispatch(message,ctx,records,index)` 在既有两层锁内调用。内部 dispatch 不执行网络。

浏览器协议：

```js
{action:'ai-prepare',id:'clip:<uuid>',profileId:'openai',model:'gpt-4.1-mini',length:'standard'}
// -> {ok:true,requestId,recordId,characters,bytes,profile:PublicProfile,expiresAt}
{action:'ai-generate',requestId,confirmed:true}
// -> {ok:true,requestId,state,text?}，不把正文/密钥接收自浏览器
{action:'ai-status',requestId} // 返回单条状态
{action:'ai-recent'} // 最近10条元信息，无完整摘要
```

- [ ] 先写测试：在 fixture HTTP 请求尚未完成时并发 native save 必须完成；同 requestId 两次调用服务计数为 1；config/原文改变时计数为 0。运行两项测试，预期 AI action 不支持。

```js
// nativeCall 封装真实 framing 调用隔离 host.ps1；fixture server 用手动 release 保持请求未完成。
const prepared=await nativeCall({action:'ai-prepare',id,profileId:'openai',model:'gpt-4.1-mini',length:'standard'});
const first=nativeCall({action:'ai-generate',requestId:prepared.requestId,confirmed:true});
await waitForRequest();
const saved=await nativeCall({action:'save',record:{id:otherId,time:new Date().toISOString(),type:'内容',content:'生成期间保存'}});
assert.equal(saved.ok,true);
const duplicate=await nativeCall({action:'ai-generate',requestId:prepared.requestId,confirmed:true});
assert.equal(duplicate.state,'running');assert.equal(requestCount,1);releaseResponse();await first;
```

- [ ] host.ps1 在 library-* 前增加 ai-* 分支，调用 ai.ps1；原有 library 操作锁范围不扩大。ai-prepare 先解析 PublicProfile，内部 library-ai-prepare 读取整个原文、验证类型与大小、保存 prepared 状态及原文/旧摘要指纹，返回摘要预览元信息（不返回原文）。prepared 有效 15 分钟。
- [ ] ai-generate 流程固定为 inspect → 本机 resolve profile → claim → HTTP → finish。inspect 只取绑定配置引用；claim 在共享锁内比较 directoryHash、sourceHash、profileRevision、有效期和未认领状态，生成 executionToken，标记 running，返回仅本机使用的正文及 requestId。Mutex/pipe 释放后再 Invoke-AiNode(request)。finish 用 executionToken 核验状态，持锁落盘结果，原文不写入 request JSON。

```powershell
# 各 Invoke-LibraryAction 自己取得/释放 journal Mutex；此处不可外层套锁。
$claim=Invoke-LibraryAction $claimMessage $directory
if(-not $claim.ok -or -not $claim.shouldSend){return $claim}
try {$generated=Invoke-AiNode $networkPayload}
catch {$generated=@{ok=$false;code='NETWORK_ERROR'}}
# 固定错误码，完成/失败均通过内部 library 动作，错误正文不落盘。
return (Invoke-LibraryAction $finishMessage $directory)
```

- [ ] 同 ID 若已 running/completed/failed/unknown，返回原状态，绝不重发；同条记录在已有 running 未结束时拒绝其他 ID claim。running 超过 90000ms 而无结果标记 unknown，不自动重发；prepared 超过 15 分钟必须重新准备。用户明确重新生成才产生新 ID。保存失败仍保留生成结果。
- [ ] kill 正在请求的宿主进程，fixture 已收到一次：查询最终 unknown；重复原 ID 不新增请求。模拟 HTTP 完成但 finish 失败，必须报告不确定而非成功。日期、ID、路径、内存大小参数在宿主验证，状态 JSON 读前限制 262144 字节。
- [ ] ai-test 使用固定短提示，不读取记录，不占资料锁；测试前要求 confirmed:true，拒绝假 Key。ai-settings-get/save/list 不发网络。网络不放进 background 的全局 exclusive 保存队列。
- [ ] GREEN：ai-generation、ai-native、library-native、backup-native 全通过，检查 stdout 没有原文/Key，提交。

### Task 4: 摘要保存、并发保护与备份兼容

**Files:** native/library-ai.cjs、native/library-backup-model.cjs、native/library.cjs；tests/ai-generation.cjs、tests/ai-native.cjs、tests/backup-model.cjs。

**Interfaces:** ai-read {id} → {summary|null,stale:boolean}；ai-save {requestId,text,expectedSummaryRevision} → {ok:true,summaryRevision}。内部 library-ai-save 是唯一写 annotation.summary 的入口；文字最大 16000 字，recordId/sourceHash 来自状态，不接受浏览器替换。

- [ ] RED：生成后修改原文、删除记录或先由第二窗口保存摘要，再保存旧草稿应失败且文件不变。

```js
const before=fs.readFileSync(indexPath,'utf8');
const conflict=await nativeCall({action:'ai-save',requestId,text:'旧草稿',expectedSummaryRevision:oldRevision});
assert.equal(conflict.ok,false);assert.equal(fs.readFileSync(indexPath,'utf8'),before);
```

- [ ] 保存要求状态 completed、当前原文哈希匹配、当前 summary.revision 等于 expectedSummaryRevision（初次为 null）；提交字段为 text、provider 显示名、model、generatedAt、sourceHash、revision 新 UUID、edited。保留现有标签/集合/作者和所有其他 annotation 字段，原始 journal 字节不变。
- [ ] 保存先写 annotation.summary，再写状态回执。如果中断在两者之间，summary 增加 generationId 以识别已提交请求，重试时恢复回执，不产生不同摘要版本。同一请求已保存且文本哈希相同返回原结果；改动文本再次提交已消费请求需提示重新打开摘要/重新生成，不能覆盖后来版本。
- [ ] ai-read 返回当前 summary 及 sourceHash 是否过期；record 不存在直接报已删除。library-query 只提供 hasSummary 标志（可选），不返回文本；完整摘要仅 ai-read/status 返回。40 条最大摘要时 library-query 消息仍低于 1 MiB，使用多字节 fixture 验证。
- [ ] backup-model 校验 summary：纯对象、text 非空且 ≤16000 Unicode 字符，provider/model 字符串≤200、ISO 日期、sha256 sourceHash、UUID revision/generationId、boolean edited。历史 annotation 无 summary 正常；备份往返、摘要冲突保留当前、恢复后 stale 提示都有测试。不得通过一般 library-update 接收 arbitrary summary。
- [ ] GREEN：ai-generation、ai-native、backup-model、backup-flow、backup-native 全通过并提交。

### Task 5: 配置与摘要界面、可信后台路由

**Files:** Create extension/library-ai-settings.js、extension/library-ai.js、tests/ai-ui.cjs、tests/ai-background.cjs；Modify extension/library.html、library.css、library.js、background.js。

**Interfaces:** settings 模块发 `ai-profile-changed`（无 Key）；library.js 发 `library-detail` CustomEvent({detail:{id,type}})，关闭详情/切换加载前发 {id:null}；恢复完成也置空。AI 模块独立调用明确 ai-* 白名单，保存后发 `library-summary-saved` {id}。

- [ ] RED Playwright：首次选择 OpenAI/DeepSeek，地址和模型已经填写，唯一需填写的框为 Key；输入 placeholder 后不能测试/生成。切换服务商不把未保存 Key 带到另一服务。记录切换后旧结果不进入新详情。

```js
await page.selectOption('#aiProvider','openai');
assert.equal(await page.locator('#aiBaseUrl').inputValue(),'https://api.openai.com/v1');
assert.equal(await page.locator('#aiModel').inputValue(),'gpt-4.1-mini');
assert.equal(await page.locator('#aiKey').getAttribute('placeholder'),'sk-placeholder-replace-me');
await page.selectOption('#aiProvider','deepseek');
assert.equal(await page.locator('#aiModel').inputValue(),'deepseek-flash');
assert.equal(await page.locator('#aiKey').inputValue(),'');
```

- [ ] 设置入口置于资料库标题下方，服务选择和 Key 默认可见；地址/模型折叠进高级设置但已预填。提供保存配置、清除密钥、测试连接、读取 CC-Switch 四个清晰操作。CC-Switch 返回候选后 yqn Claude 可选，默认模型自动填；不加载/显示 Key。保存后立即清空输入框，仅显示“已设置”。
- [ ] 详情加入“智能摘要”，选择长度，ai-prepare 显示实际域名/模型/完整字符数，点击“生成摘要”发送 ai-generate confirmed:true。每次准备、切换、生成均有 epoch，防止旧响应使旧按钮重新可点。
- [ ] 显示生成中、失败、结果未知状态；双击防重入，超时显示“核对结果”，按原 requestId 查询；不自动重新生成。chrome.storage.local 仅存 pending requestId，不存 Key/原文。重新打开页读取最近状态，恢复已完成草稿。
- [ ] 摘要 textarea 编辑、复制、保存；明确“AI 生成，请核对”，只用 textContent/value；旧摘要替换发生在保存按钮之后。保存时使用准备时 expectedSummaryRevision，冲突时保留草稿并提示重新读取。
- [ ] background 精确校验 sender.id、扩展 library.html URL（允许自身 query 参数）、frameId 为顶层（有值时必须 0）；capability ai-summary-v1。只允许外部 ai-*；内部 library-ai-*、非库页、网页发送者均拒绝。ai-prepare/generate 不接受自定义正文，native 再次校验。
- [ ] Tests：默认预填、旧宿主、配置变动、CC 模型选择、点击测试前不联网、中文/HTML、安全错误、超时重开、保存冲突、320/390/600/1440 宽度及键盘；真实隔离 native+本机 fixture HTTP 串联生成保存与备份。GREEN 后提交。

### Task 6: 安装清单、文档、版本与最终验证

**Files:** native/install.ps1、portable.ps1、host.ps1、diagnostics.ps1、extension/manifest.json、tools/package.ps1、tests/public-install.cjs、tests/release-audit.cjs、README.md、PRIVACY.md、使用说明.md、showcase/features.json；更新所有使用 host/library 的隔离测试复制列表。

- [ ] 扩充安装文件清单：ai-provider.cjs、ai-transport.cjs、ai-ccswitch.cjs、ai-runner.cjs、ai-config.ps1、ai.ps1、library-ai.cjs。安装保留 ai-settings.json，打包拒绝 ai-settings.json 和 ai-jobs/。源码及 ZIP 审计覆盖新运行数据和测试用假 Key 之外的意外凭据。
- [ ] 版本统一升为 1.27.0，新增 ai-summary-v1 capability。更新说明为“OpenAI/DeepSeek 已预填，仅填 SK；CC-Switch 只读复用配置”；明确真实资料发送到用户选中的远端、使用 API 额度、备份不含 Key、摘要不替代原文。
- [ ] 新增 6 项 AI 套件全部通过，然后复跑 library/backup/collect/connection/app/recovery/interface-layout/showcase/native-diagnostics 及 tasks、queue、transfer-recovery；全部 PS1 用 powershell.exe 5.1 解析。
- [ ] 使用 native/bin/node.exe tools/build-showcase.cjs；tools/package.ps1 -PublicRelease；新临时目录 SkipRegistration 安装测试，验证预填接口、假 Key 拒绝、DPAPI 假 Key 升级保留、摘要/备份调用，并审计 ZIP。不得读取真实 Key 来跑线上收费测试。
- [ ] 按 requesting-code-review 独立审查三协议、凭据边界、锁、并发/重复计费、备份兼容。重要问题补 RED→GREEN 并跑全回归。精确暂存本地提交；报告测试证据、真实模型未调用和仍需用户填 Key 的状态。

## 自检结论与执行方式

六项任务覆盖设计全部验收；Task 1 预设/请求为 Task 2、3 所用，Task 2 RuntimeProfile 仅经 stdin 到 Task 1；Task 3 完成草稿供 Task 4 保存、Task 5 展示，Task 6 分发所有依赖。Review Focus 已分配对应测试。

沿用当前会话由主代理实施、最后独立审查。用户已确认功能设计与执行方向；本计划是本次新形成的执行细节，按 writing-plans 要求交用户审阅后进入产品代码实施。实施中不再逐任务询问是否继续。
