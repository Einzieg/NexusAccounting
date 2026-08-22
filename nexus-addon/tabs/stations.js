// Alliance station resource view. The background service worker enumerates
// stations from the current alliance's territory response, then reads each
// station detail with bounded concurrency through the logged-in game tab.

import { fmt, makeStatCard } from '../common.js';

const RESOURCE_COLUMNS = [
  { field: 'ore', label: '矿石', valueClass: 'ore' },
  { field: 'silicates', label: '硅酸盐', valueClass: 'silicates' },
  { field: 'hydrogen', label: '氢', valueClass: 'hydrogen' },
  { field: 'alloys', label: '合金', valueClass: 'alloys' },
  { field: 'cryoIce', label: '冰晶', valueClass: 'rare' },
  { field: 'quantumDust', label: '量子尘', valueClass: 'rare' },
  { field: 'plasmaCore', label: '等离子核', valueClass: 'rare' },
  { field: 'bioExtract', label: '生物萃取物', valueClass: 'rare' },
  { field: 'darkMatter', label: '暗物质', valueClass: 'rare' },
  { field: 'antimatter', label: '反物质', valueClass: 'rare' },
];
const PAGE_SIZE = 100;
const AUTO_REFRESH_MS = 30000;

let stations = [];
let stationMeta = {};
let serverOrigin = '';
let currentPage = 1;
let loading = false;
let loadedAt = 0;

const byId = id => document.getElementById(id);

byId('stations-refresh').addEventListener('click', () => loadStationResources(true));
byId('stations-search').addEventListener('input', () => {
  currentPage = 1;
  renderStationResources();
});
byId('stations-zone').addEventListener('change', () => {
  currentPage = 1;
  renderStationResources();
});
byId('stations-prev').addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    renderStationResources();
  }
});
byId('stations-next').addEventListener('click', () => {
  const pages = Math.max(1, Math.ceil(filteredStations().length / PAGE_SIZE));
  if (currentPage < pages) {
    currentPage++;
    renderStationResources();
  }
});

export function initStationsTab() {
  loadStationResources();
}

async function loadStationResources(force = false) {
  if (loading || (!force && Date.now() - loadedAt < AUTO_REFRESH_MS)) return;
  loading = true;
  const refresh = byId('stations-refresh');
  const progress = byId('stations-progress');
  refresh.disabled = true;
  progress.textContent = '正在读取联盟领土和站点资源… 站点较多时可能需要几十秒。';
  try {
    const [data, server] = await Promise.all([
      browser.runtime.sendMessage({ type: 'GET_ALLIANCE_STATION_RESOURCES', force }),
      globalThis.nexusStorage.getActiveServer(),
    ]);
    if (data?.error) {
      progress.textContent = `错误：${data.error}`;
      return;
    }
    stations = data?.stations || [];
    stationMeta = data || {};
    serverOrigin = server.origin;
    currentPage = 1;
    loadedAt = Date.now();
    const failed = stations.filter(station => station.error).length;
    const alliance = data.alliance?.tag
      ? `[${data.alliance.tag}] ${data.alliance.name || ''}`.trim()
      : '当前联盟';
    progress.textContent = `${alliance} · ${data.territoryCount || 0} 个领土 · ${stations.length} 个站点` +
      `${failed ? ` · ${failed} 个读取失败` : ''} · ${new Date(data.updatedAt || loadedAt).toLocaleTimeString()} 同步`;
    renderStationResources();
  } catch (error) {
    progress.textContent = `错误：${error.message || error}`;
  } finally {
    loading = false;
    refresh.disabled = false;
  }
}

function filteredStations() {
  const query = byId('stations-search').value.trim().toLocaleLowerCase();
  const zone = byId('stations-zone').value;
  return stations.filter(station => {
    if (zone !== 'all' && String(station.securityZone || '').toLowerCase() !== zone) return false;
    if (!query) return true;
    return [station.id, station.name, station.systemName, station.sectorName]
      .some(value => String(value ?? '').toLocaleLowerCase().includes(query));
  });
}

function renderStationResources() {
  const list = filteredStations();
  renderStats(list);
  renderTable(list);
}

function wholeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function renderStats(list) {
  const stats = byId('stations-stats');
  stats.textContent = '';
  stats.append(
    makeStatCard('显示站点', `${fmt(list.length)} / ${fmt(stations.length)}`, 'missions'),
    makeStatCard('联盟领土', fmt(stationMeta.territoryCount || 0), 'rare'),
  );
  for (const resource of RESOURCE_COLUMNS) {
    const total = list.reduce((sum, station) =>
      sum + (station.error ? 0 : wholeNumber(station.resources?.[resource.field])), 0);
    stats.appendChild(makeStatCard(resource.label, fmt(total), resource.valueClass));
  }
}

function numericCell(value, title = '') {
  const cell = document.createElement('td');
  cell.className = 'station-resource-number';
  const number = wholeNumber(value);
  cell.textContent = number ? fmt(number) : '—';
  if (title) cell.title = title;
  return cell;
}

function textCell(value, className = '') {
  const cell = document.createElement('td');
  cell.className = className;
  cell.textContent = value || '—';
  return cell;
}

function renderTable(list) {
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(1, currentPage), pages);
  byId('stations-page').textContent = `第 ${currentPage} / ${pages} 页（共 ${list.length} 个站点）`;
  byId('stations-prev').disabled = currentPage <= 1;
  byId('stations-next').disabled = currentPage >= pages;

  const tbody = byId('stations-tbody');
  tbody.textContent = '';
  const rows = list.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  if (!rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 17;
    cell.className = 'zero';
    cell.textContent = stations.length ? '没有符合筛选条件的站点。' : '联盟领土内没有可读取的站点。';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  for (const station of rows) {
    const row = document.createElement('tr');
    row.appendChild(textCell(`#${station.id}`, 'station-resource-id'));

    const nameCell = document.createElement('td');
    const link = document.createElement('a');
    link.className = 'station-resource-link';
    link.href = `${serverOrigin}/stations/${station.id}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = station.name || `站点 #${station.id}`;
    nameCell.appendChild(link);
    row.appendChild(nameCell);

    row.append(
      textCell(station.systemName),
      textCell(station.sectorName),
      textCell(String(station.securityZone || '').toUpperCase(),
        `station-resource-zone zone-${String(station.securityZone || 'unknown').toLowerCase()}`),
    );

    if (station.error) {
      row.className = 'station-resource-error-row';
      const errorCell = document.createElement('td');
      errorCell.colSpan = RESOURCE_COLUMNS.length + 2;
      errorCell.textContent = `读取失败：${station.error}`;
      row.appendChild(errorCell);
    } else {
      for (const resource of RESOURCE_COLUMNS) {
        row.appendChild(numericCell(station.resources?.[resource.field] || 0));
      }
      row.append(
        numericCell(station.basicStorage, '矿石、硅酸盐、氢、合金分别使用此容量'),
        numericCell(station.rareStorage, '每种稀有资源分别使用此容量'),
      );
    }
    tbody.appendChild(row);
  }
}
