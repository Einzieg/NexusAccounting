// Combat simulator tab. The battle engine (tables, modifiers, Monte Carlo)
// lives in ../engine.js, shared between this page and the node test suite.

import {
  shipDefs, setShipDefs, runSimulations, simulateOnce, computeMods,
  NO_MODS, TECHS, TECH_MAX_LEVEL, lossesToResources,
} from '../engine.js';
import {
  updateDistanceFromCoords, loadIntelReports, populatePlanetPicker, _resolvedDistanceAU,
} from './simulator-intel.js';
import { shipDisplayName, uiLabel } from '../common.js';

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
    tdName.textContent = shipDisplayName(def);

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
  return `ATK ${atk} · HP ${hp} · SH ${sh}`;
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
    td.style.color = text !== statText(def, NO_MODS) ? 'var(--color-success)' : '';
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
      : `${(e.perLvl * 100).toFixed(0)}% 减伤`;
    label.title = effectText(tech) + (tech.also ? `，并且${effectText(tech.also)}` : '') + '（每级）';
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

  renderFleetResultCards(result);

  renderLossTable('attacker-losses', result.attackerLosses);
  renderLossTable('defender-losses', result.defenderLosses);
  updateSurvivors('attacker', result.attackerLosses);
  updateSurvivors('defender', result.defenderLosses);
  renderCostCards('attacker-cost', result.attackerLosses);
  renderCostCards('defender-cost', result.defenderLosses);

  renderDebris(result.attackerLosses, result.defenderLosses, opts);
  renderFuel(result.attackerLosses, opts);
}

// "Fleets" — Simulation Result anatomy section 3: side-tinted cards, one ship
// row per side per ship type sent (the spec's mockup shows a single Cruiser
// row; real fleets can mix ship types, so every sent ship type gets a row).
function renderFleetResultCards(result) {
  const el = document.getElementById('fleet-results');
  el.textContent = '';
  const sides = [
    { side: 'attacker', label: '进攻方', icon: '⚡', losses: result.attackerLosses },
    { side: 'defender', label: '防守方', icon: '⛨', losses: result.defenderLosses },
  ];
  for (const s of sides) {
    const card = document.createElement('div');
    card.className = `sim-fleet-card ${s.side}`;

    const head = document.createElement('div');
    head.className = 'sim-fleet-card-head';
    const sideEl = document.createElement('div');
    sideEl.className = 'sim-fleet-card-side';
    sideEl.textContent = `${s.icon} ${s.label}`;
    const nameEl = document.createElement('div');
    nameEl.className = 'sim-fleet-card-name';
    nameEl.textContent = `${s.label}舰队`;
    head.append(sideEl, nameEl);

    const chip = document.createElement('div');
    chip.className = 'sim-fleet-card-chip';
    chip.textContent = '战斗舰船';

    const rows = document.createElement('div');
    rows.className = 'sim-fleet-card-rows';
    const entries = Object.entries(s.losses).filter(([, l]) => l.sent > 0);
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'sim-fleet-card-empty';
      empty.textContent = '无舰船';
      rows.appendChild(empty);
    } else {
      for (const [key, l] of entries) {
        const def = shipDefs[key];
        const remain = Math.max(0, l.sent - l.lost);
        const row = document.createElement('div');
        row.className = 'sim-fleet-card-row';
        const icon = document.createElement('div');
        icon.className = 'sim-fleet-card-icon';
        if (def?.imageUrl) {
          const img = document.createElement('img');
          img.src = def.imageUrl;
          icon.appendChild(img);
        } else {
          icon.textContent = '▶';
        }
        const nm = document.createElement('span');
        nm.className = 'sim-fleet-card-name-cell';
        nm.textContent = def ? shipDisplayName(def) : key;
        const lost = document.createElement('span');
        lost.className = 'sim-fleet-card-lost';
        lost.textContent = `-${l.lost.toFixed(1)}`;
        const rem = document.createElement('span');
        rem.className = `sim-fleet-card-remain ${remain > 0.05 ? 'alive' : 'wiped'}`;
        rem.textContent = remain.toFixed(1);
        row.append(icon, nm, lost, rem);
        rows.appendChild(row);
      }
    }

    card.append(head, chip, rows);
    el.appendChild(card);
  }
}

// "N× Cruiser, 1× Frigate" from a round's { key: count } loss breakdown.
function lostDetail(byType) {
  return Object.entries(byType || {})
    .map(([key, n]) => `${n}× ${shipDefs[key] ? shipDisplayName(shipDefs[key]) : key}`)
    .join(', ');
}

