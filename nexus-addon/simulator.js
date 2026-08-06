// Combat simulator UI. The battle engine (tables, modifiers, Monte Carlo)
// lives in engine.js, shared between this page and the node test suite.

import './server-storage.js';
import {
  shipDefs, setShipDefs, runSimulations, simulateOnce, computeMods,
  NO_MODS, TECHS, TECH_MAX_LEVEL, lossesToResources,
} from './engine.js';
import {
  updateDistanceFromCoords, loadIntelReports, populatePlanetPicker, _resolvedDistanceAU,
} from './simulator-intel.js';
import { uiLabel } from './common.js';
import './simulator-validate.js';   // side effect: wires the Validate button

export function fmt(n) {
  return Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

const GROUP_ORDER = ['combat', 'special', 'recon', 'utility'];
const GROUP_LABELS = { combat: '战斗舰船', special: '特殊舰船', recon: '侦察舰船', utility: '通用舰船' };

function buildFleetInputs(tbodyId, side) {
  const tbody = document.getElementById(tbodyId);
  tbody.textContent = '';
  const defs = Object.values(shipDefs).sort((a, b) =>
    GROUP_ORDER.indexOf(a.shipClass) - GROUP_ORDER.indexOf(b.shipClass) || a.sortOrder - b.sortOrder);

  let lastGroup = null;
  for (const def of defs) {
    if (def.shipClass !== lastGroup) {
      lastGroup = def.shipClass;
      const tr = document.createElement('tr');
      tr.className = 'ship-group';
      const td = document.createElement('td');
      td.colSpan = 3;
      td.textContent = GROUP_LABELS[def.shipClass] || def.shipClass;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.className = 'ship-name';
    tdName.textContent = def.name;

    const tdStats = document.createElement('td');
    tdStats.className = 'ship-stats';
    tdStats.dataset.statsSide = side;
    tdStats.dataset.key = def.key;
    tdStats.textContent = statText(def, NO_MODS);

    const tdInput = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number';
    input.min = 0;
    input.value = 0;
    input.dataset.side = side;
    input.dataset.key = def.key;
    const surv = document.createElement('span');
    surv.className = 'survivors';
    surv.dataset.survSide = side;
    surv.dataset.key = def.key;
    tdInput.append(input, surv);

    tr.append(tdName, tdStats, tdInput);
    tbody.appendChild(tr);
  }
}

function readFleet(side) {
  const fleet = {};
  document.querySelectorAll(`input[data-side="${side}"][data-key]`).forEach(input => {
    const qty = parseInt(input.value, 10);
    if (qty > 0) fleet[input.dataset.key] = qty;
  });
  return fleet;
}

// Stat line for a ship row, with research modifiers applied (same math as the engine).
function statText(def, mods) {
  const attackBonus = (mods.weapon[def.weaponType] || 0) + mods.weaponAll + (mods.ship[def.key] || 0);
  const atk = Math.round(def.attack * (1 + attackBonus));
  const hp = Math.round(def.hp * (1 + mods.hull));
  const sh = Math.round(def.shieldHp * (1 + mods.shield));
  const dr = mods.damageReduction > 0 ? ` · 减伤 ${Math.round(mods.damageReduction * 100)}%` : '';
  return `攻击 ${atk} · 耐久 ${hp} · 护盾 ${sh}${dr}` +
    (def.weaponType ? ` · ${uiLabel(def.weaponType)}` : '') + ` · ${uiLabel(def.armorType)}`;
}

// Refresh the stat line of every ship row on one side after a tech change.
export function updateFleetStats(side) {
  const mods = readMods(side);
  document.querySelectorAll(`td.ship-stats[data-stats-side="${side}"]`).forEach(td => {
    const def = shipDefs[td.dataset.key];
    if (!def) return;
    const text = statText(def, mods);
    td.textContent = text;
    // Highlight only ships whose stats actually changed
    td.style.color = text !== statText(def, NO_MODS) ? '#7ee787' : '';
  });
}

function buildTechInputs(containerId, side) {
  const container = document.getElementById(containerId);
  container.textContent = '';
  let lastGroup = null;
  for (const tech of TECHS) {
    if (tech.group !== lastGroup) {
      lastGroup = tech.group;
      const g = document.createElement('div');
      g.className = 'tech-group';
      g.textContent = tech.group;
      container.appendChild(g);
    }
    const label = document.createElement('span');
    label.className = 'tech-label';
    const effectText = e => e.applies === 'ship' ? `+${(e.perLvl * 100).toFixed(0)}% ${uiLabel(e.ship)}伤害`
      : e.applies === 'weapon' ? `+${(e.perLvl * 100).toFixed(0)}% ${uiLabel(e.weapon)}伤害`
      : e.applies === 'weapon_all' ? `+${(e.perLvl * 100).toFixed(0)}% 全部武器伤害`
      : e.applies === 'hull' ? `+${(e.perLvl * 100).toFixed(0)}% 舰船耐久`
      : e.applies === 'shield' ? `+${(e.perLvl * 100).toFixed(0)}% 护盾耐久`
      : `${(e.perLvl * 100).toFixed(0)}% 伤害减免`;
    label.title = `每级：${effectText(tech)}` + (tech.also ? `，并且${effectText(tech.also)}` : '');
    label.textContent = tech.name;

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'tech-input';
    input.min = 0;
    input.max = TECH_MAX_LEVEL;
    input.value = 0;
    input.dataset.techSide = side;
    input.dataset.tech = tech.key;
    input.addEventListener('input', () => updateFleetStats(side));

    container.append(label, input);
  }
}

// Research level inputs for one side → mods for the engine.
function readMods(side) {
  const levels = {};
  document.querySelectorAll(`input[data-tech-side="${side}"]`).forEach(input => {
    const lvl = Math.min(TECH_MAX_LEVEL, Math.max(0, parseInt(input.value, 10) || 0));
    levels[input.dataset.tech] = lvl;
  });
  return computeMods(levels);
}

export function makeStatCard(label, value, valueClass) {
  const card = document.createElement('div');
  card.className = 'stat-card';
  const labelDiv = document.createElement('div');
  labelDiv.className = 'label';
  labelDiv.textContent = label;
  const valueDiv = document.createElement('div');
  valueDiv.className = valueClass ? `value ${valueClass}` : 'value';
  valueDiv.textContent = value;
  card.append(labelDiv, valueDiv);
  return card;
}

function renderResults(result, opts) {
  document.getElementById('results').style.display = '';

  const pct = n => `${(n / opts.sims * 100).toFixed(1)}%`;
  const o = result.outcomes;
  const outcomeEl = document.getElementById('outcome-stats');
  outcomeEl.textContent = '';
  outcomeEl.append(
    makeStatCard('进攻方胜利', pct(o.attacker_won), 'win-attacker'),
    makeStatCard('防守方胜利', pct(o.defender_won), 'win-defender'),
    makeStatCard('防守方坚守（达到回合上限）', pct(o.defender_held), 'win-defender'),
    makeStatCard('同归于尽', pct(o.mutual_destruction), 'win-draw'),
    makeStatCard('平均回合数', result.avgRounds.toFixed(1), 'missions'),
  );

  renderLossTable('attacker-losses', result.attackerLosses);
  renderLossTable('defender-losses', result.defenderLosses);
  updateSurvivors('attacker', result.attackerLosses);
  updateSurvivors('defender', result.defenderLosses);
  renderCostCards('attacker-cost', result.attackerLosses);
  renderCostCards('defender-cost', result.defenderLosses);

  // Debris from both sides' destroyed ships
  const a = lossesToResources(result.attackerLosses);
  const d = lossesToResources(result.defenderLosses);
  const debrisEl = document.getElementById('debris-stats');
  debrisEl.textContent = '';
  debrisEl.append(
    makeStatCard('残骸矿石',   fmt((a.ore + d.ore) * opts.debrisRate),             'ore'),
    makeStatCard('残骸硅酸盐', fmt((a.silicates + d.silicates) * opts.debrisRate), 'silicates'),
    makeStatCard('残骸合金',   fmt((a.alloys + d.alloys) * opts.debrisRate),       'alloys'),
  );

  renderFuel(result.attackerLosses, opts);
}

// One representative run, shown round by round (like the in-game report).
function renderSampleBattle(attackerFleet, defenderFleet, opts) {
  const tbody = document.getElementById('rounds-log');
  tbody.textContent = '';
  const sample = simulateOnce(attackerFleet, defenderFleet, { ...opts, trace: true });
  for (const r of (sample.trace || [])) {
    const tr = document.createElement('tr');
    const lost = [
      r.attackerLost ? `进攻方 ${r.attackerLost}` : '',
      r.defenderLost ? `防守方 ${r.defenderLost}` : '',
    ].filter(Boolean).join(', ') || '—';
    const cells = [
      `${r.round}`,
      `${r.attackerShips}`, `${r.attackerHpPct}%`,
      `${r.defenderShips}`, `${r.defenderHpPct}%`,
      lost,
    ];
    cells.forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
    tbody.appendChild(tr);
  }
  const note = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 6;
  td.style.cssText = 'color:#8b949e;font-size:0.75rem;';
  td.textContent = `示例结果：${uiLabel(sample.outcome)}，共 ${sample.rounds} 回合（单次运行会有波动，请以上方统计均值为准）。`;
  note.appendChild(td);
  tbody.appendChild(note);
}

function renderFuel(attackerLosses, opts) {
  const el = document.getElementById('fuel-stats');
  el.textContent = '';
  let rate = 0, missing = false;
  for (const [key, l] of Object.entries(attackerLosses)) {
    const def = shipDefs[key];
    if (!def) continue;
    if (!def.fuelRate) missing = true;
    rate += (def.fuelRate || 0) * l.sent;
  }
  const mult = opts.roundTrip ? 2 : 1;
  const total = rate * opts.distanceAU * mult;
  el.append(
    makeStatCard(`总燃料${opts.roundTrip ? '（往返）' : '（单程）'}`,
      opts.distanceAU > 0 ? fmt(total) : '— 请设置出发与目标星系', 'hydrogen'),
    makeStatCard('舰队燃料系数总和', fmt(rate), 'hydrogen'),
  );
  if (missing) {
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:0.75rem;color:#8b949e;margin-top:6px;';
    hint.textContent = '部分舰船尚无燃料系数，请打开游戏并点击“立即采集”刷新舰船数据。';
    el.appendChild(hint);
  }
}

// Show average survivors next to each ship quantity input after a run.
function updateSurvivors(side, losses) {
  document.querySelectorAll(`.survivors[data-surv-side="${side}"]`).forEach(span => {
    const l = losses[span.dataset.key];
    if (!l) {
      span.textContent = '';
      return;
    }
    const alive = l.sent - l.lost;
    span.textContent = `→ ${alive.toFixed(1)} 存活`;
    span.style.color = alive >= l.sent * 0.99 ? '#56d364' : alive > 0 ? '#e3b341' : '#ff7b72';
  });
}

function renderLossTable(tbodyId, losses) {
  const tbody = document.getElementById(tbodyId);
  tbody.textContent = '';
  for (const [key, l] of Object.entries(losses)) {
    const def = shipDefs[key];
    const tr = document.createElement('tr');
    const survival = l.sent ? ((l.sent - l.lost) / l.sent * 100).toFixed(0) : 0;
    [def ? def.name : key, fmt(l.sent), l.lost.toFixed(1), `${survival}%`].forEach(v => {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  if (!Object.keys(losses).length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.style.color = '#484f58';
    td.textContent = '无舰船';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

function renderCostCards(elId, losses) {
  const cost = lossesToResources(losses);
  const el = document.getElementById(elId);
  el.textContent = '';
  el.append(
    makeStatCard('损失矿石',   fmt(cost.ore),       'ore'),
    makeStatCard('损失硅酸盐', fmt(cost.silicates), 'silicates'),
    makeStatCard('损失氢',     fmt(cost.hydrogen),  'hydrogen'),
    makeStatCard('损失合金',   fmt(cost.alloys),    'alloys'),
  );
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  const status = document.getElementById('sim-status');
  const { ships } = await globalThis.nexusStorage.get('ships');

  const defs = Object.values(ships || {});
  if (!defs.length || defs.some(d => d.hp === undefined)) {
    status.textContent = '缺少舰船战斗数据，请先打开仪表盘并点击“立即采集”。';
    status.className = 'error';
    return;
  }

  const map = {};
  for (const def of defs) map[def.key] = def;
  setShipDefs(map);

  buildFleetInputs('attacker-ships', 'attacker');
  buildFleetInputs('defender-ships', 'defender');
  buildTechInputs('attacker-techs', 'attacker');
  buildTechInputs('defender-techs', 'defender');
  await Promise.all([loadIntelReports(), populatePlanetPicker()]);
  status.textContent = `已加载 ${defs.length} 种舰船。`;
}

document.getElementById('btn-run').addEventListener('click', async function() {
  const attackerFleet = readFleet('attacker');
  const defenderFleet = readFleet('defender');
  const status = document.getElementById('sim-status');
  const hasDefense = ['def-missile','def-laser','def-railgun','def-plasma','def-ion','def-ew']
    .some(id => (parseInt(document.getElementById(id).value, 10) || 0) > 0);
  if (!Object.keys(attackerFleet).length || (!Object.keys(defenderFleet).length && !hasDefense)) {
    status.textContent = '进攻方必须配置舰船；防守方必须配置舰船或防御设施等级。';
    return;
  }
  status.textContent = '模拟中…';
  await updateDistanceFromCoords();
  const distanceAU = _resolvedDistanceAU;

  const opts = {
    sims: Math.min(10000, Math.max(1, parseInt(document.getElementById('opt-sims').value, 10) || 100)),
    maxRounds: Math.min(20, Math.max(1, parseInt(document.getElementById('opt-rounds').value, 10) || 10)),
    variance: (parseInt(document.getElementById('opt-variance').value, 10) || 0) / 100,
    debrisRate: Math.min(1, Math.max(0, (parseInt(document.getElementById('opt-debris').value, 10) || 0) / 100)),
    shieldRegen: document.getElementById('opt-shield-regen').checked,
    distanceAU,
    roundTrip: document.getElementById('opt-roundtrip').checked,
    attackerMods: readMods('attacker'),
    defenderMods: readMods('defender'),
    defenderTier: document.getElementById('def-marauder').checked ? 'marauder' : null,
    defense: {
      missile_defense: Math.max(0, parseInt(document.getElementById('def-missile').value, 10) || 0),
      laser_defense:   Math.max(0, parseInt(document.getElementById('def-laser').value, 10) || 0),
      railgun_defense: Math.max(0, parseInt(document.getElementById('def-railgun').value, 10) || 0),
      plasma_defense:  Math.max(0, parseInt(document.getElementById('def-plasma').value, 10) || 0),
      ion_defense:     Math.max(0, parseInt(document.getElementById('def-ion').value, 10) || 0),
      ew_system:       Math.max(0, parseInt(document.getElementById('def-ew').value, 10) || 0),
      shield_generator: Math.max(0, parseInt(document.getElementById('def-shield').value, 10) || 0), // ponytail: collected, no effect modeled yet — unknown mechanic
    },
  };

  // Let the status paint before the (potentially long) synchronous run
  setTimeout(() => {
    const result = runSimulations(attackerFleet, defenderFleet, opts);
    renderResults(result, opts);
    renderSampleBattle(attackerFleet, defenderFleet, opts);
    status.textContent = `完成，共运行 ${opts.sims} 次模拟。`;
    document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
  }, 10);
});

document.getElementById('btn-clear').addEventListener('click', () => {
  document.querySelectorAll('.fleet-table input').forEach(i => { i.value = 0; });
  document.querySelectorAll('.survivors').forEach(s => { s.textContent = ''; });
  document.getElementById('results').style.display = 'none';
});

// Runs after every script on the page is loaded (this file is last).
init();
