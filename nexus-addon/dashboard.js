// Dashboard orchestrator: storage load, status bar, tab switching and
// global controls. Tab rendering lives in tabs/*.js, shared helpers in
// common.js (load order matters — this file comes last).

// ── Storage ────────────────────────────────────────────────────────────────

import { activeTab, confirmDialog, dayKey, fuelForMode, getLabelKey, getMode, infoDialog, periodLabelFor, renderMarkdown, renderNetCards, setActiveTab, setStore, store } from './common.js';
import { renderBattlesTab } from './tabs/battles.js';
import { renderDebrisTab } from './tabs/debris.js';
import { renderExpeditionsTab, setExpPage } from './tabs/expeditions.js';
import { renderWormholesTab, setWhPage } from './tabs/wormholes.js';
import { initAsteroidsTab } from './tabs/asteroids.js';
import { renderFleetsTab } from './tabs/fleets.js';
import { initScoutingTab } from './tabs/scouting.js';
import { initXenoTab, renderXenoTab, setXnReportPage } from './tabs/xeno.js';
import { initFinderTab } from './tabs/finder.js';
import { initMarketTab } from './tabs/market.js';
import { renderGlobalTab } from './tabs/global.js';
import { renderMiningTab, setMiningPage } from './tabs/mining.js';
import { renderPiratesTab, setPirateCurrentPage } from './tabs/pirates.js';
import { getEventBreakdownForMode, getResourcesLostForMode, getSeriesForMode, getTotalsForMode, populateEventOptions, renderByEventChart, renderCollected, renderEventsChart, renderLost, renderResourceChart, renderTable, setCurrentPage } from './tabs/surveys.js';
import { renderTechTreeTab } from './tabs/techtree.js';

let changelogTextPromise = null;

function currentBuildLabel() {
  return document.getElementById('build-version')?.textContent.trim() || browser.runtime.getManifest().version;
}

function currentBuildVersion() {
  return currentBuildLabel().replace(/^v/i, '').split('+')[0] || browser.runtime.getManifest().version;
}

async function readChangelogText() {
  if (!changelogTextPromise) {
    changelogTextPromise = fetch(browser.runtime.getURL('CHANGELOG.md'))
      .then(r => r.ok ? r.text() : Promise.reject(new Error(`CHANGELOG ${r.status}`)));
  }
  return changelogTextPromise;
}

