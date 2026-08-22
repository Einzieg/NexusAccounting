# 更新日志

记录 Nexus Accounting 浏览器助手的重要变更。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [2.0.1] - 2026-08-22

### 新增
- **Nocturne 新版界面**：使用分组侧边栏、粘性顶部控制栏、统一设计变量、卡片、表格和响应式移动导航，旧版顶部标签栏不再保留。
- **内嵌战斗模拟器**：模拟器并入助手主界面，增加舰船图片、逐舰种存活与损失、逐回合伤害/损失以及新版结果和残骸展示。
- **自定义资源权重**：可在设置菜单编辑矿石、硅酸盐、氢、合金、先驱碎片、遗物和其他稀有资源的等值权重，并全局持久化。
- **区域护航模板**：舰队模板可标记哨兵区、开放区、死亡区或裂隙区，并可按每艘采矿舰配置护航比例。

### 修复
- **航行时间估算**：燃料估算请求携带实际任务类型，使用游戏的任务航行公式。
- **实际派出舰队估算**：调查、残骸和战利品回收均按出发星球实际可用舰船计算燃料与时间。
- **Chrome 舰队模板布局**：采用新版输入框密度与溢出保护样式。
- **站点资源整数显示**：站点表格和顶部汇总直接忽略资源的小数部分，避免持续产出导致的冗长小数。

### 保留
- 游戏标签页同源认证通道、中文界面、多服务器隔离、交易分析、联盟站点资源和 Chrome Web Store 自动发布继续使用当前 Fork 的实现。

## [1.8.10] - 2026-08-17

### 新增
- **联盟站点资源视图**：按当前联盟领土枚举站点，集中显示十种资源、基础容量与稀有容量，并支持站点、编号、星系和领土搜索。
- **大联盟读取保护**：站点详情采用受限并发和短时缓存，单个站点失败不会中断整页；支持区域筛选、分页和手动强制刷新。

## [1.8.9] - 2026-08-17

### 修复
- **Chrome 商店自动发布**：提升扩展版本，避免 API v2 重复上传商店中已发布的 1.8.8 包，并完成自动发布流程验证。

## [1.8.8] - 2026-08-15

### 发布准备
- **Chrome 应用商店资料**：补充可直接复制的商品说明、权限理由、隐私申报和审核测试步骤。
- **隐私与许可证**：更新隐私政策以覆盖市场成交、玩家名称及用户主动发起的游戏操作，并将隐私政策和 MPL-2.0 许可证打入发布包。
- **最小权限范围**：将主机访问范围收窄到实际支持的 NX-S0 与 NX-NF 两个游戏域名。
- **发布者信息**：商店版主页改为当前维护 Fork，同时保留原作者署名。
- **商店素材**：新增 Chrome 应用商店宣传图与规范截图目录。

## [1.8.7] - 2026-08-14

### 优化
- **交易对方名称**：交易分析明细移除枢纽路线，改为按买卖方向显示对方玩家名称；玩家资料会按服务器缓存，暂时无法解析时显示玩家 ID。

## [1.8.6] - 2026-08-14

### 优化
- **独立交易分析视图**：将成交历史、估算盈利、手续费、资源净流量和逐笔明细从市场页拆分为顶级“交易分析”视图。
- **按需加载历史**：只在进入“交易分析”时请求成交历史，市场页仅加载当前报价。
- **自动刷新历史**：再次进入“交易分析”时自动同步成交记录，30 秒内避免重复请求；手动刷新始终可立即同步，并显示最近同步时间。

## [1.8.5] - 2026-08-12

### 新增
- **市场成交历史**：读取个人市场历史的全部分页，并按今天、最近 7 天、最近 30 天或全部历史筛选。
- **市场盈利统计**：区分买入和卖出，从收到数量中扣除对应手续费后计算各资源净流量，并用统一资源权重估算矿石等值盈利。
- **逐笔成交明细**：显示成交时间、方向、付出、实际到账、手续费、枢纽路线和单笔矿石等值盈亏。

## [1.8.4] - 2026-08-11

### 修复
- **ZIP 安装后的 API 通道恢复**：当 Chrome 重新加载已解压扩展、已打开的游戏标签页尚未注册消息接收端时，助手会自动注入独立的同源 API 桥接脚本并重试，无需手动刷新游戏页面。

## [1.8.3] - 2026-08-11

### 修复与优化
- **舰队模板舰名汉化**：统一通过中文舰名解析器渲染，并兼容 API 的 `displayName`、嵌套 `definition` 等数据形态。
- **科技树完整汉化**：科技名称、说明、分支和状态均使用中文显示，同时保留中英文搜索能力。
- **科技树布局优化**：采用紧凑中文节点，默认收起空研究队列，新增缩放按钮、自适应宽度及窗口尺寸变化适配，并弱化非焦点连线。
- **更新识别**：升级扩展版本和可见构建号，避免浏览器继续复用旧版 1.8.2 的页面资源。

## [1.8.2] - 2026-08-11

