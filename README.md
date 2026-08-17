# Nexus Accounting 助手

面向 [Nexus Legacy](https://nexuslegacy.space/) 的非官方社区浏览器游戏助手，支持两个独立服务器：

| 服务器 | ID | 游戏地址 |
|---|---|---|
| 第 0 赛季 | `NX-S0` | [s0.nexuslegacy.space](https://s0.nexuslegacy.space/) |
| 新边疆 | `NX-NF` | [nf.nexuslegacy.space](https://nf.nexuslegacy.space/) |

<img width="1889" height="726" alt="Nexus Accounting 仪表盘" src="https://github.com/user-attachments/assets/62757e1c-d4c6-422d-9889-4ad0144b8801" />

## 安装

- [从 Chrome 应用商店安装 Nexus Accounting 助手](https://chromewebstore.google.com/detail/nexus-accounting-%E5%8A%A9%E6%89%8B/cikikabpimpjecpcofdadcgbihokoofk)
- Chrome Web Store 扩展 ID：`cikikabpimpjecpcofdadcgbihokoofk`

## 主要功能

- 每 15 分钟自动采集游戏 API，也可随时手动刷新。
- 汇总勘测、海盗、采矿、残骸、远征、虫洞、异星遗迹和战斗记录。
- 统计资源收益、舰船损失、重建成本、燃料消耗和净收益。
- 提供按小时、日期、区域和自定义时间范围筛选的图表与表格。
- 支持星系查找、小行星扫描与后台实时搜索通知。
- 提供舰队模板、侦察任务、残骸回收、市场订单和科技树规划。
- 内置战斗模拟器，可导入己方舰队、研究等级和侦察报告。
- 在游戏页面中加入帝国总览、军需官、比例计算器、用户指南及建筑、科技、舰船资源规划器。

## 双服务器支持

仪表盘右上角可在 `NX-S0` 与 `NX-NF` 之间切换。报告、汇总、缓存、模板和偏好设置均按服务器分别保存，互不混用。

扩展会根据当前游戏标签页自动识别服务器。升级前已有的旧版未分区数据会自动归入 `NX-S0`。

## 工作原理与隐私

助手通过所选服务器中已登录的游戏标签页发起同源 API 请求。浏览器会自动附带 HttpOnly 会话 Cookie；助手本身不会读取、保存或转发 Cookie 值，因此无需再次输入账号或密码。同步期间必须保持对应的游戏标签页打开。

所有采集结果都保存在浏览器的 `storage.local` 中，不会上传到其他服务。扩展更新前会自动将本地数据备份到下载目录。

完整说明请参阅[隐私政策](docs/privacy-policy.md)。

## 使用方法

1. 登录 [第 0 赛季](https://s0.nexuslegacy.space/) 或 [新边疆](https://nf.nexuslegacy.space/)，并保持该游戏标签页打开。
2. 点击浏览器工具栏中的“Nexus Accounting 助手”图标打开仪表盘。
3. 确认右上角选择了正确的服务器。
4. 点击“立即采集”，或等待每 15 分钟一次的自动采集。
5. 游戏侧栏的“助手”区域可打开仪表盘、比例计算器、实时搜索、帝国总览和用户指南；顶部的“📦 军需官”用于调度资源与舰船。

## 仪表盘页面

| 页面 | 功能 |
|---|---|
| 全局 | 汇总所有活动的资源、损失、燃料与来源占比 |
| 勘测 / 海盗 / 采矿 | 活动统计、净收益、趋势图和报告明细 |
| 战斗 | 汇总各类战斗、舰队、逐回合详情，并可导出 CSV |
| 残骸 | 统计生成与回收的残骸资源 |
| 远征 / 虫洞 / 异星遗迹 | 收益、损失、任务记录及执行中的舰队 |
| 星系侦察 | 按星球、月球、区域、温度、大小和归属搜索星系 |
| 小行星 | 扫描小行星场、计算采矿舰队并配置后台实时搜索 |
| 舰队模板 | 创建可供多种任务复用的舰队配置 |
| 侦察 | 发起勘测与调查，并回收残骸或战利品 |
| 市场 | 浏览市场及联盟订单并按资源和兑换比例筛选 |
| 科技树 | 查看科技依赖、规划研究队列并估算资源与时间 |

## 本地开发

需要 Node.js 和 Python 3。

```powershell
$ErrorActionPreference = 'Stop'
npm install
npm test
npm run lint
python .\nexus-addon\build.py
```

构建脚本会在仓库根目录生成：

- `nexus-accounting-<版本>.xpi`：Firefox 扩展包。
- `nexus-accounting-<版本>.zip`：Chrome Web Store 扩展包。

临时调试 Firefox 扩展时，可打开 `about:debugging#/runtime/this-firefox`，选择“临时载入附加组件”，然后载入 `nexus-addon/manifest.json`。

## 截图

<img width="1903" height="726" alt="Nexus Accounting 总览" src="https://github.com/user-attachments/assets/9a3fd91c-e3cf-4fec-88e1-0c1b973e693c" />

<img width="1893" height="728" alt="Nexus Accounting 小时视图" src="https://github.com/user-attachments/assets/1658ae94-12c2-42c1-b634-fab23f98bede" />

<img width="1901" height="883" alt="Nexus Accounting 图表" src="https://github.com/user-attachments/assets/723bf0e3-8251-4fe3-bc6b-57f1bb54629f" />

## 说明

界面原型由 Claude Opus 4.8 辅助制作。

## 许可证

[Mozilla 公共许可证 2.0](https://www.mozilla.org/MPL/2.0/)