function changelogSection(md, version = '') {
  const normalized = String(version || '').replace(/^v/i, '').split('+')[0];
  if (normalized) {
    const escapedVersion = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = md.match(new RegExp(`## \\[${escapedVersion}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|$)`));
    if (m) return m[1].trim();
  }
  const latest = md.match(/## \[[^\]]+\][^\n]*\n([\s\S]*?)(?=\n## \[|$)/);
  return latest ? latest[1].trim() : '';
}

async function buildUpdateNotesBody(version = currentBuildVersion()) {
  const frag = document.createDocumentFragment();
  const build = document.createElement('div');
  build.textContent = `当前构建：${currentBuildLabel()}`;
  build.style.cssText = 'margin-bottom:10px;color:#8b949e';
  frag.append(build);
  let section = '详细信息请参阅 CHANGELOG.md。';
  try {
    section = changelogSection(await readChangelogText(), version) || section;
  } catch { /* keep fallback */ }
  frag.append(renderMarkdown(section));
  return frag;
}

async function showUpdateNotes(version = currentBuildVersion(), title = `${currentBuildLabel()} 更新内容`) {
  infoDialog(title, await buildUpdateNotesBody(version));
}

document.getElementById('build-version')?.addEventListener('click', () => showUpdateNotes());

export async function loadAll() {
  const server = await globalThis.nexusStorage.getActiveServer();
  document.getElementById('server-select').value = server.key;
  setStore(await globalThis.nexusStorage.get([
    'totals', 'daily', 'hourly', 'resources_lost', 'event_breakdown',
    'recent_reports', 'ships', 'last_scrape', 'last_error', 'records_cap',
    'pirate_totals', 'pirate_daily', 'pirate_resources_lost',
    'pirate_outcomes', 'pirate_debris_total', 'pirate_recent_reports',
    'mining_totals', 'mining_daily', 'mining_resources_lost', 'mining_recent_reports',
    'debris_fields', 'debris_last_check',
    'debris_collected', 'debris_active_runs', 'debris_collection_log', 'debris_resources_lost',
    'exp_totals', 'expedition_totals', 'wormhole_totals', 'exp_daily', 'exp_recent_reports',
    'expedition_resources_lost', 'wormhole_resources_lost', 'stats_drift',
    'xeno_totals', 'xeno_daily', 'xeno_recent_reports', 'xeno_resources_lost',
    'pvp_recent_reports',
    'research', 'research_speed_mult', 'active_research', 'fuel_log',
  ]));

  const cap = store.records_cap ?? 5000;
  document.getElementById('records-cap').value = cap === Infinity ? 0 : cap;
  updateStatus(store.last_scrape, store.last_error);
  renderAll();
  updateStorageFooter();
}

// Archived record counts + rough storage size, shown in the footer.
export async function updateStorageFooter() {
  const el = document.getElementById('storage-footer');
  if (!el) return;
  const all = await globalThis.nexusStorage.get(null);
  const idx = all.archive_index || {};
  const reports = (idx.survey?.count || all.recent_reports?.length || 0) +
    (idx.pirate?.count || all.pirate_recent_reports?.length || 0) +
    (idx.mining?.count || all.mining_recent_reports?.length || 0) +
    (idx.exp?.count || all.exp_recent_reports?.length || 0) +
    (idx.xeno?.count || all.xeno_recent_reports?.length || 0);
  let bytes = 0;
  try { bytes = JSON.stringify(all).length; } catch { /* ignore */ }
  const size = bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  const backup = all.last_backup ? new Date(all.last_backup).toLocaleDateString() : '从未';
  el.textContent = `已归档 ${reports.toLocaleString()} 条报告 · 占用约 ${size} · 最近自动备份：${backup}`;
}

export function updateStatus(lastScrape, lastError) {
  const el = document.getElementById('status-text');
  el.textContent = '';
  if (lastError) {
    const span = document.createElement('span');
    span.className = 'error';
    span.textContent = `错误：${lastError}`;
    el.appendChild(span);
  } else if (lastScrape) {
    el.textContent = `最近同步：${new Date(lastScrape).toLocaleString()}`;
  } else {
    el.textContent = '尚未同步。';
  }
  if (store.stats_drift) {
    const warn = document.createElement('span');
    warn.className = 'error';
    warn.style.marginLeft = '10px';
    warn.title = `不同步的字段：${(store.stats_drift.fields || []).join(', ')}`;
    warn.textContent = '⚠ 检测到统计偏差，请点击“重建统计”。';
    el.appendChild(warn);
  }
}

// ── Render ─────────────────────────────────────────────────────────────────

export function renderAll() {
  if (activeTab === 'global') {
    renderGlobalTab();
    return;
  }
  if (activeTab === 'pirates') {
    renderPiratesTab();
    return;
  }
  if (activeTab === 'mining') {
    renderMiningTab();
    return;
  }
  if (activeTab === 'battles') {
    renderBattlesTab();
    return;
  }
  if (activeTab === 'debris') {
    renderDebrisTab();
    return;
  }
  if (activeTab === 'expeditions') {
    renderExpeditionsTab();
    return;
  }
  if (activeTab === 'wormholes') {
    renderWormholesTab();
    return;
  }
  if (activeTab === 'finder') {
    initFinderTab();
    return;
  }
  if (activeTab === 'asteroids') {
    initAsteroidsTab();
    return;
  }
  if (activeTab === 'fleets') {
    renderFleetsTab();
    return;
  }
  if (activeTab === 'scouting') {
    initScoutingTab();
    return;
  }
  if (activeTab === 'xeno') {
    initXenoTab();
    renderXenoTab();
    return;
  }
  if (activeTab === 'market') {
    initMarketTab();
    return;
  }
  if (activeTab === 'techtree') {
    renderTechTreeTab();
    return;
  }
  populateEventOptions();
  const mode = getMode();
  const t = getTotalsForMode();
  const rl = getResourcesLostForMode();
  const events = getEventBreakdownForMode();
  const series = getSeriesForMode();
  const labelKey = getLabelKey(mode);
  const periodLabel = periodLabelFor(mode);

  renderCollected(t, periodLabel);
  renderLost(rl, periodLabel);
  renderNetCards('stats-net', t, rl, periodLabel, fuelForMode('survey', getMode()));
  renderResourceChart(series, labelKey);
  renderEventsChart(events);
  renderByEventChart(events);
  renderTable();
}

// ── Tabs ───────────────────────────────────────────────────────────────────

export const TAB_CONTENT = {
  global: 'global-content',
  surveys: 'main-content',
  pirates: 'pirates-content',
  mining: 'mining-content',
  battles: 'battles-content',
  debris: 'debris-content',
  expeditions: 'expeditions-content',
  wormholes: 'wormholes-content',
  finder: 'finder-content',
  asteroids: 'asteroids-content',
  fleets: 'fleets-content',
  scouting: 'scouting-content',
  xeno: 'xeno-content',
  market: 'market-content',
  techtree: 'techtree-content',
};

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    setActiveTab(btn.dataset.tab);
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
    for (const [tab, id] of Object.entries(TAB_CONTENT)) {
      document.getElementById(id).style.display = tab === activeTab ? '' : 'none';
    }
    // View mode and records cap are meaningless on the finder and debris tabs.
    document.getElementById('global-controls').style.display =
      (activeTab === 'finder' || activeTab === 'asteroids' || activeTab === 'fleets' || activeTab === 'scouting' || activeTab === 'techtree' || activeTab === 'market' || activeTab === 'battles') ? 'none' : '';
    positionControls();
    renderAll();
  });
});