### 新增与变更
- **舰队模板阈值**：模板新增“按伤害阈值撤回护航”，支持 30%、50%、70% 三档按钮选择，保存为 `escortRetreatThreshold`。
- **发起任务透传阈值**：采矿、扫描、调查、残骸回收、战利品回收、远征和异星遗迹任务都会在模板启用阈值时发送该字段。
- **指挥舰编入与自动重试**：舰队模板可请求编入指挥舰；指挥舰被占用时自动改为不编入并重试一次。
- **实时搜索采矿**：游戏侧实时搜索窗口会读取模板中的指挥舰和撤回阈值配置。
- **舰队模板总计与库存**：显示模板舰船总数、所选星球库存、模板需求及账号总库存。
- **模板数量记忆**：派出弹窗可切换模板，并记住各模板上次选择的舰船数量和指挥舰状态。
- **采矿仓储提示**：采矿派出弹窗按货舱扩展和职业加成显示所选采矿舰船的总仓储。
- **小行星带采矿进程**：小行星带页显示当前采矿任务并提供刷新按钮。
- **小行星带搜索**：资源类型进入实际扫描条件；目标结果数默认 5、最大 10，并从当前星系向外查找。
- **小行星带估算**：完善燃料成本和单程航行时间显示；接口失败时使用本地舰船数据兜底。
- **NX-NF 时间倍率**：按新边疆双倍赛季速度显示航行时间。
- **中文信息补全**：补全舰船、战斗模拟、科技树名称和描述的中文显示。

### 修复
- API 鉴权改为通过已登录的游戏标签页发送同源请求，匹配 Nexus Legacy 当前的 HttpOnly Cookie 会话机制，修复旧 `nexus_token` Bearer 头导致的 `/api/planets → 401`。
- 移除不再需要的 Cookie 读取权限；助手不再读取或转发会话 Cookie 值。

## [1.8.1] - 2026-08-06

### 变更
- **完整中文界面**：汉化仪表盘、战斗模拟器、游戏内侧栏、帝国总览、军需官、升级规划器、状态提示、确认框和系统通知。
- **中文项目说明**：重写 README，并汉化扩展名称、描述和最新更新说明。
- 保留 API 字段、存储键、服务器 ID 和游戏协议枚举的原始值，避免影响 NX-S0 与 NX-NF 的兼容性。

## [1.8.0] - 2026-08-06

### Added
- **New Frontier support**: the addon now runs on both Season 0 (`NX-S0`) and
  New Frontier (`NX-NF`), routes API/cookie/game-tab requests to the selected
  universe, and exposes a server selector in the dashboard.
- **Per-server local data**: reports, aggregates, caches and preferences are
  stored separately for each universe. Existing unscoped data is migrated to
  Season 0 automatically.

## [1.7.6] - 2026-07-22

### Fixed
- **Collect-debris under-recording**: debris collection now runs in
  repeating ticks under the same mission id, with cargo growing each
  tick. The addon's commit gate still treated `returnDepartsAt` (set
  from the first tick on) as "cargo is final," so it recorded only the
  first tick's partial haul instead of the full amount. Now gated on
  `raidParams.collectionComplete`, falling back to `status: 'returning'`
  for the older non-ticked mission shape.

## [1.7.5] - 2026-07-21

### Fixed
- **Fuel-estimate throttling**: `gamePost` now gates fuel-estimate calls to
  the endpoint's own rate-limit scope (40/10s, 120/min) instead of relying
  solely on the global budget `apiFetch` tracks.
- **429 retry on `gamePost`**: game actions sent through the game tab (mine,
  survey, investigate, fuel-estimate, etc.) now retry on 429, honouring
  `Retry-After` then falling back to exponential backoff — matching
  `apiFetch`'s existing policy. Previously only GET requests retried.

## [1.7.4] - 2026-07-20

### Added
- **Xeno tab**: automatic ancient-moon ruins surveys — picks the nearest
  unowned Ancient moon not already targeted (reusing Finder's shared scan
  cache) and launches a xeno-survey there. Includes a transit list, a
  "Moons on cooldown" table (48h per moon), and loot/loss graphs wired into
  the Global tab.
- **Expeditions** split out into its own tab: a launch panel with known-
  working fleet/zone/depth presets or a Fleet Template, zone/depth
  constrained to valid ranges, an editable fleet dialog before send, and a
  transit list mirroring Scouting.
- **Wormhole** is now its own tab too; Global's source-share breakdown
  splits Expedition vs. Wormhole gains/losses instead of folding them
  together.
- **Outpost column** on the Asteroids tab: fields with a built outpost now
  show the controlling player and their alliance tag (`player [ALLIANCE]`),
  resolved via the leaderboard search endpoint and cached per player.
- **"Already mining" row highlight**: the Asteroids tab and the live-search
  results panel both turn a field's row green when you already control it
  or have an active mine mission en route, updated optimistically the
  instant a send succeeds instead of waiting on the next missions poll.
- GitHub issue templates (bug report / feature request).

### Fixed
- Techtree/building upgrade cost formula: `costDoubleAfter` was compounding
  per level instead of a flat 2x once past the threshold, undercounting
  cost for the Research Lab and other buildings past that point.
- `xeno_survey` results actually arrive as a system message, not a fleet
  report — `/api/fleet/cyber-reports` was the wrong endpoint and was
  always empty.
