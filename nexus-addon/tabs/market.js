// Market tab: every open market offer, filterable by hub and by the resource
// you want to buy (offered) / sell (paid), sortable by exchange ratio.
//
// To take any order you give its requestResource and receive its offerResource,
// so "buy" filters on offerResource and "sell" on requestResource. Ratio is
// received-per-given (offerAmount / requestAmount) — higher is a better deal.

import { applySort, attachSortable, fmt, makeStatCard, marketTradeNet, resourceWeight, uiLabel } from '../common.js';

let iconBase = '';
// All tradable resources, always shown as filter icons (basic first, then exotic).
const RESOURCES = ['ore', 'silicates', 'hydrogen', 'alloys', 'cryo_ice',
  'quantum_dust', 'plasma_core', 'bio_extract', 'dark_matter', 'antimatter'];
// Per-resource colours for the Offering / For amounts in the table.
const RES_COLOR = {
  ore: '#f0883e', silicates: '#56d364', hydrogen: '#79c0ff', alloys: '#e3b341',
  cryo_ice: '#a5d6ff', quantum_dust: '#d2a8ff', plasma_core: '#ff7b72',
  bio_extract: '#7ee787', dark_matter: '#bc8cff', antimatter: '#ffa657',
};
// Mean ratio after dropping the worst 5% (lowball listings nobody trades), so
// the baseline reflects the real market rather than junk orders.
const trimmedMean = nums => {
  if (!nums.length) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const kept = s.slice(Math.floor(s.length * 0.05));   // cut the lowest 5% of ratios
  return kept.reduce((a, b) => a + b, 0) / kept.length;
};

// Baseline exchange ratio per offer→request pair, across all current-market
// orders. A row is judged good/bad by how its ratio compares to its baseline.
function pairBaselines(list) {
  const groups = {};
  for (const o of list) {
    const k = `${o.offerResource}>${o.requestResource}`;
    (groups[k] = groups[k] || []).push(o.ratio);
  }
  const base = {};
  for (const k in groups) base[k] = trimmedMean(groups[k]);
  return base;
}

let inited = false;
let orders = [];
let buyFilter = new Set(), sellFilter = new Set();   // empty = any; multi-select
let allianceMembers = new Set();   // userIds of your alliance — seller shown green
export const marketSort = { key: 'rate', dir: 1 };   // cheapest cost-per-unit first

const res = s => uiLabel(s);

let source = 'market';   // 'market' | 'alliance'
let history = [];
let historyUserId = null;
let historyPage = 1;
let historyHubNames = {};
const HISTORY_PER_PAGE = 20;

attachSortable('m-head', marketSort, () => renderMarket());
document.getElementById('m-refresh').addEventListener('click', () => loadOrders());
document.getElementById('m-clear').addEventListener('click', () => {
  buyFilter.clear(); sellFilter.clear();
  document.getElementById('m-ratio-wanted').value = '';
  drawIcons('m-buy'); drawIcons('m-sell');
  renderMarket();
});
document.getElementById('m-ratio-wanted').addEventListener('input', () => renderMarket());
document.getElementById('m-source').addEventListener('change', e => {
  source = e.target.checked ? 'alliance' : 'market';
  loadOrders();
});
document.getElementById('m-history-refresh').addEventListener('click', () => loadHistory());
document.getElementById('m-history-range').addEventListener('change', () => {
  historyPage = 1;
  renderHistory();
});
document.getElementById('m-history-prev').addEventListener('click', () => {
  if (historyPage > 1) { historyPage--; renderHistory(); }
});
document.getElementById('m-history-next').addEventListener('click', () => {
  const pages = Math.max(1, Math.ceil(filteredHistory().length / HISTORY_PER_PAGE));
  if (historyPage < pages) { historyPage++; renderHistory(); }
});

export async function initMarketTab() {
  if (inited) return;
  inited = true;
  iconBase = `${(await globalThis.nexusStorage.getActiveServer()).origin}/images/resources/`;
  // Alliance membership colours alliance sellers green; reused across sources.
  browser.runtime.sendMessage({ type: 'GET_ALLIANCE' }).then(a => {
    allianceMembers = new Set((a && !a.error && a.memberIds) || []);
    renderMarket();
  });
  loadOrders();
  loadHistory();
}

function filteredHistory() {
  const days = Number(document.getElementById('m-history-range').value);
  if (!days) return history;
  const now = new Date();
  const cutoff = days === 1
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    : Date.now() - days * 86400000;
  return history.filter(trade => new Date(trade.createdAt).getTime() >= cutoff);
}

