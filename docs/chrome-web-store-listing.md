# Chrome Web Store listing — Nexus Accounting

This file contains copy-ready listing and review information for the Chrome Web Store. Never commit reviewer account credentials; enter them only in the private **Test instructions** field in the developer dashboard.

## Product details

- **Name:** Nexus Accounting 助手
- **Store listing:** https://chromewebstore.google.com/detail/nexus-accounting-%E5%8A%A9%E6%89%8B/cikikabpimpjecpcofdadcgbihokoofk
- **Extension ID:** `cikikabpimpjecpcofdadcgbihokoofk`
- **Primary language:** Chinese (Simplified)
- **Category:** Productivity
- **Homepage:** https://github.com/Einzieg/NexusAccounting
- **Support:** https://github.com/Einzieg/NexusAccounting/issues
- **Privacy policy:** https://github.com/Einzieg/NexusAccounting/blob/master/docs/privacy-policy.md
- **Initial visibility:** Unlisted for store-install and auto-update testing; switch to Public when ready

### Summary

适用于 Nexus Legacy NX-S0 与 NX-NF 的本地数据统计、收益分析、舰队规划和游戏内辅助工具。

### Detailed description

Nexus Accounting 是面向 Nexus Legacy NX-S0 与 NX-NF 的非官方社区浏览器助手。它从用户当前已登录的游戏标签页读取游戏 API 数据，并在浏览器本地完成统计、分析和规划。

主要功能：

- 汇总勘测、海盗、采矿、战斗、残骸、远征、虫洞和异星遗迹记录
- 统计资源收益、舰船损失、重建成本、燃料消耗和净收益
- 分析市场成交历史、手续费、资源净流量和估算盈利
- 提供舰队模板、星系侦察、小行星扫描、科技树和研究队列
- 内置战斗模拟器、军需官及建筑、科技、舰船资源规划器
- 支持 NX-S0 与 NX-NF 独立数据空间和自动同步

隐私说明：所有同步结果、模板和设置均保存在浏览器的本地存储中，不会上传至扩展作者或第三方服务器。扩展不会读取、保存或转发登录密码及会话 Cookie 值。

本扩展是非官方社区工具，与 Nexus Legacy 官方不存在隶属、授权或合作关系。

## Privacy practices

### Single purpose

从用户已登录的 Nexus Legacy 游戏页面读取游戏 API 数据，并在浏览器本地提供游戏统计、收益分析和规划辅助功能。

### Permission justifications

| Permission | Copy-ready justification |
|---|---|
| `storage` | 在浏览器本地保存同步结果、报告、舰队模板、研究队列和用户偏好；数据按游戏服务器隔离。 |
| `scripting` | 在用户已打开且已登录的 Nexus Legacy 标签页中注入随扩展打包的同源 API 桥接脚本；不下载或执行远程代码。 |
| `alarms` | 每15分钟触发本地数据同步，并按用户启用的设置运行小行星实时搜索和周期备份。 |
| `downloads` | 响应用户操作导出 JSON/CSV，并在重置、导入或迁移前保存本地 JSON 备份。 |
| `webRequest` | 仅监听两个受支持游戏域名上指定 API 请求的完成事件，以便在游戏状态变化后刷新本地统计；不修改网络请求。 |
| `notifications` | 在用户启用实时搜索后显示匹配的小行星结果等本地系统通知。 |
| Host access | 仅访问 `s0.nexuslegacy.space` 与 `nf.nexuslegacy.space`，用于从用户已登录的游戏标签页请求游戏数据和注入助手界面。 |

### Remote code

Select **No**. All JavaScript libraries and extension logic are included in the uploaded package.

### Data types to disclose

- Personally identifiable information: in-game usernames or player identifiers that appear in game data
- Website content: game API responses, including colonies, fleets, research, reports, and market records
- User activity: game missions, battles, mining, market transactions, and extension actions used for local reports

Do not select real-world financial/payment information: the extension only processes fictional in-game resources. State that all disclosed data is processed and stored locally, is not sold, is not used for advertising, and is not transferred to the developer or third parties.

## Test instructions

Provide a dedicated low-value Nexus Legacy reviewer account in the private credential fields, then paste:

1. Open https://nf.nexuslegacy.space/ and sign in with the reviewer account supplied above.
2. Keep the game tab open after login.
3. Click the Nexus Accounting extension icon to open the dashboard.
4. Select `新边疆 · NX-NF` and click `立即同步`.
5. Verify that the overview loads local game statistics.
6. Open `交易分析` to view market-history aggregation and estimated profit.
7. Open `科技树` to view the localized research dependency graph.
8. No external service or second login is required. The extension stores results only in `chrome.storage.local`.

Reviewer note:

The game uses an HttpOnly same-origin session cookie. The browser attaches it to requests made inside the already authenticated game tab; the extension never reads or exports the cookie value. If the dashboard reports that no game tab is available, keep the signed-in game tab open and retry synchronization.

## Graphic assets

- `store-assets/icon-128.png` — 128×128 store icon
- `store-assets/small-promo-440x280.png` — required small promotional tile
- `store-assets/marquee-1400x560.png` — optional marquee image
- `store-assets/screenshots/*.png` — 1280×800 real product screenshots

## GitHub Actions automatic publishing

The release workflow uses Chrome Web Store API v2. Configure these under
**GitHub repository → Settings → Secrets and variables → Actions**:

- Repository variable `CWS_PUBLISHER_ID`: the publisher ID shown in the
  Chrome Web Store developer dashboard.
- Repository secret `CWS_CLIENT_ID`: Google OAuth client ID.
- Repository secret `CWS_CLIENT_SECRET`: Google OAuth client secret.
- Repository secret `CWS_REFRESH_TOKEN`: OAuth refresh token authorized with
  the `https://www.googleapis.com/auth/chromewebstore` scope.

The public extension ID `cikikabpimpjecpcofdadcgbihokoofk` is pinned in
`.github/workflows/release.yml`; do not create a `CWS_EXTENSION_ID` secret.
Never commit OAuth credentials or a refresh token to the repository.

To publish an update:

1. Increase the versions in `nexus-addon/manifest.json` and
   `nexus-addon/package.json`.
2. Commit and push the release changes.
3. Create and push a matching tag such as `v1.8.8`.
4. The Release workflow tests and packages the extension, creates a GitHub
   release, uploads the Chrome ZIP, and submits it for Chrome Web Store review.

After Google approves and publishes the version, Chrome automatically updates
store-installed copies. A normal branch push does not submit a store update;
only a matching `v*` tag starts this release workflow.

## Submission checklist

- Upload the Chrome ZIP whose manifest version matches the release version.
- Confirm the ZIP root contains `manifest.json`, `LICENSE`, and `PRIVACY.md`.
- Upload at least one real 1280×800 screenshot and the 440×280 promotional tile.
- Fill every permission justification and the user-data declarations above.
- Add reviewer credentials only in the private dashboard fields.
- Choose deferred publishing for the first review.
- After approval, export data from the unpacked extension before installing the store version because the extension ID changes.
