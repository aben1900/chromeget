# 1.28.0 统一模型管理验收记录

实现任务 1–5 已完成。入口：资料库 → 模型管理。当前注册的本机程序已更新到 1.28.0。

## 实际模型测试

使用已导入加密配置，通过本机程序 ai-test 各发起一次固定短消息；未发送资料库内容、未自动重试、未替用户选择默认模型。

| 模型 | 结果 | 耗时 |
|---|---|---|
| SMEC GLM-5.3 Flash | RATE_LIMITED | 1145 ms |
| SMEC DeepSeek V4 Flash | OK | 2193 ms |
| SMEC Qwen3.7 Plus | OK | 1724 ms |
| SMEC GLM-5.3 | AUTH_FAILED | 789 ms |
| SMEC DeepSeek V4.1 Flash | OK | 1870 ms |
| SMEC GLM-5.2 | OUTPUT_INCOMPLETE | 2028 ms |
| SMEC Qwen3.8 Flash | OK | 2279 ms |
| SMEC DeepSeek V4 Flash Vision | OK | 1560 ms |
| SMEC Qwen3.6 Flash | OK | 1763 ms |
| SMEC GLM-5.1 | OK | 2875 ms |
| SMEC Qwen3.8 Max | OK | 2605 ms |
| SMEC Qwen3.7 Max | OK | 1821 ms |
| SMEC DeepSeek V4 Pro | OK | 2134 ms |

10/13 正常生成。AUTH_FAILED 表示鉴权或权限拒绝；RATE_LIMITED 表示限流或额度限制；OUTPUT_INCOMPLETE 表示本次 64 token 短测试未形成完整文本，不能据此断言接口离线。源配置不会因这些错误删除。

## 验证证据

- 22 个 Node/UI 回归套件通过（work/run-models.cjs）。
- model-config、config、import-native、native 隔离本机测试通过，使用假密钥及临时目录。
- 39 个 PowerShell 文件经 Windows PowerShell 5.1 解析通过。
- 320/390/600/1440 像素宽度与弹窗键盘检查通过。
- UI 测试为浏览器加载页面与模拟消息；真实模型测试走本机程序。尚未自动验证用户现有 Chrome 进程内的扩展消息路由，需重新加载扩展后查看。

## 执行调整

- 沿用已确认的当前分支；Windows 辅助脚本使用 Node 等效任务记录。代价是记录由本会话维护，已保留测试证据。
- 安装器实际采用固定文件列表，已补入三个新增运行模块，防止只更新源码后部署缺文件。

独立审阅无 Critical，发现的三项 Important 已补 RED→GREEN 回归：配置校验与领取请求的原子性、旧 CC 选择迁移、手动编辑项恢复导入。另两项按用户影响提升为 Important 并修复：更新必须携带配置 revision，认证方式参与来源指纹。未留下审阅问题。

安装验证：全新引擎下载在 240 秒超时；改为新临时应用目录复用既有校验引擎及校验记录，安装器重新核对各文件哈希。该调整不证明当前外网引擎下载可用性，引擎锁和下载逻辑未修改。

最终隔离安装验证通过：5 个引擎启动、缺失模块检查、本机消息协议、默认选择及加密配置重装保留、多扩展 ID 保留、损坏引擎拒绝。新临时目录预置已验证 Node/yt-dlp；安装器重新下载并校验 aria2 和 ffmpeg 成功。SkipRegistration 未修改真实注册。发布审计通过，无运行时数据、密钥或第三方引擎二进制混入 ZIP。