// Open directly on a tab when linked with a hash, e.g. dashboard.html#asteroids
// (used by the live-search results window).
if (location.hash) {
  document.querySelector(`.tab[data-tab="${location.hash.slice(1)}"]`)?.click();
}

// Keep the View/Window/Zone bar directly above the active tab's graphs.
export function positionControls() {
  const bar = document.getElementById('global-controls');
  const content = document.getElementById(TAB_CONTENT[activeTab]);
  const charts = content && content.querySelector('.charts');
  if (charts) charts.parentNode.insertBefore(bar, charts);
}

// ── Controls ───────────────────────────────────────────────────────────────

document.getElementById('server-select').addEventListener('change', async function () {
  const previous = (await globalThis.nexusStorage.getActiveServer()).key;
  this.disabled = true;
  const result = await browser.runtime.sendMessage({ type: 'SET_GAME_SERVER', serverKey: this.value });
  if (result?.error) {
    this.value = previous;
    this.disabled = false;
    await infoDialog('切换服务器失败', result.error);
    return;
  }
  window.location.reload();
});

document.getElementById('btn-scrape').addEventListener('click', async function () {
  this.disabled = true;
  this.textContent = '正在同步…';
  try {
    await browser.runtime.sendMessage({ type: 'SCRAPE_NOW' });
    await loadAll();
    this.textContent = '完成 ✓';
  } catch {
    this.textContent = '错误';
  } finally {
    setTimeout(() => { this.disabled = false; this.textContent = '立即同步'; }, 2000);
  }
});

export function onViewChange() {
  setCurrentPage(1);
  setPirateCurrentPage(1);
  setMiningPage(1);
  setExpPage(1);
  setWhPage(1);
  setXnReportPage(1);
  renderAll();
}

// Switching View fills the Days picker: All time clears it (= all history),
// Daily/Hourly = today, Last N = a trailing range. The user can still edit it.
document.getElementById('mode-select').addEventListener('change', () => {
  const mode = getMode();
  const from = document.getElementById('window-from');
  const to = document.getElementById('window-to');
  const span = { last3: 3, last7: 7, last30: 30 }[mode];
  if (mode === 'all') {
    from.value = ''; to.value = '';
  } else {
    const now = Date.now();
    to.value = dayKey(now);
    from.value = dayKey(now - ((span || 1) - 1) * 86400000);
  }
  onViewChange();
});
document.getElementById('zone-select').addEventListener('change', onViewChange);
document.getElementById('window-from').addEventListener('change', onViewChange);
document.getElementById('window-to').addEventListener('change', onViewChange);
document.getElementById('event-select').addEventListener('change', () => { setCurrentPage(1); renderAll(); });

document.getElementById('btn-reset').addEventListener('click', async function () {
  const server = await globalThis.nexusStorage.getActiveServer();
  if (!confirm(`确定清空 ${server.name}（${server.id}）的全部记录数据吗？操作前会先将备份写入 Downloads/NexusAccounting。`)) return;
  await browser.runtime.sendMessage({ type: 'BACKUP_NOW', reason: 'pre-reset' });
  const { records_cap } = await globalThis.nexusStorage.get('records_cap');
  await globalThis.nexusStorage.clear();
  if (records_cap) await globalThis.nexusStorage.set({ records_cap });
  await loadAll();
});