- Expeditions/Wormhole/Xeno's "Ships lost (build cost)" card ignored the
  View/Window/Zone filters (read the all-time aggregate instead of the
  filtered records); same gap fixed in the Global tab's filtered view.
- Build/upgrade buttons on ship/tech/building cards no longer overlap the
  entity image — moved to the card's bottom row, pinned to the left edge,
  enlarged 20%.

## [1.7.3] - 2026-07-19

### Added
- **Shipyard build planner** (`ship-upgrade.js`): a 🚀 button on each ship card
  computes the flat per-unit build cost (ore/silicates/hydrogen/alloys +
  rare) for a chosen quantity, then hands the deficit off to the
  Quartermaster or the shared to-do queue — same UX as the building/tech
  planners, but ships are per-planet.
- **Multi-select resource summary** in the upgrade to-do list: left-click
  toggles an item into a selection instead of delivering it immediately; the
  panel sums resource need across every selected item and subtracts the
  destination planet's stock once, then offers a single Send via
  Quartermaster. Restricted to one planet at a time.
- **Storage caps + outpost mining indicator** in the Quartermaster: each
  resource on a colony card now shows its storage cap; outposts are badged
  with what they're currently mining (icon + rate/h).
- **Server-side capacity check** before Quartermaster dispatch: cross-checks
  the intended resource total against the game's own bonus-adjusted fleet
  capacity (from `/fleet/fuel-estimate`) and disables Send with an explicit
  message if it's over, instead of surfacing a dispatch error after the fact.
- **Optimise Mining Fleet**: the live-search matches window and the
  Asteroids-tab fleet dialog both seed a mining send from the user's chosen
  template by default now. A new "Optimise Mining Fleet" button (next to the
  live-search Start/Stop toggle, and inside the Asteroids-tab dialog) swaps
  just the mining ships (Mining Vessel/Gas Collector/Ice Drill/Excavator) to
  the recommended count, leaving escort/combat ships untouched. Adds an
  Excavator when the +20% checkbox is checked.

### Removed
- The "Send non-optimised fleet" escape-hatch button from both fleet-confirm
  dialogs — redundant now that templates are the default.

## [1.7.2] - 2026-07-12

### Added
- **Tech upgrade planner**: a 🔬 button on each research card computes the
  cumulative research cost (ore/silicates/hydrogen/alloys + rare) to a target
  level and hands the deficit to the Quartermaster. Research is account-global,
  so a destination-planet picker chooses where it will run.
- **Upgrade to-do list**: a queue beside either upgrade planner. Queue building
  and tech steps with ➕ To-do; drag to reorder (labels recompute in order,
  per-planet for buildings, global for tech); each card shows its planet and,
  when clicked, stages that step's resource deficit in the Quartermaster.
- **Deliver/Transfer switch**: planet→planet resource dispatches in the
  Quartermaster can now be sent as a transfer (haulers stay) instead of a
  delivery (haulers return).

### Fixed
- Date-flaky `purgeOldData` test (records fell in the same month early in the
  month, colliding archive keys and double-counting).
- Removed an unused variable flagged by lint.

### Changed
- CI: bumped `actions/checkout` and `actions/setup-node` to v5 (Node 20
  deprecation).

## [1.7.1] - 2026-07-09

### Fixed
- **Quartermaster**: editing a resource amount now re-plans the transport fleet
  to match, instead of leaving the ship counts on the first auto-plan.
- **Excavator**: the +20% toggle now actually adds an Excavator to the launched
  fleet (it previously only inflated the recommended capacity but never sent the
  ship) — in both the live-search matches window and the Asteroids-tab dialog.

## [1.7.0] - 2026-07-09

### Added
- **Quartermaster** (in-game fleet & resource overview): a new panel giving a
  fleet + stored-resource overview across all your colonies with drag-and-drop
  transfers. Cards are grouped by kind in a 3-column layout (moons left, planets
  centre, outposts right) with drag edge-autoscroll and boxed drag chips.
  - **Per-resource cargo allocation** when planning a transfer, plus moon support.
  - **Moon transfers** and correct moon-ownership id handling.
  - **Outpost supply / deploy / collect** actions.
  - **In-flight ships** shown from active missions.
- **Scouting — nearest-planet debris collection**: a "Nearest planet" toggle in
  the Live debris fields header. When on, each field's collection fleet launches
  from your nearest owned planet (per-field, by galaxy-map distance) instead of
  the single selected planet — driving both the Fuel Cost / Travel Time columns
  and the actual launch. Persists across tabs/sessions.
- **Battles — PvP combat**: ingest player-vs-player combat reports, show PvP rows
  in the Battles table, and a CSV export button (fleets + rounds included; Excel
  encoding fixed).
- **Simulator**: defense buildings can now field multiple units; simulations
  default to 100 runs.
- **In-game User Guide** overlay.
- **Object Finder — moon column**: shows moon types with slot counts,
  colour-coded.
- **API — proactive rate-limit throttle** to avoid hitting the game's limits.

### Fixed
- **Scrape**: tolerate a shipyard `403` (ships out on patrol) instead of failing
  the whole scrape.
- **Mining**: false `mining.deliveries` drift sourced from raid records.
- Lint: removed unused params (`processPvpReports` ships, `numInput` max) and a
  dead `missions` assignment.

