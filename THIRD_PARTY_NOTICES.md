# 第三方依赖

公开的 `windows-x64-setup.zip` 不附带第三方引擎二进制，安装时直接从下列上游下载，并按照 `tools/engines.lock.json` 验证 SHA-256。

| 组件 | 来源及源码 | 许可说明 |
|---|---|---|
| Node.js | https://nodejs.org/ · https://github.com/nodejs/node | MIT 及其 bundled dependency notices |
| yt-dlp | https://github.com/yt-dlp/yt-dlp | 源码 Unlicense；Windows PyInstaller 可执行包包含 GPLv3+ 等第三方代码，适用上游发布说明 |
| aria2 | https://github.com/aria2/aria2 | GPL-2.0-or-later 及上游依赖许可 |
| FFmpeg Windows build | https://github.com/GyanD/codexffmpeg · https://github.com/FFmpeg/FFmpeg | GPL 构建，适用构建包内 LICENSE；构建来源 https://www.gyan.dev/ffmpeg/builds/ |

FFmpeg 构建包内的 LICENSE 和 aria2 构建包内的 COPYING 会随安装复制。完整压缩包可从锁定清单中的 URL 获取。Node.js 许可：https://github.com/nodejs/node/blob/v24.14.0/LICENSE 。yt-dlp 许可及依赖说明：https://github.com/yt-dlp/yt-dlp#license 。

`native/bin/yt-dlp-plugins/jingcai/` 是本项目的小红书图集适配插件，调用 yt-dlp 提供的扩展接口。其他引擎的许可不由本项目 MIT 许可替代。

维护者使用本地全量打包模式时，需自行满足所附引擎及依赖的再分发要求；请勿把含来源未核实二进制的本机调试包作为公开 Release 上传。