document.getElementById('records-cap').addEventListener('input', function () {
  const raw = this.value.trim();
  const n = parseInt(raw, 10);
  const invalid = raw === '' || isNaN(n) || n < 0 || String(n) !== raw;
  this.style.borderColor = invalid ? '#ff7b72' : '#30363d';
  this.style.color = invalid ? '#ff7b72' : '#e6edf3';
  document.getElementById('cap-warning').style.display = invalid ? '' : 'none';
});

document.getElementById('btn-save-cap').addEventListener('click', async function () {
  const input = document.getElementById('records-cap');
  const raw = parseInt(input.value.trim(), 10);
  if (isNaN(raw) || raw < 0) return;
  const val = raw === 0 ? Infinity : raw;
  await globalThis.nexusStorage.set({ records_cap: val });
  input.value = val === Infinity ? 0 : val;
  input.style.borderColor = '#30363d';
  input.style.color = '#e6edf3';
  document.getElementById('cap-warning').style.display = 'none';
  this.textContent = '已保存 ✓';
  setTimeout(() => { this.textContent = '保存'; }, 1500);
});

// ── Rebuild aggregates ─────────────────────────────────────────────────────

document.getElementById('btn-rebuild').addEventListener('click', async function () {
  const s = await globalThis.nexusStorage.get([
    'archive_index',
    'recent_reports', 'pirate_recent_reports', 'mining_recent_reports', 'exp_recent_reports', 'xeno_recent_reports',
  ]);
  const idx = s.archive_index || {};
  const n = (idx.survey?.count || (s.recent_reports || []).length) +
            (idx.pirate?.count || (s.pirate_recent_reports || []).length) +
            (idx.mining?.count || (s.mining_recent_reports || []).length) +
            (idx.exp?.count || (s.exp_recent_reports || []).length) +
            (idx.xeno?.count || (s.xeno_recent_reports || []).length);
  if (!confirm(
    `确定根据已归档的 ${n} 条报告重新计算全部汇总统计吗？\n\n` +
    '采矿合金/稀有资源、被盗货物明细和采矿损失估值无法重建，将被重置。')) return;

  this.disabled = true;
  this.textContent = '正在重建…';
  try {
    await browser.runtime.sendMessage({ type: 'REBUILD_AGGREGATES' });
    await loadAll();
    this.textContent = '重建完成 ✓';
  } catch {
    this.textContent = '错误';
  } finally {
    setTimeout(() => { this.disabled = false; this.textContent = '重建统计'; }, 2000);
  }
});

// ── Export / Import ────────────────────────────────────────────────────────