## [1.6.9] - 2026-07-05

### Added
- **Scouting — fleet progress bars**: in-transit fleets now show a phase-coloured
  progress bar (En route → working → Returning) with ETA. Scanning fleets get a
  dedicated panel; the investigation, debris and salvage tables each get a
  Progress column after the action button. Bars advance every second; the mission
  list is refetched right after a launch so the bar appears promptly.
- **Galaxy — mining toggle**: a persisted "⛏ Mining" switch in the galaxy
  breadcrumb hides or shows the injected per-field mining picker + optimal-ships
  line across all cards at once (green on, grey-red off).
- **Mining — Fuel cost + ROI columns**: the Recent Deliveries table drops Ships
  lost and Stolen for a Fuel cost column (POST fuel-estimate for the stored fleet,
  source planet → mined system) and an ROI column (weighted: mined − breakdown −
  fuel − ship loss − stolen).
- **Scouting — investigation return tracked**: the row now persists with a
  "Returning…" bar until the investigate fleet is home, instead of vanishing when
  the investigation completes.
- **Fleet Templates — mining ship colours**: each mining ship's name is coloured
  by what it mines (Mining Vessel, Gas Collector, Ice Drill, Excavator, Freighter),
  with a "Mines: …" tooltip and a legend.
- **Empire View — hero banner** image at the top of the overlay.

### Fixed
- **Galaxy mining picker**: the cycle number sometimes rendered blank. When the
  game re-rendered a field card and reconciled away part of the injected picker,
  `paint()` threw before setting the value. Rebuild the picker when it's
  incomplete and populate the cycle value at build time.
- **Galaxy mining picker**: dark-matter fields ("Dark Matter Rift") showed "No
  mining ship" — the ship map keyed the field by `dark_matter` instead of the
  actual field type `dark`. Now recommends the Ice Drill.
- **Mining reports**: only `delivery` reports count toward totals/cycles/table;
  `pirate_raid` reports are kept for the battles tab but no longer inflate them.
  Cycles come from `resourcesDelivered._cyclesDone` (default 10 when absent).
- **Cryo-ice captured**: the game delivers `cryo_ice` but the addon used `ice`,
  so cryo-ice was dropped from all report processing and rendered as zero. Renamed
  the internal key across processing, series and the report tables.
- **Loot doughnut**: rare resources (cryo-ice, plasma core, quantum dust, …) were
  missing in windowed modes; now read whether stored flat or in the rare map.

## [1.6.8] - 2026-07-04

### Added
- **Empire View**: a new "Empire View" link in the game sidebar opens a
  game-styled overlay with a columnar per-planet summary (one column per planet
  plus a Total column):
  - **Workforce**: population (cur/max), growth/h, assigned workers, free
    workers, energy (net).
  - **Available resources**: stored / storage capacity per resource, red near
    full; Total summed.
  - **Resource buildings**: level and production/h for ore / silicates /
    hydrogen / alloys (+ rares when produced).
  - **Infrastructure** with live countdowns: building slots (used/max), build
    queue, researching tech, buildings in construction, and ships in production
    across both the Shipyard and Orbital Shipyard queues.
  Data is fetched same-origin from the game APIs; the overlay lives in `<body>`
  so game re-renders never wipe it.

## [1.6.7] - 2026-07-04

### Added
- **Scouting → Uncollected salvage**: after a partial-recovery investigation,
  leftover loot sits in-system (survey report `uncollectedLoot`, live until
  `salvageExpiresAt`). A new table under *Live debris fields* lists these with
  resource breakdown, total, planned haulers, fuel, travel time and an expiry
  countdown. Collect launches the same cargo ships as debris via
  `POST /api/fleet/collect-salvage`. Populated from the survey-reports fetch
  already made — no extra API call.

### Fixed
- **Galaxy field cards**: the optimal-ships line stopped rendering. `galaxy-fields.js`
  used top-level `const`s, and Firefox re-injecting the content script into the
  same isolated world (extension reload) threw "redeclaration of const", aborting
  the whole script. Wrapped the body in an IIFE + re-run guard. Also buffer relayed
  field stats in the MAIN-world hook and replay them on init, so data fetched
  before the isolated-world listener attaches isn't lost.

## [1.6.6] - 2026-07-03

### Added
- **Galaxy mining calculator**: on the in-game `/galaxy` page, each asteroid
  `field-card` now shows the optimal number of mining ships to clear it —
  `ceil(remaining / (extraction_capacity × cycles × richness))`. A floating
  picker (image tiles) selects the mining ship (Mining Vessel / Gas Collector /
  Ice Drill / Excavator) and a −/+ stepper sets the target cycle count (1–10);
  both persist. Field data (resources, richness, type) is read from the game's
  own `/planets` response via a page-world fetch/XHR hook.
- **Battles tab**: one place aggregating every combat across sources — pirate
  camp raids, pirate ambushes while mining, survey ambushes and
  expedition/wormhole encounters. Summary cards (battles, ships lost/damaged,
  enemies destroyed), a source filter, a sortable table (date, source, location,
  zone, outcome, losses, debris) and click-a-row to expand the attacker/enemy
  fleets and per-ship losses. Reads the recent records already in memory.

