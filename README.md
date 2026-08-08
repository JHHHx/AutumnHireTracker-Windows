# 秋招进度台 Windows 版

Windows 桌面版秋招投递与面试记录工具。界面、字段、阶段配色和网页看板与 macOS 版保持一致，但使用普通桌面窗口运行。

## 普通用户直接使用

前往 [Releases 下载最新版 Windows x64 便携版](https://github.com/JHHHx/AutumnHireTracker-Windows/releases/latest)，下载其中的：

```text
AutumnHireTracker-Windows-x64-v版本号.zip
```

解压完整文件夹后，双击其中的 `秋招进度台.exe` 即可运行。不需要安装 Node.js 或 Python，也不要只复制单独的 `.exe`。

## 更新且保留已有数据

退出旧版后，下载新版 ZIP，解压到新文件夹（或替换旧程序文件夹）并运行即可。你已经记录的数据会自动保留：它们存放在 Windows 用户目录，而不是程序文件夹中：

```text
%APPDATA%\AutumnHireTracker-Windows\autumn_hire.db
```

因此不要删除这个数据库文件；更新应用、换一个解压目录，甚至删除旧的程序文件夹，都不会影响已有投递记录。

> GitHub 首页的“Code → Download ZIP”下载的是源码，不是可直接运行的软件。普通用户请从 Releases 下载便携版。

## 使用方式

双击 `秋招进度台.exe` 后，会直接打开快速录入窗口：

- 应用会正常显示在 Windows 任务栏中，不创建系统托盘图标。
- 可以最小化、移动或调整窗口大小。
- 关闭窗口即退出应用和本地服务，不会继续在后台运行。
- 点击窗口中的“完整看板”，使用默认浏览器打开网页看板。

同公司、同部门的新阶段会追加在同一行；同公司的不同部门会新建一行。新阶段默认进入待确认区，标记通过后显示绿色，标记未通过后显示红色。测评、笔试、面试和 Offer 保留各自的阶段配色。

标记“通过”或“未通过”成功后，该事项会立刻从待确认区移除，并在完整看板保留结果记录。

误填时可以直接修正：

- 待确认区域点击“撤销记录”可删除刚提交的阶段。
- 完整看板中点击阶段卡片右上角的 `···`，可修改记录、恢复待确认或删除。
- 删除某条公司主线的最后一个阶段后，空的公司/部门行会自动清理。

## 数据位置

所有数据只保存在 Windows 本机：

```text
%APPDATA%\AutumnHireTracker-Windows\autumn_hire.db
```

这是标准 SQLite 数据库。更新或重新安装应用不会覆盖它。

## 从源码运行

如果需要修改代码或参与开发，请先安装 Node.js 22：

```powershell
npm ci
npm start
```

## 在 Windows 上构建 x64 便携版

请在 Windows 10/11 的 PowerShell 中执行，不要在 macOS 上交叉打包：

```powershell
npm ci
npm test
npm run package:win
```

构建结果位于：

```text
dist\秋招进度台-win32-x64\
```

打开目录中的 `秋招进度台.exe` 即可运行。整个目录需要一起保留，不要只复制单独的 `.exe`。

## 技术结构

```text
src/main.js       Electron Windows 桌面窗口
src/server.js     仅监听 127.0.0.1 的本地 HTTP 服务
src/database.js   SQLite 数据与业务规则
web/              快速录入和完整网页看板
tests/            数据与 API 自动化测试
```

应用不依赖 Python，也不依赖系统 WebView。开发依赖不会被提交到 Git 仓库。

每次推送到 `main`，GitHub Actions 都会在真正的 Windows 环境中测试并打包；推送 `v*` 标签时，还会自动创建带便携版压缩包的 GitHub Release。