document.getElementById('btn-export').addEventListener('click', async function () {
  const server = await globalThis.nexusStorage.getActiveServer();
  const data = await globalThis.nexusStorage.get(null);
  // JSON cannot represent Infinity (unlimited records cap) — store as 0.
  if (data.records_cap === Infinity) data.records_cap = 0;
  const payload = {
    nexus_accounting_backup: 1,
    exported_at: new Date().toISOString(),
    server_key: server.key,
    data,
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nexus-accounting-${server.key}-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  this.textContent = '已导出 ✓';
  setTimeout(() => { this.textContent = '导出 JSON'; }, 2000);
});

document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

// Shape checks on a backup before anything is cleared. Catches truncated or
// hand-edited files; unknown keys are allowed through untouched.
export function validateBackupData(data) {
  const arrays = [
    'recent_reports', 'daily', 'hourly', 'event_breakdown', 'seen_ids',
    'pirate_recent_reports', 'pirate_seen_ids', 'pirate_daily', 'pirate_outcomes',
    'mining_recent_reports', 'mining_seen_ids', 'mining_daily',
    'exp_recent_reports', 'exp_seen_ids', 'exp_daily',
    'xeno_recent_reports', 'xeno_seen_ids', 'xeno_daily',
    'survey_archive', 'pirate_archive', 'mining_archive', 'exp_archive', 'xeno_archive',
    'spy_reports', 'camp_scout_reports', 'debris_fields',
  ];
  const objects = [
    'totals', 'pirate_totals', 'mining_totals', 'exp_totals', 'xeno_totals',
    'expedition_totals', 'wormhole_totals', 'ships',
    'resources_lost', 'pirate_resources_lost', 'mining_resources_lost',
    'expedition_resources_lost', 'wormhole_resources_lost', 'xeno_resources_lost',
    'pirate_debris_total', 'archive_index',
  ];
  for (const k of arrays) {
    if (k in data && !Array.isArray(data[k])) throw new Error(`备份字段“${k}”应为列表`);
  }
  for (const k of objects) {
    if (k in data && (typeof data[k] !== 'object' || data[k] === null || Array.isArray(data[k]))) {
      throw new Error(`备份字段“${k}”应为对象`);
    }
  }
  if ('records_cap' in data && typeof data.records_cap !== 'number') {
    throw new Error('备份字段“records_cap”应为数字');
  }
}

document.getElementById('import-file').addEventListener('change', async function () {
  const file = this.files[0];
  this.value = '';                    // allow re-selecting the same file
  if (!file) return;

  const btn = document.getElementById('btn-import');
  try {
    const payload = JSON.parse(await file.text());
    if (!payload || payload.nexus_accounting_backup !== 1 || !payload.data || Array.isArray(payload.data) || typeof payload.data !== 'object') {
      throw new Error('该文件不是 Nexus Accounting 备份');
    }
    validateBackupData(payload.data);
    const server = await globalThis.nexusStorage.getActiveServer();
    const sourceServer = payload.server_key && globalThis.nexusStorage.servers[payload.server_key];
    const exportedAt = payload.exported_at ? new Date(payload.exported_at).toLocaleString() : '未知日期';
    const sourceLabel = sourceServer ? `${sourceServer.name}（${sourceServer.id}）` : '未标注服务器的旧版备份';
    if (!confirm(`确定用 ${sourceLabel} 在 ${exportedAt} 导出的备份替换 ${server.name}（${server.id}）的全部数据吗？\n\n操作前会先将当前数据快照写入 Downloads/NexusAccounting。`)) return;

    await browser.runtime.sendMessage({ type: 'BACKUP_NOW', reason: 'pre-import' });
    const data = payload.data;
    if (data.records_cap === 0) data.records_cap = Infinity;
    await globalThis.nexusStorage.clear();
    await globalThis.nexusStorage.set(data);
    await loadAll();
    btn.textContent = '已导入 ✓';
  } catch (e) {
    alert(`导入失败：${e.message}`);
    btn.textContent = '错误';
  } finally {
    setTimeout(() => { btn.textContent = '导入 JSON'; }, 2000);
  }
});

// ── Init ───────────────────────────────────────────────────────────────────

// On launch, if the stored report count is very large, offer a one-click purge
// down to the last 3 days. Runs once (not on every scrape-driven reload).
const PURGE_WARN_THRESHOLD = 10000;
async function maybeWarnStorage() {
  const all = await globalThis.nexusStorage.get([
    'archive_index', 'recent_reports', 'pirate_recent_reports', 'mining_recent_reports', 'exp_recent_reports', 'xeno_recent_reports',
  ]);
  const idx = all.archive_index || {};
  const total = (idx.survey?.count || all.recent_reports?.length || 0) +
    (idx.pirate?.count || all.pirate_recent_reports?.length || 0) +
    (idx.mining?.count || all.mining_recent_reports?.length || 0) +
    (idx.exp?.count || all.exp_recent_reports?.length || 0) +
    (idx.xeno?.count || all.xeno_recent_reports?.length || 0);
  if (total <= PURGE_WARN_THRESHOLD) return;
  if (!await confirmDialog(`⚠ 本地数据较大：已保存 ${total.toLocaleString()} 条报告。\n\n` +
    '是否清理旧数据，只保留最近 3 天？')) return;
  await browser.runtime.sendMessage({ type: 'PURGE_OLD', days: 3 });
  await loadAll();
}

positionControls();
loadAll().then(maybeWarnStorage);
maybeShowWhatsNew();

// Show the latest changelog section once after an update (flag set by the
// background's onInstalled handler).
async function maybeShowWhatsNew() {
  const manifestVersion = browser.runtime.getManifest().version;
  const { whatsnew_pending, whatsnew_seen_version, whatsnew_seen_build } =
    await globalThis.nexusStorage.get(['whatsnew_pending', 'whatsnew_seen_version', 'whatsnew_seen_build']);
  const buildLabel = currentBuildLabel();
  const buildVersion = currentBuildVersion();
  const targetVersion = buildVersion || whatsnew_pending || (whatsnew_seen_version !== manifestVersion ? manifestVersion : '');
  if (!whatsnew_pending && whatsnew_seen_build === buildLabel) return;
  if (!targetVersion) return;
  await globalThis.nexusStorage.remove('whatsnew_pending');
  await globalThis.nexusStorage.set({ whatsnew_seen_version: targetVersion, whatsnew_seen_build: buildLabel });
  await showUpdateNotes(targetVersion, `${buildLabel} 更新内容`);
}

globalThis.nexusStorage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.last_scrape || changes.totals || changes.pirate_totals)) loadAll();
});