### Fixed
- Live-search matches window now refreshes its "as of" time, match count and
  rows live when a background scan completes, instead of freezing at open time.

## [1.6.5] - 2026-07-01

### Added
- **Asteroid belt live search**: a second filter row on the Asteroids tab scans
  the nearest systems in the background every 5 minutes — even when the tab or
  browser isn't focused — and fires a notification when a new field matches your
  filter (type/zone/mult/qty/left%).
- **In-game matches window**: clicking the notification (or the new "Live Search
  Belts" sidebar link) opens a floating, draggable window listing the matches,
  with per-row fuel cost, an editable fleet (one ship per line), and a one-click
  ⛏ to send a mining mission. Start/stop the search from the window.
- **Ratio Calculator** in the game sidebar: a floating, draggable calculator —
  enter any two of offer / pay / ratio and it infers the third.
- **Market** "Ratio wanted ≥" filter on the open-offers table.
- **Asteroids** "Left % ≥" filter.
- **Scouting**: independent, persisted debris zone filter; an "Investigated only"
  switch backed by a 2-hour investigation history (a system drops once its debris
  is collected). The survey zone filter is now persisted too.
- **Mining**: drill-breakdown maintenance (75 alloy per breakdown) is now charged
  in the Net total.

### Changed
- **Market** tab: removed the Trade Hub filter and the mini-map.

### Fixed
- Scouting/Asteroids availability strip no longer blinks each poll, and no longer
  disappears.

## [1.6.4] - 2026-06-26

### Added
- **Travel Time** columns on the Scouting debris and investigation tables.
- **Date-range "Days" picker** with **Last 3 days / Last 7 days / Last month**
  view presets. The selected range drives the stat cards, net, doughnuts and
  charts, and overrides "All time" when a range is set.
- **Loot composition** doughnut on the Mining tab; Mining net now shows in every
  view, not just All-time.
- A labelled legend (source — %) on Global's "Share by source" chart.
- Scouting/Asteroids remember the selected planet, fleet template, and cargo
  ship types across tab switches and restarts.

### Changed
- Per-mission fuel uses the game's exact fuel-estimate (real fleet + route),
  falling back to the fitted formula only when no game tab is open.

### Fixed
- Graphs bucket data by **local** day/hour instead of the raw UTC timestamp, so
  reports near midnight no longer fall in the wrong day/hour.

## [1.6.3] - 2026-06-26

### Added
- **Debris collection from Scouting**: the live debris fields table moved here
  with a one-click **Collect** button per row.
  - Pick cargo ship types (icon toggles) and the addon auto-plans the fewest
    ships to collect 100% of a field, shown in **Number of Ships** and **Fuel
    Cost** columns and capped to what's on the planet.
  - Effective cargo accounts for cargo research and the commander cargo bonus.
  - Sortable columns, per-row hide/unhide, and a guard against double-collecting.
- **"On this planet" ship strips**: live counts (icon + qty) above the
  investigation table (all ship types), the debris table (cargo ships), and the
  Asteroids fields table (all ship types) — refreshed every 10s and after each
  launch, so you can see fleets free up without reloading.

### Changed
- Debris fields show a **Total** column (ore + silicates + alloys) instead of an
  always-zero hydrogen column.

## [1.6.2] - 2026-06-25

### Changed
- **Asteroids tab** now scans the *N nearest explored systems* to the chosen
  planet (set the count) instead of an arm + sector region.
- Asteroid scans refetch system data after 15 minutes (was 24h) so drained
  fields and miner presence stay current; Planet Finder keeps the 24h cache.
- Dashboard now opens on the **Global** tab.

### Added
- **Fuel Cost** column on the Asteroids tab: per-field hydrogen estimate for the
  selected fleet template from the Mining-From planet (out-of-range in red).
- **What's-new modal**: after an update, the latest changelog entry is shown
  once in the dashboard, formatted (headings, bullets, bold/italic/code).

### Fixed
- Rate-limited (429) API calls now retry with backoff instead of erroring out.
- Fuel estimates are cached per source/destination/template, so known routes no
  longer re-hit the API on re-render, paging or template reselection.

## [1.6.1] - 2026-06-25

### Fixed
- Fleet/research launches no longer silently cancel: native `confirm()` is
  replaced by an in-page modal, so Firefox's "prevent additional dialogs"
  checkbox can't suppress launch confirmations anymore.
- Scouting no longer re-targets a system that was just surveyed/investigated
  while the missions API lags; the source system is now a valid survey target.

### Added
- Launch confirmations show each ship's image + name instead of `#<id>`.
- Used/max fleet slots shown on the Scouting and Asteroids tabs.

## [1.6.0] - 2026-06-25

### Added
- **Asteroids Fields tab**: scan a region (arm + sectors) for asteroid fields
  via the galaxy sector endpoints, listing type, content, richness multiplier,
  remaining %, security zone, distance to a chosen planet and miner presence.
  - Resource-icon type filter, colour-coded zone toggles, mult/qty floors,
    sortable columns and pagination.
  - **🚀 per row** dispatches a fleet template to mine the field, capped to the
    ships actually on the source planet.
- **Fleet Templates tab**: named, reusable ship templates (planet-agnostic),
  styled like the simulator's attacker fleet and built from the full shipyard
  catalog. Shared by the mining and scouting actions.
- **Scouting tab**: probe surveys and anomaly investigations.
  - **Launch Scan** sends a probe template to the nearest system (in the
    selected security zones) that isn't on cooldown or already being surveyed.
  - **Active surveys** lists anomalies awaiting investigation, auto-refreshing
    with a live countdown, sorted by soonest expiry, with a Fuel Cost column
    (`/api/fleet/fuel-estimate`) for the chosen investigate template.
  - **Launch Investigation** dispatches the fleet and greys out when an
    investigate mission to that system is already in flight.

### Fixed
- Fleet-action POSTs (mine, survey, investigate, fuel-estimate) route through
  the game tab's content script so they run same-origin with the session
  cookie — a Bearer POST from the extension carries an `Origin` header the
  server rejects with a 500.

## [1.5.7] - 2026-06-19

### Added
- **Tech Tree research planner**: queue research targets and launch them
  straight from the dashboard.
  - Real lab level read from each planet's Research Lab building (highest
    across planets) — replaces the previous estimate.
  - Lab-upgrade steps are inserted automatically when a planned tech needs
    a higher lab level, and gate the techs that depend on them.
  - **Launch** button on each researchable step posts the research to the
    game (with a confirm dialog) on a planet of your choice — a "Launch on"
    picker lists every planet, with busy ones disabled.

