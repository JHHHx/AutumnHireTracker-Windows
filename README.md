# 秋招进度台 Windows 版

Windows 桌面版秋招投递与面试记录工具。界面、字段、阶段配色和网页看板与 macOS 版保持一致，但使用普通桌面窗口运行。

## 使用方式

双击 `秋招进度台.exe` 后，会直接打开快速录入窗口：

- 应用会正常显示在 Windows 任务栏中，不创建系统托盘图标。
- 可以最小化、移动或调整窗口大小。
- 关闭窗口即退出应用和本地服务，不会继续在后台运行。
- 点击窗口中的“完整看板”，使用默认浏览器打开网页看板。

同公司、同部门的新阶段会追加在同一行；同公司的不同部门会新建一行。新阶段默认进入待确认区，标记通过后显示绿色，标记未通过后显示红色。测评、笔试、面试和 Offer 保留各自的阶段配色。

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

需要 Node.js 22 或更高版本：

```powershell
npm install
npm start
```

## 在 Windows 上构建 x64 便携版

请在 Windows 10/11 的 PowerShell 中执行，不要在 macOS 上交叉打包：

```powershell
npm install
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
