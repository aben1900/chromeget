# Project release workflow

- Maintain the product introduction with every feature or behavior change: update `showcase/features.json` to reflect implemented capabilities and limits, and add the release notes to `使用说明.md`.
- Run `native/bin/node.exe tools/build-showcase.cjs` after updating documentation or versions. `功能介绍.html` is generated; edit its sources in `showcase/`, not the generated file.
- Use `tools/package.ps1` (or `更新介绍并打包.cmd`) when publishing the local ZIP. It rebuilds the introduction before packaging so a stale introduction is not shipped.
- The local preview server (`tools/showcase-server.cjs`) rebuilds on source changes and refreshes open previews. It only binds to loopback and only serves the introduction and release ZIP.
- Describe this as one Chrome extension with content collection and download features. Never present illustrative download data as actual task telemetry or claim all sites/DRM content work.
- Public GitHub releases must use `tools/package.ps1 -PublicRelease`: publish only `dist/chromeget-v*-windows-x64-setup.zip` and its SHA256SUMS.txt. The older root ZIP is a local development bundle, not a public artifact.
- Never stage `work`, `outputs`, native runtime JSON, cookies, job history or third-party engine binaries. Keep the engine installer locked to explicit URLs and SHA-256 hashes; verify clean installation in a temporary directory with SkipRegistration before release.