### Fixed
- Fuel formula recalibrated against real data: `rate × (0.0496 × distance + 3.48)`
  (~6% mean error; the previous formula was ~2× too high due to a mislabeled
  distance scale).
- Fuel is now counted once per **launched** mission (stored in `fuel_log` by
  type/date/zone). A survey's heavy investigation/collection fleet is counted
  rather than the lighter scout probe; `investigate` and `anomaly` mission
  types are both mapped to the survey zone.
- Schema v7 clears `fuel_log` and stale coordinate/home/owned-system caches
  so fuel rebuilds cleanly from launch records.

### Changed
- Fuel cards appear on every tab (Surveys, Pirates, Mining, Debris,
  Expeditions, Global) and the net-gain totals now label themselves
  "− fuel". All fuel reads go through `fuelForMode` so they honour the
  View and Zone selectors.
- Removed the dead report-join fuel path and the `mission_origins`,
  coordinate, home-system, and owned-system caches (superseded by the
  launch-log approach).
- Research time estimates are now accurate: they use the game's own
  per-level time scaled by each planet's research-speed multiplier, and the
  schedule models one research slot per planet (parallel) plus a
  time-aware affordability check that accrues income over the queue.

## [1.5.6] - 2026-06-18

### Added
- New **Global** tab: collected resources, net gain, operations count, a
  per-period chart, a collected-composition doughnut and a weighted
  "share by source" doughnut — all honouring the View/Window/Zone selectors.
- Alloys and exotic resources (ice, quantum dust, plasma core, dark matter,
  antimatter) tracked everywhere: collected cards, recent-report tables,
  resource line charts and the "resources by event type" chart, across
  surveys, pirates, mining, debris and expeditions.
- Per-period charts gained a report-count line (missions/raids/deliveries/
  runs) on a secondary axis; debris and expeditions got per-period charts.

### Changed
- Net gain now includes exotic resources, weighted ×10 in the total
  (ore×1, silicates×2, hydrogen×3, alloys×5, exotics×10).
- Survey table drops the wormholes column; expeditions split the Loot
  column into per-resource columns; debris cards/graph honour view + zone.

## [1.5.5] - 2026-06-18

### Added
- Sidebar launcher: an "Addon → Nexus Tracker" entry is injected into the
  game's sidebar (using its own styling) to open the dashboard.
- Graph time-window selector (last 5/7/14/30/all days; default 5), and the
  View/Window/Zone controls now sit directly above each tab's graphs.

### Changed
- Fuel is now computed precisely from each mission's real fleet and real
  distance, captured live from /api/fleet/missions by mission id (including
  the actual launch system, not an assumed home). The earlier estimate is
  removed — missions the addon didn't observe contribute no fuel rather
  than a guess.
- Date graphs fill empty days/hours so the time axis is continuous.

## [1.5.4] - 2026-06-17

### Added
- Fuel cost estimate folded into net gain. Each survey, pirate, and mining
  report now estimates the round-trip hydrogen burned
  (`Σ(fuelRate×qty) × (0.0517×galaxyDist + 9.24)`, fitted to real send-fleet
  costs) and subtracts it from the Hydrogen and Total net. Survey shows a
  "Fuel spent est." card too.
- Galaxy map caches system coordinates; pirate-camps cache coordinates; the
  home system id is cached — all to measure travel distance.

### Notes
- Fuel needs a fresh Scrape Now to populate the new ship/coordinate fields,
  and only applies to newly scraped reports. Survey fuel uses an assumed
  fleet by zone (the report omits the fleet sent). Reports whose target
  system is unexplored show no fuel.

## [1.5.3] - 2026-06-16

