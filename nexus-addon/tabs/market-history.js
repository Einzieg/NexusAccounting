// Standalone market trade analysis tab. History is fetched when this view is
// entered, with a short cooldown to keep the live market tab lightweight.

import { fmt, makeStatCard, marketTradeNet, resourceWeight, uiLabel, weightsTooltip } from '../common.js';

let history = [];
let historyUserId = null;
let historyPage = 1;
let historyPlayerNames = {};
let historyLoading = false;
let historyLoadedAt = 0;
const HISTORY_PER_PAGE = 20;
const HISTORY_AUTO_REFRESH_MS = 30000;

const res = value => uiLabel(value);

document.getElementById('m-history-refresh').addEventListener('click', () => loadHistory(true));
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

export function initMarketHistoryTab() {
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

async function loadHistory(force = false) {
  if (historyLoading || (!force && Date.now() - historyLoadedAt < HISTORY_AUTO_REFRESH_MS)) return;
  historyLoading = true;
  const status = document.getElementById('m-history-progress');
  const refresh = document.getElementById('m-history-refresh');
  status.textContent = '正在加载历史…';
  refresh.disabled = true;
  try {
    const [data, me] = await Promise.all([
      browser.runtime.sendMessage({ type: 'GET_MARKET_TRADES' }),
      browser.runtime.sendMessage({ type: 'GET_AUTH_ME' }),
    ]);
    if (data?.error) { status.textContent = `错误：${data.error}`; return; }
    if (me?.error || !me?.user) { status.textContent = `错误：${me?.error || '无法识别当前玩家'}`; return; }
    historyUserId = me.user.id ?? me.user.userId;
    if (historyUserId == null) { status.textContent = '错误：玩家 ID 不可用'; return; }
    history = data.trades || [];
    const counterpartIds = history.map(trade =>
      String(trade.sellerId) === String(historyUserId) ? trade.buyerId : trade.sellerId);
    const players = await browser.runtime.sendMessage({ type: 'GET_PLAYER_NAMES', ids: counterpartIds })
      .catch(() => ({ names: {} }));
    historyPlayerNames = players?.names || {};
    history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    historyPage = 1;
    historyLoadedAt = Date.now();
    status.textContent = `${history.length} 笔成交 · ${new Date(historyLoadedAt).toLocaleTimeString()} 同步`;
    renderHistory();
  } catch (error) {
    status.textContent = `错误：${error.message || error}`;
  } finally {
    historyLoading = false;
    refresh.disabled = false;
  }
}

function renderHistory() {
  document.getElementById('m-weight-note').textContent = weightsTooltip();
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
    const counterpartId = net.soldByMe ? trade.buyerId : trade.sellerId;
    const counterpart = historyPlayerNames[String(counterpartId)] ||
      (counterpartId != null ? `玩家 #${counterpartId}` : '—');
    const values = [
      new Date(trade.createdAt).toLocaleString(),
      net.soldByMe ? '卖出' : '买入',
      `${fmt(net.paid)} ${res(net.paidResource)}`,
      `${fmt(net.received)} ${res(net.receivedResource)}`,
      net.fee ? `${fmt(net.fee)} ${res(net.receivedResource)}` : '—',
      counterpart,
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
