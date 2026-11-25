# 手动桌面构建（Windows x64 / Linux x64 AppImage）

本文档说明如何在本地、以及通过 GitHub Actions 手动构建 Bruno 桌面安装包，并记录**相对上游 `usebruno/bruno` 的改动**与**上游更新后的同步/兼容方式**。

- 产物：Windows x64 NSIS 安装包（`.exe`）、Linux x64 AppImage
- 触发方式：仅手动（`workflow_dispatch`），可指定分支/tag/commit
- 设计原则：**不修改任何上游文件**，所有差异放在新增文件里，方便跟上游合并

---

## 1. 新增文件（改动清单）

| 文件 | 作用 |
| --- | --- |
| `.github/workflows/build-desktop-manual.yml` | 手动 GitHub Actions：两个并行 job（Windows / Linux），构建并上传 artifact |
| `scripts/electron-builder-config.manual.js` | 包装上游 `packages/bruno-electron/electron-builder-config.js`：继承全部配置，只把各平台 target 的 `arch` 收窄为 `x64`（默认），可用 `BRUNO_BUILD_ARCH=x64,arm64` 覆盖 |

除以上两个新增文件外，不修改上游任何文件。

---

## 2. 本地构建

### 2.1 前置条件

- Node.js：使用 `.nvmrc` 指定版本（当前 `v24.22.3`）
- Windows：Git Bash（workflow 与本文命令均使用 bash）；打包时要重建原生模块，需要 Visual Studio Build Tools 含 C++ 桌面开发工具集（x64）
- Linux（Fedora GNOME）：Node.js + 常见构建工具（`gcc`/`g++`/`make`/`python3`，用于 N-API 模块重建）；构建 AppImage 不需要 `rpm` 工具
- 网络：国内环境可走 npmmirror（项目 `.npmrc` 已配置 electron 镜像；打包时另可设置
  `ELECTRON_MIRROR`、`ELECTRON_BUILDER_BINARIES_MIRROR`）

### 2.2 安装依赖并构建共享包（一次性）

```bash
npm run setup
```

该脚本会：清理 `node_modules` → `npm i --legacy-peer-deps` → 强制安装平台专属 `@lydell/node-pty` → 构建 9 个共享包（common / requests / converters / filestore / io / sqlite / query / graphql-docs / schema-types）→ 打包 JS sandbox 库。

> 不要跳过这一步：跳过会导致 renderer 报 `Can't resolve '@usebruno/common/utils'`，以及 Electron 主进程报 `JS Sandbox libraries have not been bundled yet`。

### 2.3 构建 renderer 并准备打包目录

```bash
npm run build:web
bash scripts/build-electron.sh
```

说明：`scripts/build-electron.sh` 带目标参数时才执行打包；**不带参数时只做准备工作**（清空 `packages/bruno-electron/web`，把 `packages/bruno-app/dist` 拷进去，修正 `/static` 路径，删除 `.map`）。

### 2.4 打出安装包（使用包装配置，只出 x64）

Windows（Git Bash）：

```bash
cd packages/bruno-electron
npx electron-builder --win --config ../../scripts/electron-builder-config.manual.js
```

Linux（Fedora GNOME）：

```bash
cd packages/bruno-electron
npx electron-builder --linux AppImage --config ../../scripts/electron-builder-config.manual.js
```

产物在 `packages/bruno-electron/out/`：

- `bruno_<version>_x64_win.exe`：NSIS 安装包
- `win-unpacked/Bruno.exe`：免安装目录版，可直接双击运行（CI 会把它压成 `bruno-win-unpacked-x64.zip`）
- `bruno_<version>_x64_linux.AppImage`

`<version>` 取自 `packages/bruno-electron/package.json`（当前为 `2.0.0`；官方发版流水线会先 bump 版本）。

注意事项：

- 安装包**未签名**：Windows 会弹 SmartScreen 提示；AppImage 需要 `chmod +x` 后运行
- 需要 arm64 时：`BRUNO_BUILD_ARCH=x64,arm64`（Windows arm64 需要对应工具集）

---