### Added
- Combat simulator now shows a round-by-round "sample battle" (one
  representative run): ships and HP% per side each round, kills, and the
  sample outcome — alongside the Monte-Carlo averages.
- Fuel estimate for the attacking fleet: enter a distance (AU), optional
  round-trip, and get total hydrogen from each ship's fuel rate.

### Changed
- Rapid-fire table rebuilt from the exact in-game ship screens (fighter
  and carrier entries added; cruiser, battleship, bomber, interceptor
  values corrected).
- Rapid fire and ship stats now resolve pirate/NPC ships (e.g.
  "Pirate Fighter") to their base class, so the engine can simulate
  wormhole/pirate fleets and the validator can replay those reports.
- Ship catalog now stores fuel rate and cargo capacity.

## [1.5.2] - 2026-06-15

### Fixed
- Widened host permissions to `*://*.nexuslegacy.space/*` so a single grant
  covers the `s0` (and any future universe) subdomain. Previously only the
  apex was granted on Firefox, leaving the API host unauthorized — every
  request was CORS-blocked and the addon reported "not logged in" with no
  data.
- `getToken` now searches every cookie store (Firefox containers, private
  windows) and domain-wide, not just the default store with two exact URLs.
- API errors now name the failing endpoint (network/CORS failures included).

### Added
- Planet Finder: Max size, temperature range, security-zone, and
  "exclude mine" filters; Zone and Distance-from-home columns (sortable).
- A flaky system during a scan is now skipped and counted instead of
  aborting the whole scan.
- Galaxy map is now interactive: drag to pan, wheel to zoom toward the
  cursor; clicking a results row centers and rings that system. Matches
  table moved above the map.
- Map markers: your planets show a light-green aura; alliance-owned
  systems found while scanning get the same aura with the player's name;
  market hubs are drawn as yellow diamonds.
- Owner-only galaxy export/import: share scanned-planet knowledge as a
  JSON file, merged by freshest scan per system. Imported systems become
  searchable even if you haven't explored them.

## [1.5.1] - 2026-06-15

### Changed
- Tech Tree depth now factors in the required laboratory level as a
  tiebreak: depth = max(prerequisite-chain depth, lab-level floor), so
  lab-gated techs sink to their lab tier instead of bunching at the top
  when they have no research prerequisites.

## [1.5.0] - 2026-06-15

### Added
- Tech Tree tab: renders `/api/research` as a top-to-bottom dependency
  graph (OGame style). Rows are prerequisite depth; prerequisites sit
  above their dependents.
- Long edges route through invisible waypoints merged per source into
  vertical buses, so dependencies weave around nodes instead of crossing
  them. Crossing reduction uses barycenter (mean + median) with
  adjacent-transpose refinement, keeping the lowest-crossing ordering.
- Rounded orthogonal edges coloured by prerequisite branch, dashed/faded
  when the prereq is unmet, arrowheads into dependents.
- Nodes show branch accent + status; researchable-now techs glow, locked
  techs recede. Tier labels, row bands, and a legend aid orientation.
- Interaction: hover/click-pin chain highlight, drag-pan, wheel zoom,
  fit-to-width, branch filter, and search-to-highlight.

## [1.4.0] - 2026-06-15

### Changed
- Migrated to Manifest V3 and made the addon work on both Firefox and Chrome
  from one codebase (webextension-polyfill, MV3 service worker / event page,
  `action`, split host permissions).
- Realtime updates now use an observe-and-re-fetch trigger
  (`webRequest.onCompleted`) instead of Firefox-only response-body reading,
  which MV3 removed. Still near-realtime; costs one extra request per change.
- `build.py` emits both the `.xpi` (Firefox) and a `.zip` (Chrome Web Store).
- Auto-backups download from a data URL (service workers have no
  `URL.createObjectURL`).

## [1.3.4] - 2026-06-15

### Changed
- Net gain and resources-lost now include the repair cost of damaged ships
  (50% of build cost), not just destroyed ones. Surveys and pirate raids
  track damage per ship type for this.

## [1.3.3] - 2026-06-15

### Fixed
- Combat simulator rapid fire was dumping all of a unit's shots into one
  target, wasting most on overkill — rapid-fire swarms (e.g. interceptors)
  badly underperformed. Each shot now picks its own target and skips ships
  already lethally hit that round, validated against a third real battle.

## [1.3.2] - 2026-06-13

### Changed
- Published on addons.mozilla.org (listed channel). AMO now signs,
  distributes and auto-updates the addon; the short-lived self-hosted
  `update_url`/`updates.json` channel from 1.3.1 is removed.
- `build.py --sign` submits to the listed channel.

## [1.3.1] - 2026-06-13

### Added
- **Automatic backups** to `Downloads/NexusAccounting/`: weekly while
  scraping, and before every destructive operation — reset, import,
  schema-fallback wipe and version updates. Requires the new `downloads`
  permission.
- **Rebuild stats**: recomputes every aggregate losslessly from uncapped
  report archives (sharded by month so a scrape only rewrites the current
  month). The records cap now only bounds the UI tables.
- **Drift detection**: archive-derived sums are checked against stored
  totals after each scrape; mismatches surface a warning in the status bar.
- **Import validation**: backups are shape-checked before anything is
  replaced.
