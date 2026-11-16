# daydeck · 我的工作台

> **English** · daydeck is a local-first personal workbench: a daily kanban for today's tasks, multi-project whiteboards with parent-child trees, and an inspiration/material library. No build step, no framework, no cloud — all data stays in plain Markdown/JSON files in a folder you choose, directly readable in Obsidian. Chinese UI. macOS & Windows (desktop Chrome/Edge).

本地优先的个人工作台：**今日待办看板 + 多项目白板 + 灵感素材库**。无构建、无框架、无 CDN、无云端——数据全部是明文 Markdown / JSON，存在你自己选择的文件夹里，Obsidian 可以直接打开阅读。

## 功能一览

| 页面 | 能做什么 |
|---|---|
| **今日白板** | 一天一页纸的状态看板（未开始 / 进行中 / 已完成 / 闪念）；拖拽换列即改状态、期限与到期提醒、月历视图跳转、多选批量删除（可撤回）、速记直达 |
| **项目白板** | 自由画布 + 父子连线拆解树（整理成树 / 折叠子树 / 循环拒绝）；「开发进行中」模板三区域任务清单与今日白板是**同一条记录**，两处实时同步 |
| **全局汇总** | 跨天检索全部卡片：状态 / 优先级筛选、关键词搜索、直接改状态、双击跳回那一天 |
| **灵感素材库** | 分组 + 标签双维度管理；瀑布流卡片；文字素材受限富文本（加粗 / 颜色 / 字号）；链接与图片素材；粘贴截图直接入库 |

其他特性：浏览器缓存与文件夹数据按 id + 时间戳双轨合并；同一浏览器多窗口单编辑保护（Web Locks + 本地租约，后开窗口只读）；PWA 安装为桌面应用，重复启动聚焦原窗口。

## 环境要求

- **桌面版 Chrome 或 Edge**（依赖 File System Access API；Firefox / Safari 不支持）
- **Python 3.9+**（只用来跑一个 30 行的本地静态服务）
- macOS 或 Windows 10/11

## 快速开始

```bash
git clone https://github.com/nearKaFuKa/daydeck.git   # 或下载 zip 解压
cd daydeck
python3 src/workbench-server.py        # Windows: python src\workbench-server.py
```

然后：

1. 打开 <http://127.0.0.1:8765/>（会自动跳到工作台页面）
2. 在电脑上新建一个**空文件夹**（比如 `我的工作台数据`），将来所有数据都存在这里
3. 页面里点「连接存储文件夹」，选择这个文件夹并授权——首次连接会自动创建 `灵感/`、`白板/`、`素材/` 三个子目录
4. **推荐：安装为桌面应用**——Chrome 菜单 →「安装我的工作台」。安装后获得独立窗口、程序坞/任务栏图标、重复启动聚焦原窗口，且文件夹授权长期保留（普通标签页每次打开都要重新授权）

不想装 Python？任何能把本目录以站点根目录伺服在 localhost 的静态服务器都行（服务端无任何动态逻辑）。

## 开机自启（可选）

- **Windows**：把 `scripts/start-windows.bat` 创建快捷方式，放入启动文件夹（`Win+R` → `shell:startup`）；或用任务计划程序注册该脚本
- **macOS**：参考 `scripts/local.workbench.server.example.plist`，替换其中的路径后复制到 `~/Library/LaunchAgents/` 并 `launchctl load`

## 数据都存在哪（重要）

```
你授权的文件夹/
├── 灵感/
│   ├── 2026-11-16.md     # 卡片按天存储：每天一个文件，每卡一节（含 Obsidian 块引用锚点）
│   └── _links.json       # 项目白板的父子连线（[{f:父id, t:子id}]）
├── 白板/
│   └── <项目名>.md        # 每个项目白板一个索引文件
└── 素材/
    ├── mat-<id>.md        # 每条素材一个文件
    ├── _groups.json       # 素材分组名列表
    └── assets/            # 图片等二进制资产
```

- **备份 = 备份这个文件夹**。没有任何隐藏数据库，删掉仓库程序数据也还在
- Obsidian 用户：把这个文件夹（或其父目录）作为 Vault 打开即可阅读；程序写入的都是标准 Markdown + 少量 JSON
- 浏览器 localStorage 只是缓存，与文件夹按 id + 时间戳合并，文件夹是最终事实

## ⚠️ 放进同步盘（iCloud / OneDrive / 坚果云）之前必读

- **单人单设备**：可以放心用，关机前留意同步完成即可
- **多设备或多个人共享同一文件夹**：目前**没有跨设备编辑锁**。卡片天文件是整篇重写的，两台设备同时编辑（或同步延迟窗口内先后编辑）可能互相覆盖或产生冲突副本。请约定「同一时间只有一个窗口在编辑」
- 同一浏览器内的多窗口已有只读保护；跨浏览器、跨设备不设防

## 已知限制（如实说明）

- 仅支持桌面版 Chrome / Edge；Firefox / Safari 无法使用文件夹读写
- 白板撤销历史每会话保留最近 50 步
- Windows 为代码级兼容（快捷键已 ⌘/Ctrl 双支持、服务脚本跨平台），实机验收持续进行中
- 直接用 `file://` 打开 HTML 可以运行，但每次打开都要重新授权文件夹——请用本地服务方式

## 开发与测试

```bash
node --check src/workbench-core.js
node --test tests/workbench-core.test.js tests/workbench-window.test.js tests/workbench-storage.test.js   # 86 项
node -e 'const h=require("fs").readFileSync("工作台.html","utf8");const m=h.match(/<script>([\s\S]*?)<\/script>/);new Function(m[1]);'
```

`tests/*.py` 是 Playwright 浏览器验收脚本（需自备 Chromium，默认不在 CI 里跑）。页面主逻辑内联在 `工作台.html`，纯函数在 `src/workbench-core.js`（Node 可测）。

## 许可证

[MIT](LICENSE)