## 3. 通过 GitHub Actions 构建（推荐）

1. 把这两个新增文件提交并推送到仓库
2. 确保 workflow 文件存在于**默认分支（main）**，否则 Actions 页面不会出现 Run workflow 按钮
3. `Actions → Build Desktop (Manual) → Run workflow`
   - 分支：用 **"Use workflow from"** 下拉选择
   - 也可在 `ref` 输入框填任意分支/tag/commit（留空即用下拉所选分支）
4. 两个 job 并行执行，完成后在 run 页面下载 Artifacts：
   - `bruno-windows-x64`（NSIS `.exe` + `bruno-win-unpacked-x64.zip` 免安装目录版）
   - `bruno-linux-x64-appimage`（`.AppImage`）

每个 job 的步骤：`npm run setup` → `npm run build:web` → 准备 `web/` → `electron-builder` 打包 → 上传产物。

---

## 4. 上游更新后怎么同步 / 兼容

### 4.1 同步方式

- 直接 `git pull` / `git rebase upstream/main`
- 因为本方案**没有修改上游文件**，正常不会产生冲突（只有上游新增了同名文件才会）

### 4.2 依赖的上游契约（每次同步后核对）

| 契约 | 位置 | 如果上游变了 |
| --- | --- | --- |
| 无目标参数时只准备 `web/`，不打包 | `scripts/build-electron.sh` | 把 workflow 的 "Prepare renderer for packaging" 改为等效拷贝（清空 web、`cp dist`、修正 `/static` 路径、删 `.map`），或在新脚本里自备拷贝逻辑 |
| 配置导出 `win/linux/mac`，各含 `target` 数组（元素有 `target`/`arch`） | `packages/bruno-electron/electron-builder-config.js` | 调整 `scripts/electron-builder-config.manual.js` 里的循环字段；上游增删平台/target 会自动跟随 |
| 脚本名 `setup`、`build:web` | 根 `package.json` | 同步修改 workflow |
| Node 版本 | `.nvmrc` | workflow 自动读取，无需改 |
| `electron-builder` 版本与 CLI 参数 | `packages/bruno-electron/package.json` | 若 CLI 参数变化（如 `--config` 行为），调整 workflow 打包命令 |

### 4.3 同步后的验证清单

- 跑一次 workflow，确认两个 job 都成功
- 检查 `packages/bruno-electron/web/` 内容完整（`index.html`、`static/`）
- 检查打包日志：原生模块只重建 x64（`preparing moduleName=... arch=x64`）
- 检查产物命名与 `out/` 路径是否仍匹配 workflow 的上传 glob

---

## 5. 排障（本次本地构建实际遇到）

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `Can't resolve '@usebruno/common/utils'`、`export 'sanitizeName' ... was not found` | 共享包未构建（缺 `dist`） | `npm run setup`（或逐个执行 `build:bruno-*`） |
| Electron 启动报 `JS Sandbox libraries have not been bundled yet` | sandbox 库未打包 | `npm run sandbox:bundle-libraries --workspace=packages/bruno-js`（setup 已包含） |
| `npm run dev` 不自动拉起 Electron | `scripts/dev.js` 端口探测对 rsbuild 彩色输出匹配失败（上游问题，未修改） | `BRUNO_DEV_PORT=3000 npm run dev:electron` 手动启动 |
| 打包时 arm64 原生模块重建失败（如 `MSB8020` 缺 v145 工具集） | 本机工具链缺 arm64/对应 toolset | 本方案只构建 x64（wrapper 已限制 arch）；确需 arm64 时装齐 toolchain |
| electron-builder 下载 Electron/NSIS 很慢 | 网络 | 设置 `ELECTRON_MIRROR`、`ELECTRON_BUILDER_BINARIES_MIRROR`（CI 上默认无需） |

---

## 6. 备注

- 通过本流程构建的安装包不含官方发行版的「同时最多 2 个 workspace」限制——该限制位于官方闭源企业层（OSS 代码无 gating）
- `packages/bruno-electron/out/` 与 `web/` 均在 `.gitignore` 中，构建产物不会污染仓库