- Storage footer: archived report count, storage size, last backup date.
- Node test suite (`npm test`): combat-engine calibration regression tests
  and processor tests (dedupe, shards, migration, drift/rebuild).

### Changed
- Schema changes now migrate data in place (`MIGRATIONS` map); a wipe is the
  last resort and preserves the records cap, which only the user changes.
- Combat engine extracted to `engine.js`; dashboard split into `common.js`,
  `tabs/*.js` and an orchestrator; simulator split into core, intel and
  validation files.

## [1.3.0] - 2026-06-13

### Added
- **Mining tab**: deliveries, mining cycles, drill breakdowns, ambush ship
  losses (valued at build cost) and cargo stolen, with per-period chart.
- **Debris tab**: live debris fields snapshotted from `system-debris`,
  estimated collected amounts inferred from snapshot diffs, plus debris
  generated by your own pirate raids.
- **Expeditions tab**: expedition reports and wormhole runs merged — loot,
  losses, per-period chart (shape-tolerant parsing, endpoints unobserved yet).
- **Planet Finder tab**: full-galaxy map with region highlight; filters by
  arm, sector (single or range), planet type, min size, min moons and
  ownership; scans explored systems with a 24h cache; sortable results and
  hover tooltips on matches.
- Simulator: **Load my fleet** fills the attacker from your stationed ships.
- Simulator: **intel auto-fill** — defender fleet and turret/shield/EW levels
  load from spy or camp-scout reports; target resources shown with an
  estimated cargo requirement for ~50% loot.
- Simulator: **planetary defenses** — turret structure, always-regenerating
  shield generator and EW damage reduction (estimates); bombers keep their
  exact ×5 rapid fire vs defense buildings.
- Simulator: **engine validation** — replays recorded pirate raids and
  reports outcome accuracy and average loss error against real results.
- `build.py` builds the versioned xpi from the manifest.

### Changed
- Home planet is discovered via `/api/planets` and cached (no hardcoded id);
  recolonization self-heals on 404.
- Mining and Expeditions tabs honor the All time / Daily / Hourly view mode.
- Intel report retention raised to 200; spy, camp-scout, mining, expedition,
  wormhole and system-debris endpoints added to realtime interception.
- View mode and records cap controls hidden on tabs where they are
  meaningless (Planet Finder, Debris).

## [1.2.1] - 2026-06-10

### Added
- **Realtime updates**: the addon now intercepts the game's own API responses
  (survey reports, pirate reports, shipyard) via `webRequest.filterResponseData`
  and processes them immediately — the dashboard updates seconds after you open
  a report in game. The 15-minute scrape remains as fallback for when no game
  tab is open.
- **JSON export/import** on the dashboard: full backup of all aggregated data
  to a dated file, restore with confirmation. Protects history the game API no
  longer returns.
- Simulator: **research levels** (0–5) per side with exact in-game rates —
  weapon damage techs, hull techs, shield HP, and damage reduction
  (Shield Theory / Adaptive Shields / Advanced Shielding, stacks to 35%).
- Simulator: ship stat lines update live as research levels change.
- Simulator: average survivors shown next to each ship input after a run;
  auto-scroll to results.

### Changed
- Simulator targeting calibrated against real battle reports (partial
  focus-fire); default round cap raised to 10; options moved above the fleets.
- Dreadnought and Titan rapid-fire values are now exact (from in-game ship
  screens).
- "Resources collected" cards ordered Ore / Silicates / Hydrogen to match
  the resources-lost cards.
- Background page is persistent and requires the `webRequest` /
  `webRequestBlocking` permissions (needed for response interception).

### Fixed
- `package.json` license said MIT while the project is MPL-2.0.

## [1.2.0] - 2026-06-10

### Added
- **Combat simulator** (`simulator.html`, linked from the dashboard):
  Monte Carlo battle engine modeled on the official combat guide — round-based
  simultaneous fire, weapon-vs-armor matchups, rapid fire, plasma/ion shield
  burn, win/hold/mutual-destruction rates, expected losses and debris value.
  Debris rate (30% of destroyed ship cost) verified against real pirate
  reports.
- Ship catalog now stores combat stats (HP, shield, attack, weapon/armor type)
  for the simulator.

## [1.1.0] - 2026-06-10

### Added
- **Pirates tab**: aggregates pirate camp raids from
  `/api/fleet/pirate-reports` — loot collected, attacker ships destroyed and
  damaged (build-cost valuation of losses), pirates destroyed, outcome
  breakdown, debris fields generated, daily/hourly views and raid history
  table.

## [1.0.1] - 2026-06-10

### Fixed
- Skip uninvestigated anomalies and uncollected loot until fully resolved —
  reports are counted once, with their final loot.
- `ships_lost` counted array entries instead of summing quantities.
- Pagination buttons (CSP-safe event listeners instead of inline `onclick`).

## [1.0.0] - 2026-06-09

### Added
- Initial release: tracks Nexus Legacy survey reports — resources collected
  (ore, silicates, hydrogen), missions, ships lost with build-cost valuation,
  event type breakdown, daily/hourly charts, report history with configurable
  records cap, 15-minute background scrape with manual "Scrape Now".
