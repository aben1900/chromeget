# 智能摘要 1.27.0 交付记录

2026-10-09，保留本地分支 codex/p0-collection-recovery；未推送、未公开发布、未修改真实 Chrome 注册。

## 已实现

- OpenAI Responses / gpt-4.1-mini、DeepSeek Chat Completions / deepseek-flash 已填写地址、模型、协议与参数；只需填写真实 API Key。占位 SK 不联网。
- CC-Switch Claude 配置只读；主动读取时恢复仍存在的上次提供方和模型选择，不自动读取数据库或跟随当前选择切换。
- 单条文字摘要准备、确认生成、核对状态、复制、编辑保存；不改原文。中文长度三档，24000 Unicode 字符 / 96 KiB 上限，45 秒网络超时。
- 密钥 DPAPI CurrentUser 加密；地址变化清除旧密钥；原文/凭据不写入请求状态。已保存摘要纳入备份，原文和摘要版本变化时拒绝旧结果写回。
- HTTP 不持有资料锁；同一请求不自动重发；并发窗口关联实际运行请求。最近状态支持按资料查找，未保存结果不会被新预览挤掉。

## 验证证据

- 41 项 Node 回归套件通过：AI provider/generation/background/ui/ui-recovery；library、backup、collect、connection、app、test、recovery、布局、showcase、诊断及下载界面相关套件。具体套件列表可由 tests/ 对应文件复现。
- ai-config 与 ai-native 另在正常用户环境通过：隔离假密钥 DPAPI、SQLite 只读、真实 Native Messaging、并发收藏、摘要保存，以及终止测试宿主后原请求变为 unknown 且不重复发送。沙箱缺少 DPAPI 用户配置，未用明文降级。
- tests/tasks.ps1、tests/queue.ps1、tests/transfer-recovery.ps1 通过；native/tools/tests 的 38 个 PS1 在 Windows PowerShell 5.1 解析通过。
- UI 在 320/390/600/1440 宽度没有横向溢出；纯文本摘要、不主动发送、保存与恢复行为通过 Playwright。
- tools/package.ps1 -PublicRelease 生成 ZIP；首次隔离安装下载并校验锁定引擎，5 个引擎均可运行。最终包覆盖安装再次通过，确认 DPAPI 配置升级保留、坏引擎拒绝和多个测试扩展 ID 保留。SkipRegistration 未改变真实注册。
- 公开包和 Git 文件审计无运行状态、真实密钥、第三方引擎二进制、个人输出目录；生成的功能介绍与 1.27.0 同步。

## 独立审查

审查范围 c0cf76b..4e5f0d0；无 Critical，3 个 Important，均在一次修复中完成：

1. 并发生成后核对错误请求：原生 claim 返回实际 running 请求，ai-generation 先失败再通过；UI 恢复测试确认查询 active-request。
2. 旧结果被全局最近 10 项挤掉：按记录查询有效状态并读取持久化 pending 作为后备；ai-ui-recovery 先失败再通过。
3. CC-Switch 重读丢失提供方/模型：显式读取恢复保存选择，ai-ui-recovery 先失败再通过。

无暂缓 Minor。修复后完整 43 项 Node 套件通过；补充两个窗口保存旧草稿会冲突且索引不变的验证。没有进行第二轮审查。

## 实施裁定与影响

- Git Bash 技能辅助脚本无法解析 dirname，使用 Node 保留等价 brief/ledger；代价是手工记录进度，验证仍运行真实命令。
- Invoke-AiNode 放在 ai-config.ps1 供配置与请求共用；代价是共享加载顺序，接口和功能不变。
- 摘要保存与请求状态一起实现以运行真实端到端测试；代价是任务 3/4 的提交边界合并。
- 真实服务调用可用性未验证，遵守不使用真实凭据收费的范围；需要用户填写 SK 后主动测试。
- 审查员没有重复安装包测试，由主代理实际执行并确认；代价是安装测试没有第二人独立重跑。
- CC-Switch 保持主动读取；代价是每次新页面多一次点击。OCR、转写和迁移按既定范围不做。

## 使用入口

侧栏 → 资料库 → 智能摘要设置。填写 SK / 读取 CC-Switch 并保存选择；打开文字摘录详情 → 准备摘要 → 核对服务、模型与字数 → 生成摘要 → 保存或复制。

更新时运行“开始使用.cmd → 更新 / 修复”，在 chrome://extensions 的精彩摘录卡片点击圆形箭头 ⟳，再打开侧栏“重新检测”。已有资料库标签页需要关闭后重开。