async function loadHistory() {
  const status = document.getElementById('m-history-progress');
  status.textContent = '正在加载历史…';
  const [data, me, hubs] = await Promise.all([
    browser.runtime.sendMessage({ type: 'GET_MARKET_TRADES' }),
    browser.runtime.sendMessage({ type: 'GET_AUTH_ME' }),
    browser.runtime.sendMessage({ type: 'GET_HUBS' }),
  ]);
  if (data?.error) { status.textContent = `错误：${data.error}`; return; }
  if (hubs?.error) { status.textContent = `错误：${hubs.error}`; return; }
  if (me?.error || !me?.user) { status.textContent = `错误：${me?.error || '无法识别当前玩家'}`; return; }
  historyUserId = me.user.id ?? me.user.userId;
  if (historyUserId == null) { status.textContent = '错误：玩家 ID 不可用'; return; }
  history = data.trades || [];
  historyHubNames = Object.fromEntries((hubs.hubs || []).map(hub => [hub.id, hub.name]));
  history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  historyPage = 1;
  status.textContent = `${history.length} 笔成交`;
  renderHistory();
}

function renderHistory() {
  const list = filteredHistory();
  const flow = {};
  let profit = 0;
  let fees = 0;
  let bought = 0;
  let sold = 0;
  const normalized = list.map(trade => {
    const net = marketTradeNet(trade, historyUserId);
    flow[net.paidResource] = (flow[net.paidResource] || 0) - net.paid;
    flow[net.receivedResource] = (flow[net.receivedResource] || 0) + net.received;
    profit += net.oreEquivalent;
    fees += net.fee * resourceWeight(net.receivedResource);
    if (net.soldByMe) sold++; else bought++;
    return { trade, net };
  });

  const stats = document.getElementById('m-profit-stats');
  stats.textContent = '';
  const profitCard = makeStatCard(
    '估算盈利（矿石等值）',
    `${profit >= 0 ? '+' : ''}${fmt(Math.round(profit))}`,
    '',
    profit >= 0 ? 'color:#56d364' : 'color:#ff7b72',
  );
  profitCard.title = '各笔交易先从收到数量中扣除对应手续费，再减去支付资源的等值；未计入运输燃料。';
  stats.append(
    profitCard,
    makeStatCard('成交笔数', fmt(list.length), 'missions'),
    makeStatCard('买入 / 卖出', `${fmt(bought)} / ${fmt(sold)}`, 'hydrogen'),
    makeStatCard('手续费（已计入盈亏）', fmt(Math.round(fees)), 'alloys'),
  );

  const flowBox = document.getElementById('m-resource-flows');
  flowBox.textContent = '';
  const flowEntries = Object.entries(flow).filter(([, value]) => value !== 0)
    .sort((a, b) => Math.abs(b[1] * resourceWeight(b[0])) - Math.abs(a[1] * resourceWeight(a[0])));
  if (!flowEntries.length) {
    flowBox.textContent = '当前范围内没有成交。';
    flowBox.style.color = '#484f58';
  } else {
    flowBox.style.color = '';
    for (const [resource, value] of flowEntries) {
      const chip = document.createElement('span');
      chip.className = 'market-flow-chip';
      const label = document.createElement('span');
      label.textContent = res(resource);
      const amount = document.createElement('strong');
      amount.className = value >= 0 ? 'positive' : 'negative';
      amount.textContent = `${value >= 0 ? '+' : ''}${fmt(value)}`;
      chip.append(label, amount);
      flowBox.appendChild(chip);
    }
  }

  const pages = Math.max(1, Math.ceil(normalized.length / HISTORY_PER_PAGE));
  historyPage = Math.min(Math.max(1, historyPage), pages);
  document.getElementById('m-history-page').textContent = `第 ${historyPage} / ${pages} 页（共 ${normalized.length} 笔）`;
  document.getElementById('m-history-prev').disabled = historyPage <= 1;
  document.getElementById('m-history-next').disabled = historyPage >= pages;

  const tbody = document.getElementById('m-history-tbody');
  tbody.textContent = '';
  const pageRows = normalized.slice((historyPage - 1) * HISTORY_PER_PAGE, historyPage * HISTORY_PER_PAGE);
  if (!pageRows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7; cell.className = 'zero'; cell.textContent = '当前范围内没有成交记录。';
    row.appendChild(cell); tbody.appendChild(row);
    return;
  }

  for (const { trade, net } of pageRows) {
    const row = document.createElement('tr');
    const fromHub = trade.hubName || historyHubNames[trade.hubId] || (trade.hubId != null ? `枢纽 ${trade.hubId}` : '—');
    const toHub = trade.buyerHubName || historyHubNames[trade.buyerHubId] || '';
    const hub = toHub && toHub !== fromHub ? `${fromHub} → ${toHub}` : fromHub;
    const values = [
      new Date(trade.createdAt).toLocaleString(),
      net.soldByMe ? '卖出' : '买入',
      `${fmt(net.paid)} ${res(net.paidResource)}`,
      `${fmt(net.received)} ${res(net.receivedResource)}`,
      net.fee ? `${fmt(net.fee)} ${res(net.receivedResource)}` : '—',
      hub,
      `${net.oreEquivalent >= 0 ? '+' : ''}${fmt(Math.round(net.oreEquivalent))}`,
    ];
    values.forEach((value, index) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      if (index === 1) cell.style.color = net.soldByMe ? '#e3b341' : '#79c0ff';
      if (index === 6) cell.className = net.oreEquivalent >= 0 ? 'market-profit-positive' : 'market-profit-negative';
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  }
}

async function loadOrders() {
  const alliance = source === 'alliance';
  const status = document.getElementById('m-progress');
  status.textContent = `正在加载${alliance ? '联盟交易' : '市场'}订单…`;
  document.getElementById('m-hub-col').textContent = alliance ? '星系' : '枢纽';

  const toOrder = (o, hub) => ({
    ...o, hub,
    ratio: o.requestAmount ? o.offerAmount / o.requestAmount : 0,
    rate: o.offerAmount ? o.requestAmount / o.offerAmount : 0,   // requested per 1 offered
  });

  if (alliance) {
    const data = await browser.runtime.sendMessage({ type: 'GET_ALLIANCE_ORDERS' });
    if (data.error) { status.textContent = `错误：${data.error}`; return; }
    orders = (data.orders || []).map(o => toOrder(o, o.systemName || `#${o.id}`));
  } else {
    const [data, hubs] = await Promise.all([
      browser.runtime.sendMessage({ type: 'GET_MARKET_ORDERS' }),
      browser.runtime.sendMessage({ type: 'GET_HUBS' }),
    ]);
    if (data.error) { status.textContent = `错误：${data.error}`; return; }
    const hubNames = {};
    for (const h of (hubs?.hubs || [])) hubNames[h.id] = h.name;
    orders = (data.orders || []).map(o => toOrder(o, hubNames[o.hubId] || `枢纽 ${o.hubId}`));
  }

  buyFilter.clear(); sellFilter.clear();
  drawIcons('m-buy');
  drawIcons('m-sell');
  status.textContent = `${orders.length} 个未成交订单。`;
  renderMarket();
}

// Clickable resource-icon toggles. Click an icon to filter by it, click the
// selected one again to clear. Broken image URLs fall back to the alt text.
function drawIcons(id) {
  const box = document.getElementById(id);
  box.textContent = '';
  const set = id === 'm-buy' ? buyFilter : sellFilter;
  for (const v of RESOURCES) {
    const img = document.createElement('img');
    img.className = 'res-icon' + (set.has(v) ? ' sel' : '');
    img.src = `${iconBase}${v}.webp`;
    img.alt = res(v);
    img.title = res(v);
    img.addEventListener('click', () => {
      if (set.has(v)) set.delete(v); else set.add(v);
      drawIcons(id);
      renderMarket();
    });
    box.appendChild(img);
  }
}

export function renderMarket() {
  const ratioWanted = parseFloat(document.getElementById('m-ratio-wanted').value);
  const rows = applySort('m-head', orders.filter(o =>
    (!buyFilter.size || buyFilter.has(o.offerResource)) &&
    (!sellFilter.size || sellFilter.has(o.requestResource)) &&
    (isNaN(ratioWanted) || o.ratio >= ratioWanted)), marketSort, 'id');

  const tbody = document.getElementById('m-tbody');
  tbody.textContent = '';
  document.getElementById('m-count').textContent = `${rows.length} 个订单`;
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6; td.style.color = '#484f58';
    td.textContent = orders.length ? '没有符合当前筛选条件的订单。' : '当前没有未成交订单。';
    tr.appendChild(td); tbody.appendChild(tr);
    return;
  }
  const med = pairBaselines(orders);
  for (const o of rows) {
    const tr = document.createElement('tr');
    const n = o.rate >= 100 ? Math.round(o.rate) : Math.round(o.rate * 100) / 100;
    const cells = [
      o.hub, o.username,
      `${fmt(o.offerRemaining ?? o.offerAmount)} ${res(o.offerResource)}`,
      `${fmt(o.requestAmount)} ${res(o.requestResource)}`,
      `1 ${res(o.offerResource)} 兑换 ${n.toLocaleString()} ${res(o.requestResource)}`,
      o.ratio.toFixed(3),
    ];
    const colColor = { 2: RES_COLOR[o.offerResource], 3: RES_COLOR[o.requestResource], 5: '#e3b341' };
    if (allianceMembers.has(o.userId)) colColor[1] = '#7ee787';   // alliance seller

    // Tint by deal quality vs the market: this ratio ÷ the pair's baseline ratio
    // (trimmed mean). Above baseline = better-than-typical deal (green), below = red.
    const m = med[`${o.offerResource}>${o.requestResource}`];
    if (m && o.ratio) {
      const score = o.ratio / m;
      if (score > 1) tr.style.background = `rgba(88,130,96,${0.2 + 0.5 * Math.min(1, score - 1)})`;
      else if (score < 1) tr.style.background = `rgba(150,96,94,${0.2 + 0.5 * Math.min(1, 1 - score)})`;
    }
    cells.forEach((v, i) => {
      const td = document.createElement('td');
      td.textContent = v;
      if (colColor[i]) td.style.color = colColor[i];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
}