// "Combat Rounds" — one representative run, shown as a round-by-round card
// list (like the in-game report). aDmg/dDmg and ATK/DEF% come straight from
// engine.js's trace; the attacker-loss line is hidden on rounds it took none
// (mirrors the spec's showALost).
function renderSampleBattle(attackerFleet, defenderFleet, opts) {
  const list = document.getElementById('rounds-log');
  list.textContent = '';
  const sample = simulateOnce(attackerFleet, defenderFleet, { ...opts, trace: true });
  const trace = sample.trace || [];

  const countEl = document.getElementById('rounds-count');
  if (countEl) countEl.textContent = trace.length ? `(${trace.length})` : '';

  for (const r of trace) {
    const card = document.createElement('div');
    card.className = 'sim-round-card';

    const top = document.createElement('div');
    top.className = 'sim-round-top';
    const summary = document.createElement('div');
    summary.className = 'sim-round-summary';
    const n = document.createElement('span');
    n.className = 'sim-round-n';
    n.textContent = `第 ${r.round} 回合：`;
    const dmg = document.createElement('span');
    dmg.className = 'sim-round-dmg';
    dmg.append(
      ' ', spanWith('sword', '⚔'), ` ${fmt(r.attackerDmg)} 伤害 → `,
      spanWith('shield', '⛨'), ` ${fmt(r.defenderDmg)} 伤害`,
    );
    summary.append(n, dmg);
    const pctEl = document.createElement('span');
    pctEl.className = 'sim-round-pct';
    pctEl.textContent = `[进攻 ${r.attackerHpPct}% / 防守 ${r.defenderHpPct}%]`;
    top.append(summary, pctEl);

    const losses = document.createElement('div');
    losses.className = 'sim-round-losses';
    if (r.attackerLost) {
      const a = document.createElement('div');
      a.className = 'sim-round-loss-a';
      a.textContent = `✕ 损失：${lostDetail(r.attackerLostByType)}`;
      losses.appendChild(a);
    }
    if (r.defenderLost) {
      const d = document.createElement('div');
      d.className = 'sim-round-loss-d';
      d.textContent = `⛨ 损失：${lostDetail(r.defenderLostByType)}`;
      losses.appendChild(d);
    }

    card.append(top, losses);
    list.appendChild(card);
  }

  const note = document.createElement('div');
  note.className = 'sim-round-note';
  note.textContent = `样本结果：${uiLabel(sample.outcome)}，共 ${sample.rounds} 回合。` +
    '这是一次代表性战斗；上方统计来自全部蒙特卡洛模拟。';
  list.appendChild(note);
}

function spanWith(className, text) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

// "Debris Field" — gold salvage band, from both sides' destroyed ships.
function renderDebris(attackerLosses, defenderLosses, opts) {
  const el = document.getElementById('debris-stats');
  el.textContent = '';
  const a = lossesToResources(attackerLosses);
  const d = lossesToResources(defenderLosses);
  const items = [
    ['矿石', (a.ore + d.ore) * opts.debrisRate],
    ['硅酸盐', (a.silicates + d.silicates) * opts.debrisRate],
    ['合金', (a.alloys + d.alloys) * opts.debrisRate],
  ];
  for (const [label, value] of items) {
    const item = document.createElement('div');
    item.className = 'sim-debris-item';
    item.append(spanWith('sim-debris-value', fmt(value)), spanWith('sim-debris-label', ` ${label}`));
    el.appendChild(item);
  }
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
    makeStatCard(`燃料总计${opts.roundTrip ? '（往返）' : '（单程）'}`,
      opts.distanceAU > 0 ? fmt(total) : '— 请设置起点和目标星系', 'hydrogen'),
    makeStatCard('舰队燃料率（Σ fuelRate）', fmt(rate), 'hydrogen'),
  );
  if (missing) {
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:0.75rem;color:var(--color-muted);margin-top:6px;';
    hint.textContent = '部分舰船缺少燃料率，请打开游戏并立即同步以刷新舰船数据。';
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
    span.style.color = alive >= l.sent * 0.99 ? 'var(--color-success)' : alive > 0 ? 'var(--color-warning)' : 'var(--color-danger)';
  });
}

// "Losses" — rocket-ish icon + red qty + muted breakdown, per the spec. The
// mockup shows one aggregate line per side (single ship type); real fleets
// can mix ship types, so this renders one row per ship type actually sent.
// (No destroyed/repairable split exists in the engine's Monte-Carlo output —
// "sent / survival%" is the real breakdown available, so that's shown instead.)
function renderLossTable(containerId, losses) {
  const container = document.getElementById(containerId);
  container.textContent = '';
  const entries = Object.entries(losses);
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'sim-loss-empty';
    empty.textContent = '无舰船';
    container.appendChild(empty);
    return;
  }
  for (const [key, l] of entries) {
    const def = shipDefs[key];
    const survival = l.sent ? ((l.sent - l.lost) / l.sent * 100).toFixed(0) : 0;
    const row = document.createElement('div');
    row.className = 'sim-loss-row';
    const icon = document.createElement('div');
    icon.className = 'sim-loss-icon';
    if (def?.imageUrl) {
      const img = document.createElement('img');
      img.src = def.imageUrl;
      icon.appendChild(img);
    } else {
      icon.textContent = '▶';
    }
    const qty = document.createElement('span');
    qty.className = 'sim-loss-qty';
    qty.textContent = `${l.lost.toFixed(1)}× ${def ? shipDisplayName(def) : key}`;
    const detail = document.createElement('span');
    detail.className = 'sim-loss-detail';
    detail.textContent = `（派出 ${fmt(l.sent)}，存活率 ${survival}%）`;
    row.append(icon, qty, detail);
    container.appendChild(row);
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

let inited = false;

export async function initSimulatorTab() {
  if (inited) return;

  const status = document.getElementById('sim-status');
  const { ships } = await globalThis.nexusStorage.get('ships');

  const defs = Object.values(ships || {});
  if (!defs.length || defs.some(d => d.hp === undefined)) {
    status.textContent = '缺少舰船战斗数据，请打开游戏并点击“立即同步”。';
    status.className = 'error';
    return;
  }
  inited = true;

  const map = {};
  for (const def of defs) map[def.key] = def;
  setShipDefs(map);

  buildFleetInputs('attacker-ships', 'attacker');
  buildFleetInputs('defender-ships', 'defender');
  buildTechInputs('attacker-techs', 'attacker');
  buildTechInputs('defender-techs', 'defender');
  await Promise.all([loadIntelReports(), populatePlanetPicker()]);
  status.className = '';
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
    maxRounds: Math.min(20, Math.max(1, parseInt(document.getElementById('opt-rounds').value, 10) || 15)),
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
  document.querySelectorAll('#simulator-content .fleet-table input').forEach(i => { i.value = 0; });
  document.querySelectorAll('#simulator-content .survivors').forEach(s => { s.textContent = ''; });
  document.getElementById('results').style.display = 'none';
});
