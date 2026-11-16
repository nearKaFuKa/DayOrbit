# Contributing to DayOrbit

Thanks for helping improve DayOrbit. The project intentionally stays local-first, dependency-light, and focused on independent developers rather than enterprise project management.

## Before opening a change

- Keep changes small and tied to one problem.
- Preserve the existing Markdown/JSON data format unless a migration and backward-compatibility plan are included.
- Never commit real DayOrbit data folders (`灵感/`, `白板/`, `素材/`), credentials, private paths, or screenshots containing personal projects.
- Reuse the existing HTML/CSS/JavaScript architecture. Framework migrations should be discussed in an issue before implementation.

## Local checks

Run from the repository root:

```bash
node --check src/workbench-core.js
node --check src/workbench-window.js
node --test tests/workbench-core.test.js tests/workbench-window.test.js tests/workbench-storage.test.js
node -e 'const h=require("fs").readFileSync("工作台.html","utf8");const m=h.match(/<script>([\s\S]*?)<\/script>/);if(!m)throw Error("inline script missing");new Function(m[1]);'
```

The Python files under `tests/` are Playwright browser checks. They require Playwright and a Chromium installation and are not part of the default dependency-free test path.

## Pull requests

Describe the user-facing problem, the smallest implemented change, the checks you ran, and any manual testing still needed. UI changes should include screenshots made with synthetic data. Do not claim macOS or Windows behavior that was not tested on that platform.

## 中文说明

欢迎提交小而明确的改进。请保留现有本地优先架构和数据格式，不要提交真实的个人卡片、项目、素材、密钥、私人路径或含隐私的截图。提交 PR 时请写清问题、改动、测试结果和仍需人工验证的部分。
