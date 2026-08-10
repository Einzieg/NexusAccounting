// Shared state and helpers used by every dashboard tab.
// Loaded first — all other dashboard scripts depend on it.

export let store = {};   // full storage snapshot
export function setStore(s) { store = s; }   // setter: other modules can't reassign an import

export let activeTab = 'global';
export function setActiveTab(t) { activeTab = t; }

export const PER_PAGE = 20;
export const COMMAND_VESSEL_CHIP = Object.freeze({ quantity: 1, isCommandVessel: true, label: '指挥舰' });
export const LEADER_RETRY_NOTICE = '指挥舰存在其他任务中，已经改为未编入再次出发。';

export function showLeaderRetryNotice(res) {
  if (res && res.leaderRetryNotice) infoDialog('指挥舰未编入', res.leaderRetryNotice);
}

export function cargoExpansionBonus(research = []) {
  let level = 0;
  let bonus = 0;
  for (const r of research || []) {
    const key = normGameKey(r.key || r.slug || r.id || '');
    const name = String(r.name || r.displayName || r.title || '');
    const isCargoExpansion = key === 'cargo_expansion' ||
      name.includes('货舱扩展') || /cargo\s*expansion/i.test(name);
    if (!isCargoExpansion) continue;
    const lvl = Number(r.level ?? r.currentLevel ?? r.rank) || 0;
    if (!lvl) continue;
    level = Math.max(level, lvl);
    for (const e of (r.effects || [])) {
      if (e.type === 'cargo_bonus') bonus += (Number(e.value) || 0) * lvl;
    }
  }
  if (level && bonus <= 0) bonus = level * 0.08;
  return { level, bonus };
}

function cargoBonusValue(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.abs(n) > 1 ? n / 100 : n;
}

export function accountCargoBonus(me = {}) {
  const user = me?.user || me || {};
  const active = user.activeLeaderBonuses || me?.activeLeaderBonuses || {};
  const bonus = cargoBonusValue(active.cargoBonus);
  if (bonus) return { bonus, label: '职业载货' };
  const leader = normGameKey(user.activeLeader || user.leader || user.leaderType || user.role || user.profession || '');
  return leader === 'explorer' ? { bonus: 0.1, label: '探索者职业' } : { bonus: 0, label: '' };
}

export function effectiveCargoCapacity(baseCapacity, bonus = 0) {
  const base = Number(baseCapacity) || 0;
  const mult = 1 + (Number(bonus) || 0);
  return Math.floor((base * mult) + Number.EPSILON * Math.max(1, base) * 100);
}

export function serverTravelTimeFactor(server = null) {
  const parts = [
    server?.key,
    server?.id,
    server?.hostname,
    server?.origin,
    server?.name,
  ].map(v => String(v || '').toLowerCase());
  return parts.some(v => v === 'nf' || v.includes('nx-nf') || v.includes('nf.nexuslegacy.space')) ? 0.5 : 1;
}

export function applyServerTravelTime(seconds, server = null) {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return seconds;
  return Math.max(0, Math.round(n * serverTravelTimeFactor(server)));
}

// shipDefId → def ({ name, imageUrl, … }), fetched once and cached.
let _shipDefs = null;
async function shipDefs() {
  if (!_shipDefs) {
    const res = await browser.runtime.sendMessage({ type: 'GET_SHIP_DEFS' });
    _shipDefs = {};
    for (const s of (res.ships || [])) _shipDefs[s.shipDefId] = s;
  }
  return _shipDefs;
}
export async function shipName(id) {
  return shipDisplayName((await shipDefs())[id], `#${id}`);
}

// In-page replacement for window.confirm(). Native confirm() is silently
// suppressed once a user ticks Firefox's "prevent additional dialogs" box,
// which permanently blocks fleet/research launches. This never triggers that.
// Optional `ships` = [{ shipDefId, quantity }] renders an image+name chip row.
export async function confirmDialog(message, ships) {
  const defs = ships?.length ? await shipDefs() : null;
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center';
    const box = document.createElement('div');
    box.style.cssText = 'background:#1b2030;color:#e6e8ee;border:1px solid #39405a;border-radius:8px;max-width:420px;padding:20px;font:14px/1.5 system-ui,sans-serif;white-space:pre-line';
    const msg = document.createElement('div');
    // Render per line so a ⚠ warning (e.g. not enough ships to fill the template)
    // stands out in red.
    for (const line of String(message).split('\n')) {
      const l = document.createElement('div');
      l.textContent = line;
      if (line.trim().startsWith('⚠')) l.style.color = '#ff7b72';
      msg.appendChild(l);
    }
    const btns = document.createElement('div');
    btns.style.cssText = 'margin-top:18px;display:flex;gap:10px;justify-content:flex-end;white-space:normal';
    const mk = (label, primary) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = `padding:7px 16px;border-radius:6px;border:1px solid #39405a;cursor:pointer;${primary ? 'background:#3b82f6;color:#fff;border-color:#3b82f6' : 'background:#2a3146;color:#e6e8ee'}`;
      return b;
    };
    const cancel = mk('取消', false);
    const ok = mk('确认', true);
    const done = (v) => { ov.remove(); resolve(v); };
    cancel.onclick = () => done(false);
    ok.onclick = () => done(true);
    ov.onclick = (e) => { if (e.target === ov) done(false); };
    box.append(msg);
    if (defs) {
      const row = document.createElement('div');
      row.style.cssText = 'margin-top:10px;display:flex;flex-wrap:wrap;gap:12px;white-space:normal';
      for (const s of ships) {
        if (s.isCommandVessel) {
          const chip = document.createElement('span');
          chip.style.cssText = 'display:inline-flex;align-items:center;gap:6px;color:#79c0ff;font-weight:600';
          chip.append(document.createTextNode(`${s.quantity || 1}× ${s.label || '指挥舰'}`));
          row.append(chip);
          continue;
        }
        const def = defs[s.shipDefId] || {};
        const chip = document.createElement('span');
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:6px';
        if (def.imageUrl) {
          const img = document.createElement('img');
          img.src = def.imageUrl;
          img.style.cssText = 'width:24px;height:24px;object-fit:contain';
          chip.append(img);
        }
        chip.append(document.createTextNode(`${s.quantity}× ${shipDisplayName(def, '#' + s.shipDefId)}`));
        row.append(chip);
      }
      box.append(row);
    }
    btns.append(cancel, ok);
    box.append(btns);
    ov.append(box);
    document.body.append(ov);
    ok.focus();
  });
}

// Editable fleet dialog — the launch-time fleet editor (mirrors the live-search
// panel's editor). Rows = union of seeded ships and ships available on the
// source planet; each quantity is capped to availability. `seed` is
// {shipDefId → wanted qty}, `avail` is {shipDefId → count on planet}. Resolves
// to [{shipDefId, quantity}] on confirm (send once), or null on cancel.
export async function editFleetDialog({
  title,
  subtitle = '',
  avail = {},
  seed = {},
  recShips = [],
  miningShipIds = null,
  attachLeader = false,
  escortRetreatThreshold = null,
  retreatThresholdOptional = false,
  leaderOptional = false,
  templates = null,
  selectedTemplateId = null,
  templateShipDefs = [],
  templateMemoryKey = '',
  templateMemoryScope = '',
}) {
  const defs = await shipDefs();
  const [storedResearch, me] = await Promise.all([
    globalThis.nexusStorage.get('research').catch(() => ({ research: [] })),
    browser.runtime.sendMessage({ type: 'GET_AUTH_ME' }).catch(() => ({})),
  ]);
  const cargoBonus = cargoExpansionBonus(storedResearch.research || []);
  const accountCargo = accountCargoBonus(me);
  const totalCargoBonus = cargoBonus.bonus + accountCargo.bonus;
  const commandDef = Object.values(defs).find(isCommandVessel) || null;
  const allTemplates = Array.isArray(templates) ? templates : [];
  const templateDefs = templateShipDefs && templateShipDefs.length ? templateShipDefs : Object.values(defs);
  let selectedTemplate = allTemplates.find(t => String(t.id) === String(selectedTemplateId)) || allTemplates[0] || null;
  let selectedTemplateKey = selectedTemplate ? String(selectedTemplate.id) : '';
  let remembered = {};
  const memoryStoreKey = templateMemoryKey ? `nx-fleet-dialog:${templateMemoryKey}` : '';
  if (memoryStoreKey) {
    try { remembered = JSON.parse(localStorage.getItem(memoryStoreKey) || '{}') || {}; }
    catch { remembered = {}; }
  }
  const templateSeed = (template) => {
    const out = {};
    for (const s of templateRegularShips(template, templateDefs)) out[s.shipDefId] = s.quantity;
    return out;
  };
  const templateSignature = (template) => JSON.stringify({
    ships: Object.entries(templateSeed(template)).sort(([a], [b]) => Number(a) - Number(b)),
    attachLeader: templateWantsLeader(template, templateDefs),
    escortRetreatThreshold: templateRetreatThreshold(template),
  });
  const memoryKeyFor = (template) => {
    if (!template) return '';
    const base = String(template.id);
    return templateMemoryScope ? `${base}|${templateMemoryScope}` : base;
  };
  const rememberedFor = (template) => {
    if (!template) return null;
    const mem = remembered[memoryKeyFor(template)] || null;
    if (!mem || mem.templateSig !== templateSignature(template)) return null;
    return mem;
  };
  const initialRemembered = rememberedFor(selectedTemplate);
  if (selectedTemplate) seed = initialRemembered?.ships || templateSeed(selectedTemplate);
  let leaderAttached = initialRemembered && 'attachLeader' in initialRemembered
    ? !!initialRemembered.attachLeader
    : (selectedTemplate ? templateWantsLeader(selectedTemplate, templateDefs) : !!attachLeader);
  let retreatThreshold = selectedTemplate
    ? templateRetreatThreshold(selectedTemplate)
    : normalizeRetreatThreshold(escortRetreatThreshold);
  let retreatEnabled = retreatThreshold != null;
  const templateIds = allTemplates.flatMap(t => templateRegularShips(t, templateDefs).map(s => s.shipDefId));
  const rememberedIds = allTemplates.flatMap(t => Object.keys((rememberedFor(t) && rememberedFor(t).ships) || {}).map(Number));
  const ids = [...new Set([
    ...Object.keys(seed).map(Number),
    ...templateIds,
    ...rememberedIds,
    ...Object.keys(avail).map(Number).filter(id => (avail[id] || 0) > 0),
  ])].filter(id => !isCommandVessel(defs[id]));
  const state = new Map();
  const inputs = new Map();   // shipDefId -> its qty <input>, so template/optimise can update rows in place
  for (const id of ids) {
    const q = Math.min(seed[id] || 0, avail[id] || 0);
    if (q > 0) state.set(id, q);
  }
  const setStateFromSeed = (nextSeed = {}) => {
    state.clear();
    for (const id of ids) {
      const q = Math.min(Number(nextSeed[id]) || 0, avail[id] || 0);
      if (q > 0) state.set(id, q);
      const inp = inputs.get(id);
      if (inp) inp.value = String(q > 0 ? q : 0);
    }
  };
  const effective = () => [...state.entries()]
    .map(([id, q]) => ({ shipDefId: id, quantity: Math.min(q, avail[id] || 0) }))
    .filter(s => s.quantity > 0);

  const isMiningCargoTarget = (def) => {
    const key = normGameKey(def?.key || '');
    const name = normGameKey(def?.name || '');
    return key === 'miner' || key === 'mining_vessel' || key === 'gas_collector' ||
      name === 'mining_vessel' || name === 'gas_collector' ||
      /mining\s*vessel/i.test(def?.name || '') || /gas\s*collector/i.test(def?.name || '') ||
      String(def?.name || '').includes('采矿船') || String(def?.name || '').includes('气体收集船');
  };

  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center';
    const box = document.createElement('div');
    box.style.cssText = 'background:#1b2030;color:#e6e8ee;border:1px solid #39405a;border-radius:8px;max-width:520px;width:min(92vw,520px);height:70vh;max-height:70vh;padding:20px;font:14px/1.5 system-ui,sans-serif;display:flex;flex-direction:column;box-sizing:border-box';
    const h = document.createElement('div');
    h.textContent = title || '编辑舰队';
    h.style.cssText = 'font-weight:600;margin-bottom:2px';
    box.append(h);
    if (subtitle) {
      const sub = document.createElement('div');
      sub.textContent = subtitle;
      sub.style.cssText = 'color:#8b949e;font-size:0.85rem;margin-bottom:8px;white-space:pre-line';
      box.append(sub);
    }
    let leaderInput = null;
    let leaderBadge = null;
    let retreatCheck = null;
    let retreatInput = null;
    let retreatDisplay = null;
    let retreatButtons = [];
    let miningCargoBox = null;
    const refreshMiningCargo = () => {
      if (!miningCargoBox) return;
      miningCargoBox.textContent = '';
      const selected = effective()
        .map(s => ({ ...s, def: defs[s.shipDefId] || {} }))
        .filter(s => isMiningCargoTarget(s.def) && (s.def.miningCargo || 0) > 0);
      if (!selected.length) {
        miningCargoBox.style.display = 'none';
        return;
      }
      miningCargoBox.style.display = '';
      const rows = selected.map(s => {
        const perShip = effectiveCargoCapacity(s.def.miningCargo || 0, totalCargoBonus);
        return {
          name: shipDisplayName(s.def, `#${s.shipDefId}`),
          qty: s.quantity,
          perShip,
          total: perShip * s.quantity,
        };
      });
      const total = rows.reduce((sum, r) => sum + r.total, 0);
      const titleLine = document.createElement('div');
      titleLine.style.cssText = 'font-weight:700;color:#e3b341;margin-bottom:3px';
      titleLine.textContent = `采矿仓储总计：${total.toLocaleString()}`;
      const detailLine = document.createElement('div');
      detailLine.style.cssText = 'color:#c9d1d9;font-size:0.82rem;line-height:1.45';
      const techParts = [cargoBonus.level
        ? `货舱扩展 Lv ${cargoBonus.level}，+${Math.round(cargoBonus.bonus * 100)}%`
        : '货舱扩展 Lv 0'];
      if (accountCargo.bonus) techParts.push(`${accountCargo.label} +${Math.round(accountCargo.bonus * 100)}%`);
      detailLine.textContent = `${techParts.join(' · ')} · ` +
        rows.map(r => `${r.name} ${r.qty.toLocaleString()}×${r.perShip.toLocaleString()}=${r.total.toLocaleString()}`).join(' · ');
      miningCargoBox.append(titleLine, detailLine);
    };
    const syncRetreatUi = () => {
      if (!retreatCheck || !retreatInput) return;
      const pct = Math.round((retreatThreshold || 0.7) * 100);
      retreatCheck.checked = retreatEnabled;
      retreatInput.value = String(pct);
      if (retreatDisplay) {
        retreatDisplay.textContent = retreatEnabled ? `当前 ${pct}%` : '未启用';
        retreatDisplay.style.opacity = retreatEnabled ? '1' : '0.7';
      }
      for (const b of retreatButtons) {
        b.disabled = !retreatEnabled;
        b.style.background = retreatEnabled && Number(b.dataset.thresholdPct) === pct ? '#0e4f6f' : '#0d1117';
        b.style.borderColor = retreatEnabled && Number(b.dataset.thresholdPct) === pct ? '#22d3ee' : '#30363d';
      }
    };
    const applySelectedTemplate = (template) => {
      selectedTemplate = template || null;
      selectedTemplateKey = selectedTemplate ? String(selectedTemplate.id) : '';
      const mem = rememberedFor(selectedTemplate);
      setStateFromSeed(mem?.ships || templateSeed(selectedTemplate));
      leaderAttached = mem && Object.prototype.hasOwnProperty.call(mem, 'attachLeader')
        ? !!mem.attachLeader
        : (selectedTemplate ? templateWantsLeader(selectedTemplate, templateDefs) : !!attachLeader);
      retreatThreshold = selectedTemplate
        ? templateRetreatThreshold(selectedTemplate)
        : normalizeRetreatThreshold(escortRetreatThreshold);
      retreatEnabled = retreatThreshold != null;
      if (leaderInput) leaderInput.checked = leaderAttached;
      if (leaderBadge) leaderBadge.textContent = leaderAttached ? '已编入' : '未编入';
      syncRetreatUi();
      refresh();
    };
    if (allTemplates.length) {
      const tplRow = document.createElement('label');
      tplRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin:10px 0 8px;color:#8b949e';
      const tplLabel = document.createElement('span');
      tplLabel.textContent = '舰队模板';
      const tplSelect = document.createElement('select');
      tplSelect.style.cssText = 'flex:1;min-width:0;background:#21262d;border:1px solid #30363d;color:#e6edf3;padding:5px 8px;border-radius:6px;font-size:0.9rem';
      for (const t of allTemplates) {
        const o = document.createElement('option');
        o.value = t.id;
        o.textContent = t.name || `#${t.id}`;
        if (String(t.id) === selectedTemplateKey) o.selected = true;
        tplSelect.append(o);
      }
      tplSelect.addEventListener('change', () => {
        applySelectedTemplate(allTemplates.find(t => String(t.id) === tplSelect.value) || null);
      });
      tplRow.append(tplLabel, tplSelect);
      box.append(tplRow);
    }

    const rows = document.createElement('div');
    rows.style.cssText = 'display:flex;flex-direction:column;gap:6px;overflow:auto;margin-top:8px;min-height:0;flex:1;padding-right:4px';
    if (leaderOptional || leaderAttached || allTemplates.length) {
      const line = document.createElement('div');
      line.style.cssText = 'display:grid;grid-template-columns:24px 1fr 88px;align-items:center;gap:8px;border:1px solid #22d3ee;border-radius:6px;background:rgba(34,211,238,.12);padding:6px';
      const iconCell = document.createElement('span');
      if (commandDef?.imageUrl) {
        const img = document.createElement('img');
        img.src = commandDef.imageUrl;
        img.style.cssText = 'width:22px;height:22px;object-fit:contain;display:block';
        iconCell.append(img);
      }
      const name = document.createElement('span');
      const label = document.createElement('label');
      label.style.cssText = 'display:inline-flex;align-items:center;gap:6px;cursor:pointer;color:#dff7ff;font-weight:600';
      leaderInput = document.createElement('input');
      leaderInput.type = 'checkbox';
      leaderInput.checked = leaderAttached;
      leaderInput.addEventListener('change', () => {
        leaderAttached = !!leaderInput.checked;
        if (leaderBadge) leaderBadge.textContent = leaderAttached ? '已编入' : '未编入';
        refresh();
      });
      name.textContent = '指挥舰';
      name.style.cssText = 'color:#dff7ff;font-weight:600';
      label.append(leaderInput, name);
      leaderBadge = document.createElement('span');
      leaderBadge.textContent = leaderAttached ? '已编入' : '未编入';
      leaderBadge.style.cssText = 'justify-self:end;color:#79c0ff;font-weight:600';
      line.append(iconCell, label, leaderBadge);
      rows.append(line);
    }
    if (retreatThresholdOptional || retreatEnabled || allTemplates.length) {
      const boxRetreat = document.createElement('div');
      boxRetreat.style.cssText = 'border:1px solid #1f6feb66;border-radius:6px;background:rgba(56,139,253,.08);padding:8px;margin-top:2px';
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:7px;font-weight:600;color:#c9d1d9;cursor:pointer';
      retreatCheck = document.createElement('input');
      retreatCheck.type = 'checkbox';
      retreatCheck.addEventListener('change', () => {
        retreatEnabled = retreatCheck.checked;
        if (retreatEnabled && retreatThreshold == null) retreatThreshold = 0.7;
        syncRetreatUi();
        refresh();
      });
      label.append(retreatCheck, document.createTextNode('按伤害阈值撤回护航'));
      const desc = document.createElement('div');
      desc.textContent = '护航受损超过阈值时提前返航。';
      desc.style.cssText = 'margin:4px 0 6px 22px;color:#8b949e;font-size:0.78rem';
      const controls = document.createElement('div');
      controls.style.cssText = 'display:flex;gap:6px;margin-left:22px;align-items:center;flex-wrap:wrap';
      for (const pct of [30, 50, 70]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.thresholdPct = String(pct);
        b.textContent = `${pct}%`;
        b.style.cssText = 'padding:4px 10px;border-radius:6px;border:1px solid #30363d;background:#0d1117;color:#c9d1d9;cursor:pointer';
        b.addEventListener('click', () => {
          retreatEnabled = true;
          retreatThreshold = pct / 100;
          syncRetreatUi();
          refresh();
        });
        retreatButtons.push(b);
        controls.appendChild(b);
      }
      retreatInput = document.createElement('input');
      retreatInput.type = 'hidden';
      retreatDisplay = document.createElement('span');
      retreatDisplay.style.cssText = 'color:#8b949e;margin-left:4px';
      controls.append(retreatInput, retreatDisplay);
      boxRetreat.append(label, desc, controls);
      rows.append(boxRetreat);
      syncRetreatUi();
    }
    if (!ids.length && !(leaderOptional || leaderAttached || allTemplates.length)) {
      rows.textContent = '出发星球上没有可用舰船。';
      rows.style.color = '#8b949e';
    }
    const ok = document.createElement('button');   // declared early for refresh()
    const refresh = () => {
      ok.disabled = !effective().length && !leaderAttached;
      ok.style.opacity = ok.disabled ? '0.5' : '1';
      if (leaderBadge) leaderBadge.textContent = leaderAttached ? '已编入' : '未编入';
      refreshMiningCargo();
    };
    for (const id of ids) {
      const def = defs[id] || {};
      const max = avail[id] || 0;
      const line = document.createElement('div');
      line.style.cssText = 'display:grid;grid-template-columns:24px 1fr 64px 44px;align-items:center;gap:8px';
      const iconCell = document.createElement('span');
      if (def.imageUrl) {
        const img = document.createElement('img');
        img.src = def.imageUrl; img.style.cssText = 'width:22px;height:22px;object-fit:contain;display:block';
        iconCell.append(img);
      }
      const name = document.createElement('span');
      name.textContent = shipDisplayName(def, `#${id}`);
      name.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = '0'; inp.max = String(max); inp.value = String(state.get(id) || 0);
      inp.style.cssText = 'width:100%;background:#21262d;border:1px solid #30363d;color:#e6edf3;padding:3px 6px;border-radius:6px;font-size:0.85rem;box-sizing:border-box';
      inp.addEventListener('change', () => {
        let v = parseInt(inp.value, 10); if (isNaN(v) || v < 0) v = 0;
        if (v > max) v = max;
        inp.value = String(v);
        if (v > 0) state.set(id, v); else state.delete(id);
        refresh();
      });
      const avLbl = document.createElement('span');
      avLbl.textContent = `/ ${max}`; avLbl.style.color = '#8b949e';
      line.append(iconCell, name, inp, avLbl);
      rows.append(line);
      inputs.set(id, inp);
    }
    box.append(rows);
    miningCargoBox = document.createElement('div');
    miningCargoBox.style.cssText = 'display:none;border:1px solid #e3b34166;border-radius:6px;background:rgba(227,179,65,.08);padding:8px;margin-top:8px';
    box.append(miningCargoBox);

    const btns = document.createElement('div');
    btns.style.cssText = 'margin-top:18px;display:flex;gap:10px;justify-content:flex-end';
    const mk = (b, label, primary) => {
      b.textContent = label;
      b.style.cssText = `padding:7px 16px;border-radius:6px;border:1px solid #39405a;cursor:pointer;${primary ? 'background:#238636;color:#fff;border-color:#2ea043' : 'background:#2a3146;color:#e6e8ee'}`;
      return b;
    };
    const cancel = mk(document.createElement('button'), '取消', false);
    mk(ok, '派出', true);
    const done = (v) => { ov.remove(); resolve(v); };
    cancel.onclick = () => done(null);
    ok.onclick = () => {
      const out = effective();
      out.attachLeader = leaderAttached;
      out.escortRetreatThreshold = retreatEnabled ? normalizeRetreatThreshold(retreatThreshold) : null;
      if (selectedTemplateKey) out.templateId = selectedTemplate ? selectedTemplate.id : selectedTemplateKey;
      if (memoryStoreKey && selectedTemplateKey) {
        remembered[selectedTemplate ? memoryKeyFor(selectedTemplate) : selectedTemplateKey] = {
          templateSig: selectedTemplate ? templateSignature(selectedTemplate) : null,
          ships: Object.fromEntries(out.map(s => [String(s.shipDefId), s.quantity])),
          attachLeader: leaderAttached,
        };
        localStorage.setItem(memoryStoreKey, JSON.stringify(remembered));
      }
      done(out);
    };
    ov.onclick = (e) => { if (e.target === ov) done(null); };
    refresh();
    if (recShips.length) {
      const opt = document.createElement('button');
      opt.textContent = '优化采矿舰队';
      opt.title = '只将采矿舰船调整为推荐数量，不改动护航或战斗舰船';
      opt.style.cssText = 'padding:7px 16px;border-radius:6px;border:1px solid #1f6feb;background:#1f6feb;color:#fff;cursor:pointer;margin-right:auto';
      opt.onclick = () => {
        for (const id of miningShipIds || []) {
          state.delete(id);
          const inp = inputs.get(id);
          if (inp) inp.value = '0';
        }
        for (const s of recShips) {
          const q = Math.min(s.quantity, avail[s.shipDefId] || 0);
          const inp = inputs.get(s.shipDefId);
          if (q > 0) { state.set(s.shipDefId, q); if (inp) inp.value = String(q); }
        }
        refresh();
      };
      btns.append(opt);
    }
    btns.append(cancel, ok);
    box.append(btns);
    ov.append(box);
    document.body.append(ov);
  });
}

// Minimal Markdown → DOM for the changelog: ### headings, - bullets (with
// wrapped continuation lines), **bold**, *italic*, `code`. Returns a fragment.
export function renderMarkdown(text) {
  const frag = document.createDocumentFragment();
  let ul = null, li = null;
  const closeList = () => { ul = null; li = null; };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      closeList();
      const el = document.createElement('h4');
      el.style.cssText = 'margin:14px 0 6px;font-size:0.95rem';
      inlineMd(el, h[1]);
      frag.append(el);
    } else if (/^[-*]\s+/.test(line)) {
      if (!ul) { ul = document.createElement('ul'); ul.style.cssText = 'margin:0 0 4px 18px;padding:0'; frag.append(ul); }
      li = document.createElement('li');
      li.style.cssText = 'margin:2px 0';
      inlineMd(li, line.replace(/^[-*]\s+/, ''));
      ul.append(li);
    } else if (li) {                       // wrapped continuation of a bullet
      li.append(document.createTextNode(' '));
      inlineMd(li, line.trim());
    } else {
      const p = document.createElement('div');
      inlineMd(p, line.trim());
      frag.append(p);
    }
  }
  return frag;
}

function inlineMd(parent, text) {
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parent.append(document.createTextNode(text.slice(last, m.index)));
    const el = document.createElement(m[1] != null ? 'strong' : m[2] != null ? 'em' : 'code');
    el.textContent = m[1] ?? m[2] ?? m[3];
    parent.append(el);
    last = re.lastIndex;
  }
  if (last < text.length) parent.append(document.createTextNode(text.slice(last)));
}

// One-button info modal (e.g. "What's new"). `body` may be a string (plain
// text) or a DOM node (e.g. from renderMarkdown).
export function infoDialog(title, body) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center';
  const box = document.createElement('div');
  box.style.cssText = 'background:#1b2030;color:#e6e8ee;border:1px solid #39405a;border-radius:8px;max-width:480px;max-height:70vh;overflow:auto;padding:20px;font:14px/1.5 system-ui,sans-serif';
  const h = document.createElement('h3');
  h.textContent = title;
  h.style.cssText = 'margin:0 0 12px';
  const msg = document.createElement('div');
  if (body instanceof Node) msg.append(body);
  else { msg.textContent = body; msg.style.cssText = 'white-space:pre-wrap'; }
  const btns = document.createElement('div');
  btns.style.cssText = 'margin-top:18px;display:flex;justify-content:flex-end';
  const ok = document.createElement('button');
  ok.textContent = '知道了';
  ok.style.cssText = 'padding:7px 16px;border-radius:6px;border:1px solid #3b82f6;background:#3b82f6;color:#fff;cursor:pointer';
  ok.onclick = () => ov.remove();
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  btns.append(ok);
  box.append(h, msg, btns);
  ov.append(box);
  document.body.append(ov);
  ok.focus();
}

// Fuel estimate, cached per source+destination+ships so a known route with the
// selected template never re-hits the API. Errors aren't cached (so they retry).
const _fuelCache = new Map();
export async function fuelEstimate(sourcePlanetId, targetSystemId, ships, attachLeader = false) {
  const server = await globalThis.nexusStorage?.getActiveServer?.().catch(() => null);
  const sig = `${attachLeader ? 'leader' : 'no-leader'}|${ships.map(s => `${s.shipDefId}:${s.quantity}`).sort().join(',')}`;
  const serverKey = server?.key || server?.id || server?.hostname || server?.origin || '';
  const key = `${serverKey}|${sourcePlanetId}|${targetSystemId}|${sig}`;
  if (_fuelCache.has(key)) return _fuelCache.get(key);
  const est = await browser.runtime.sendMessage({
    type: 'GET_FUEL_ESTIMATE',
    body: { sourcePlanetId, targetSystemId, ships, attachLeader: !!attachLeader, hangarAssignments: {} },
  });
  const adjusted = est && !est.error && est.travelTime != null
    ? { ...est, rawTravelTime: est.rawTravelTime ?? est.travelTime, travelTime: applyServerTravelTime(est.travelTime, server) }
    : est;
  if (!adjusted?.error) _fuelCache.set(key, adjusted);
  return adjusted;
}

// Fill a box with "On this planet:" + a chip (icon + qty × name) per ship that
// has a positive count. `ships` is [{ shipDefId, name, imageUrl }] to consider.
// Clear an availability strip (or show a message) and invalidate its signature,
// so the next renderAvailStrip with the same data still repaints. Callers must
// use this instead of box.textContent='' — a raw wipe leaves the cached sig and
// the strip stays blank.
export function clearAvailStrip(box, msg = '') {
  box.textContent = msg;
  delete box.dataset.availSig;
}

export function renderAvailStrip(box, ships, available, emptyMsg) {
  const here = ships.filter(s => (available[s.shipDefId] || 0) > 0);
  // Skip rebuild when nothing changed — avoids the empty-frame flash and the
  // img reload that shifts layout on every poll.
  const sig = here.map(s => `${s.shipDefId}:${available[s.shipDefId] || 0}`).join('|') || emptyMsg;
  if (box.dataset.availSig === sig) return;
  box.dataset.availSig = sig;
  box.textContent = '';
  const label = document.createElement('span');
  label.textContent = here.length ? '该星球拥有：' : emptyMsg;
  box.appendChild(label);
  for (const s of here) {
    const chip = document.createElement('span');
    chip.style.cssText = 'display:inline-flex; align-items:center; gap:5px;';
    const name = shipDisplayName(s);
    chip.title = name;
    if (s.imageUrl) {
      const img = document.createElement('img');
      img.src = s.imageUrl;
      img.style.cssText = 'width:22px; height:22px; object-fit:contain;';
      chip.appendChild(img);
    }
    chip.append(document.createTextNode(`${(available[s.shipDefId] || 0).toLocaleString()}× ${name}`));
    box.appendChild(chip);
  }
}

// Remember template-dropdown choices (by element id) across tabs and sessions.
export async function rememberedSelections() {
  const { template_selections } = await globalThis.nexusStorage.get('template_selections');
  return template_selections || {};
}
export async function rememberSelection(id, value) {
  const cur = await rememberedSelections();
  cur[id] = value;
  await globalThis.nexusStorage.set({ template_selections: cur });
}

export function fmt(n) {
  return n == null ? '0' : Number(n).toLocaleString();
}

function normGameKey(value) {
  return String(value ?? '').trim().toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const SHIP_NAME_LABELS = Object.freeze({
  probe: '探测器',
  spy_probe: '间谍探测器',
  scout: '侦察舰',
  fighter: '战斗机',
  interceptor: '截击机',
  cruiser: '巡洋舰',
  torpedo_frigate: '鱼雷护卫舰',
  carrier: '航母',
  battleship: '战列舰',
  missile_cruiser: '导弹巡洋舰',
  bomber: '轰炸机',
  dreadnought: '无畏舰',
  titan: '泰坦',
  assault_shuttle: '突击穿梭机',
  hacker_ship: '黑客船',
  colony_ship: '殖民船',
  engineer_ship: '工程船',
  electronic_warfare_ship: '电子战舰',
  ew_ship: '电子战舰',
  mine_layer: '布雷舰',
  stealth_ship: '隐形舰',
  freighter: '货运船',
  transport_shuttle: '运输穿梭机',
  tanker: '油船',
  bulk_carrier: '大型货运船',
  ore_freighter: '矿石货运船',
  mining_vessel: '采矿船',
  miner: '采矿船',
  gas_collector: '气体收集船',
  ice_drill: '冰钻船',
  excavator: '挖掘机',
  repair_ship: '维修船',
  lunar_shuttle: '月球穿梭机',
  command_vessel: '指挥舰',
});

const SHIP_PREFIX_LABELS = Object.freeze({
  wormhole: '虫洞',
  pirate: '海盗',
  alien: '异星',
  rogue: '失控',
  elite: '精英',
  ancient: '远古',
});

const RESEARCH_INFO_ZH = Object.freeze({
  improved_mining: { name: '改良采矿', description: '高级提取技术，提高所有殖民地的矿石效率。每级 +5% 矿石产量；需要 1 级研究实验室，最高 5 级。' },
  silicate_refining: { name: '硅酸盐精炼', description: '提高硅酸盐处理纯度和产出，早期可多级叠加。' },
  hydrogen_synthesis: { name: '氢气合成', description: '让大气处理器更高效提取氢气。每级 +5% 氢气产量；需要 1 级研究实验室，最高 5 级。' },
  energy_systems: { name: '能源系统', description: '基础能源分配知识。每级 +5% 能源；需要 1 级研究实验室，最高 5 级。' },
  structural_alloys: { name: '结构合金', description: '新合金配方提高铸造产出，并解锁合金铸造厂。每级 +5% 合金；需要 2 级研究实验室，最高 5 级；前置改良采矿。' },
  advanced_solar_collectors: { name: '高级太阳能收集器', description: '高效率光伏阵列。每级 +3% 能源；需要 2 级研究实验室，最高 5 级；前置能源系统。' },
  advanced_solar: { name: '高级太阳能收集器', description: '高效率光伏阵列。每级 +3% 能源；需要 2 级研究实验室，最高 5 级；前置能源系统。' },
  thermal_extraction: { name: '热能提取', description: '地热能开采，解锁热能电站。需要 2 级研究实验室；前置改良采矿和能源系统。' },
  expanded_warehousing: { name: '扩展仓储', description: '压缩和堆叠技术提高所有仓储容量。每级 +20% 仓储容量；需要 1 级研究实验室，最高 5 级。' },
  construction_optimization: { name: '施工优化', description: '精简建设流程。每级 +5% 建筑速度；需要 2 级研究实验室，最高 5 级；前置结构合金。' },
  dense_housing_modules: { name: '密集住宅模块', description: '紧凑居住模块。每级 +20% 人口容量；需要 2 级研究实验室，最高 5 级。' },
  dense_housing: { name: '密集住宅模块', description: '紧凑居住模块。每级 +20% 人口容量；需要 2 级研究实验室，最高 5 级。' },
  bio_agriculture: { name: '生物农业', description: '高级水培和基因改造作物，解锁生物综合体。每级 +5% 人口增长；需要 1 级研究实验室，最高 5 级。' },
  workforce_management: { name: '劳动力管理', description: '优化劳动力分配。每级 +10% 人口增长、+5% 建筑速度；需要 2 级研究实验室；前置密集住宅模块和生物农业。' },
  basic_armor_plating: { name: '基础装甲板', description: '强化舰体装甲。每级 +2% 舰船耐久、+5% 建筑耐久，并解锁防御陷阱；需要 1 级研究实验室，最高 5 级。' },
  basic_armor: { name: '基础装甲板', description: '强化舰体装甲。每级 +2% 舰船耐久、+5% 建筑耐久，并解锁防御陷阱；需要 1 级研究实验室，最高 5 级。' },
  point_defense_systems: { name: '点防御系统', description: '高速反空炮拦截突击穿梭机。每级 +10% 防空拦截，解锁防空炮塔；需要 4 级研究实验室，最高 5 级；前置基础装甲板。' },
  point_defense: { name: '点防御系统', description: '高速反空炮拦截突击穿梭机。每级 +10% 防空拦截，解锁防空炮塔；需要 4 级研究实验室，最高 5 级；前置基础装甲板。' },
  basic_sensors: { name: '基础传感器', description: '提高传感器能力，扫描范围扩展到相邻星区。+1 星区可见；需要 1 级研究实验室。' },
  probe_technology: { name: '探测器技术', description: '无人侦察探测器。探测器和其他侦察舰会在探索任务航线上自动探索。+1 星区可见；需要 2 级研究实验室；前置基础传感器。' },
  signal_intelligence: { name: '信号情报', description: '解锁间谍行动，可派间谍探测器截获敌方信号并收集星球情报。需要 2 级研究实验室；前置基础传感器。' },
  basic_computing: { name: '基础计算', description: '并行处理算法加速研究计算。每级 +3% 研究速度；需要 1 级研究实验室，最高 5 级。' },
  advanced_metallurgy: { name: '高级冶金', description: '更优冶炼流程。每级 +3% 合金、+3% 矿石；需要 4 级研究实验室，最高 5 级；前置结构合金。' },
  basic_mining_operations: { name: '基础采矿作业', description: '基础小行星开采，使货运船可从小行星场开采矿石。需要 3 级研究实验室；前置轨道力学。' },
  assembly_lines: { name: '装配线', description: '自动装配加快造船。每级 +5% 船坞速度；需要 4 级研究实验室，最高 5 级；前置结构合金和施工优化。' },
  basic_trade: { name: '基础贸易', description: '玩家殖民地之间的原始贸易系统，解锁玩家交易。需要 3 级研究实验室；前置轨道力学。' },
  market_access: { name: '市场准入', description: '接触流浪商人舰队，解锁银河市场枢纽。需要 3 级研究实验室；前置轨道力学。' },
  cargo_expansion: { name: '货舱扩展', description: '模块化货舱扩展。每级 +8% 货舱容量；需要 5 级研究实验室，最高 5 级；前置运输物流和基础贸易。' },
  trade_contracts: { name: '贸易合约', description: '联盟内部正式贸易协议，启用贸易枢纽联盟贸易。需要 4 级研究实验室；前置基础贸易。' },
  laser_weapons: { name: '激光武器', description: '聚焦能量束，解锁战斗机。每级 +1% 攻击；需要 3 级研究实验室，最高 5 级；前置能源系统和轨道力学。' },
  kinetic_weapons: { name: '动能武器', description: '轨道炮和质量投射器，对装甲目标有效。每级 +3% 攻击；需要 4 级研究实验室，最高 5 级；前置激光武器。' },
  shield_theory: { name: '护盾理论', description: '硅酸盐共振护盾，解锁护盾发生器和仓储隐蔽。每级 +2% 伤害减免；需要 3 级研究实验室，最高 5 级；前置硅酸盐精炼和能源系统。' },
  fighter_doctrine: { name: '战斗机学说', description: '战斗机战术。每级 +2% 攻击；需要 3 级研究实验室，最高 5 级；前置激光武器和轨道力学。' },
  transport_logistics: { name: '运输物流', description: '优化装卸，解锁运输穿梭机。每级 +20% 穿梭机货舱；需要 5 级研究实验室，最高 5 级；前置轨道力学。' },
  ai_officer_protocol: { name: 'AI 军官协议', description: '自动舰队管理，敌对舰队被发现时启用基础自动撤离。需要 5 级研究实验室；前置轨道力学。' },
  fleet_coordination: { name: '舰队协调', description: '协调多支舰队。每级 +1 舰队槽、+1% 舰船速度；需要 3 级研究实验室，最高 5 级；前置轨道力学。' },
  orbital_mechanics: { name: '轨道力学', description: '理解轨道建设，解锁行星船坞、侦察舰和货运船。需要 2 级研究实验室；前置结构合金。' },
  orbital_construction: { name: '轨道建设', description: '零重力制造，解锁轨道船坞。需要 7 级研究实验室；前置轨道力学。' },
  impulse_drive: { name: '脉冲引擎', description: '高推力离子引擎，提高亚光速航行。每级 +4% 舰船速度；需要 3 级研究实验室，最高 5 级；前置轨道力学。' },
  navigation_computer: { name: '导航计算机', description: '自动寻路。1 级启用巡逻并开始提供巡逻容量；更高等级提高舰队指挥并可扩展巡逻容量。每级 +1 舰队槽；需要 3 级研究实验室，最高 5 级。' },
  network_protocols: { name: '网络协议', description: '殖民地间通信网络，启用贸易和数据共享。需要 3 级研究实验室；前置基础计算和轨道力学。' },
  anomaly_scanning: { name: '异常扫描', description: '侦测已探索系统中的引力异常和能量信号。需要 3 级研究实验室；前置基础传感器。' },
  salvage_operations: { name: '残骸回收作业', description: '从太空战斗中收集有价值的残骸和碎片。需要 3 级研究实验室；前置轨道力学。' },
  deep_core_mining: { name: '深核采矿', description: '钻入行星地幔。每级 +3% 矿石、+2% 硅酸盐；需要 6 级研究实验室，最高 5 级；前置高级冶金和改良采矿。' },
  mining_fleet_operations: { name: '采矿舰队作业', description: '小行星场采掘规程，解锁采矿船和气体收集船。需要 7 级研究实验室；前置深核采矿。' },
  mining_fleet_ops: { name: '采矿舰队作业', description: '小行星场采掘规程，解锁采矿船和气体收集船。需要 7 级研究实验室；前置深核采矿。' },
  hydrogen_cracking: { name: '氢裂解', description: '复杂烃催化裂解。每级 +3% 氢气；需要 6 级研究实验室，最高 5 级；前置氢气合成和热能提取。' },
  mass_production: { name: '大规模生产', description: '标准化模块减少舰船成本。每级 -3% 造船成本；需要 6 级研究实验室，最高 5 级；前置装配线。' },
  advanced_refining: { name: '高级精炼', description: '优化冶炼和微重力精炼。+10% 合金，并解锁低重力精炼厂；需要 8 级研究实验室；前置高级冶金和大规模生产。' },
  outpost_engineering: { name: '前哨工程', description: '可在小行星场建造前哨站，解锁工程船和维修船。需要 8 级研究实验室；前置采矿舰队作业和施工优化。' },
  interplanetary_supply_chains: { name: '行星际补给链', description: '恒星系统间自动补给链，解锁物流枢纽。需要 8 级研究实验室；前置超光速理论和基础贸易。' },
  supply_chains: { name: '行星际补给链', description: '恒星系统间自动补给链，解锁物流枢纽。需要 8 级研究实验室；前置超光速理论和基础贸易。' },
  colonial_governance: { name: '殖民治理', description: '集中治理。+10% 人口增长、+1 殖民槽；需要 8 级研究实验室；前置劳动力管理和殖民技术。' },
  cultural_development: { name: '文化发展', description: '推动艺术和文化，解锁文化中心。需要 5 级研究实验室；前置劳动力管理。' },
  genetic_adaptation: { name: '基因适应', description: '定向基因疗法。+15% 人口容量、+1 殖民槽；需要 10 级研究实验室；前置生物农业。' },
  plasma_weapons: { name: '等离子武器', description: '过热等离子弹。每级 +3% 攻击；需要 6 级研究实验室，最高 5 级；前置动能武器和高级冶金。' },
  missile_systems: { name: '导弹系统', description: '自导弹头，解锁导弹巡洋舰。每级 +1% 攻击；需要 7 级研究实验室，最高 5 级；前置动能武器。' },
  electronic_warfare: { name: '电子战', description: '电磁干扰和传感器破坏，解锁电子战舰。每级 +5% 反情报；需要 6 级研究实验室，最高 5 级；前置激光武器和护盾理论。' },
  mine_warfare: { name: '布雷战', description: '部署太空雷进行区域封锁，解锁布雷舰。每级 +5% 防空拦截；需要 5 级研究实验室，最高 5 级；前置动能武器。' },
  advanced_shielding: { name: '高级护盾', description: '所有舰船装备能量护盾。每级 +10% 护盾强度、+2% 伤害减免；需要 6 级研究实验室，最高 5 级；前置护盾理论。' },
  composite_armor: { name: '复合装甲', description: '层状合金陶瓷装甲。每级 +3% 舰船耐久、+1% 舰船速度；需要 6 级研究实验室，最高 5 级；前置基础装甲板和高级冶金。' },
  fortress_protocols: { name: '要塞协议', description: '强化防御教义。每级 +5% 驻军，解锁防御平台；需要 8 级研究实验室，最高 5 级；前置点防御系统和高级护盾。' },
  shield_harmonics: { name: '护盾谐波', description: '调频护盾振荡。每级 +5% 护盾恢复；需要 6 级研究实验室，最高 5 级；前置高级护盾。' },
  colonization_technology: { name: '殖民技术', description: '殖民舰设计和地形协议，解锁殖民船。+1 殖民槽；需要 5 级研究实验室；前置超光速理论和密集住宅模块。' },
  colonization_tech: { name: '殖民技术', description: '殖民舰设计和地形协议，解锁殖民船。+1 殖民槽；需要 5 级研究实验室；前置超光速理论和密集住宅模块。' },
  cruiser_design: { name: '巡洋舰设计', description: '重型战舰蓝图，解锁巡洋舰。每级 +1% 舰船耐久；需要 7 级研究实验室，最高 5 级；前置轨道建设和高级冶金。' },
  carrier_operations: { name: '航母作战', description: '移动空军基地教义，解锁航母。每级 +1% 攻击；需要 8 级研究实验室，最高 5 级；前置巡洋舰设计和战斗机学说。' },
  stealth_technology: { name: '隐形技术', description: '隐形场，解锁隐形舰和月球隐形场。每级 +5% 反情报；需要 7 级研究实验室，最高 5 级；前置电子战。' },
  assault_tactics: { name: '突击战术', description: '高级地面突袭教义，解锁突击穿梭机和黑客船。每级 +1% 攻击；需要 6 级研究实验室，最高 5 级；前置高级护盾和动能武器。' },
  fleet_tactics: { name: '舰队战术', description: '高级战术编队，提供先手优势。每级 +1% 舰队战术、+1% 舰船速度；需要 6 级研究实验室，最高 5 级；前置舰队协调。' },
  alliance_communications: { name: '联盟通信', description: '联盟加密通信。+5% 反情报，并解锁盟友共享视野；需要 6 级研究实验室；前置舰队协调和基础贸易。' },
  ftl_theory: { name: '超光速理论', description: '超光速恒星间航行理论，解锁 FTL 航行。需要 5 级研究实验室；前置轨道力学和氢气合成。' },
  warp_drive: { name: '曲速引擎', description: '时空压缩技术。每级 +6% FTL 速度；需要 6 级研究实验室，最高 5 级；前置超光速理论和脉冲引擎。' },
  fuel_efficiency: { name: '燃料效率', description: '燃料喷注和回收优化。每级 -4% 燃料成本；需要 5 级研究实验室，最高 5 级；前置超光速理论。' },
  deep_space_scanning: { name: '深空扫描', description: '长距亚空间望远镜，大幅拓展传感器范围。需要 5 级研究实验室；前置探测器技术。' },
  counter_intelligence: { name: '反情报', description: '电子反制阻挡敌方扫描。每级 +15% 反情报；需要 7 级研究实验室，最高 5 级；前置信号情报和加密系统。' },
  quantum_computing: { name: '量子计算', description: '量子处理器加速全部研究。每级 +5% 研究速度；需要 6 级研究实验室，最高 5 级；前置网络协议和硅酸盐精炼。' },
  encryption_systems: { name: '加密系统', description: '军用级加密保护通信。每级 +10% 反情报；需要 5 级研究实验室，最高 5 级；前置网络协议。' },
  rift_navigation: { name: '裂隙导航', description: '银河核心引力测绘，可派舰队进入裂隙远征，寻找古代遗迹和暗物质。需要 10 级研究实验室；前置超光速理论和量子计算。' },
  wormhole_theory: { name: '虫洞理论', description: '不稳定虫洞导航模型，可进入 1-2 级虫洞。需要 6 级研究实验室；前置超光速理论和深空扫描。' },
  artifact_analysis: { name: '遗物分析', description: '解码探索中发现的古代科技碎片。需要 6 级研究实验室；前置异常扫描。' },
  lunar_operations: { name: '月球作业', description: '启用月球殖民和资源开采，解锁月球穿梭机。+1 月球槽；需要 10 级研究实验室；前置轨道力学。' },
  rare_resource_extraction: { name: '稀有资源开采', description: '稀有材料高级开采，解锁冰钻船。+25% 低温冰产量；需要 8 级研究实验室；前置采矿舰队作业。' },
  rare_resource_processing: { name: '稀有资源处理', description: '高级精炼量子尘和等离子核心，解锁挖掘机。每级 +20% 量子尘和等离子核心产量；需要 10 级研究实验室，最高 5 级；前置稀有资源开采。' },
  zero_point_energy: { name: '零点能', description: '利用量子真空涨落。+20% 能源，解锁零点发生器；需要 12 级研究实验室；前置高级太阳能收集器和稀有资源处理。' },
  nanofabrication: { name: '纳米制造', description: '分子级装配。每级 +7% 建筑速度、-2% 造船成本；需要 12 级研究实验室，最高 5 级；前置大规模生产和高级精炼。' },
  advanced_outpost_systems: { name: '高级前哨系统', description: '升级前哨模块，提高前哨数量和建筑上限。需要 12 级研究实验室；前置前哨工程。' },
  advanced_outposts: { name: '高级前哨系统', description: '升级前哨模块，提高前哨数量和建筑上限。需要 12 级研究实验室；前置前哨工程。' },
  trade_mastery: { name: '贸易精通', description: '与商会取得更好条款。每级 -0.5% 市场佣金；需要 6 级研究实验室，最高 5 级；前置贸易合约和市场准入。' },
  logistics_mastery: { name: '物流精通', description: '优化补给链。每级 +10% 运输速度；需要 8 级研究实验室，最高 5 级；前置货舱扩展和行星际补给链。' },
  advanced_governance: { name: '高级治理', description: '复杂官僚系统。+2 殖民槽；需要 12 级研究实验室；前置殖民治理。' },
  terraforming: { name: '地貌改造', description: '重塑行星环境，解锁地貌改造功能。+2 殖民槽；需要 14 级研究实验室；前置基因适应和前哨工程。' },
  ion_cannons: { name: '离子炮', description: '离子束瘫痪敌方系统并消耗护盾。每级 +1% 离子瘫痪概率、+1% 攻击；需要 10 级研究实验室，最高 5 级；前置等离子武器和高级护盾。' },
  torpedo_systems: { name: '鱼雷系统', description: '重型弹头，针对资本舰。+15% 鱼雷加成、+1% 攻击；需要 10 级研究实验室；前置导弹系统。' },
  siege_weapons: { name: '攻城武器', description: '轨道轰炸系统。每级 +5% 行星攻击；需要 12 级研究实验室，最高 5 级；前置鱼雷系统和突击战术。' },
  weapons_overcharge: { name: '武器过载', description: '武器电容超频。每级 +3% 攻击；需要 10 级研究实验室，最高 5 级；前置等离子武器。' },
  adaptive_shields: { name: '自适应护盾', description: '护盾动态调频。每级 +3% 伤害减免；需要 10 级研究实验室，最高 5 级；前置护盾谐波。' },
  heavy_armor: { name: '重型装甲', description: '资本舰厚重烧蚀装甲。每级 +3% 舰船耐久；需要 10 级研究实验室，最高 5 级；前置复合装甲。' },
  planetary_fortress: { name: '行星要塞', description: '综合行星防御网络。每级 +8% 行星防御；需要 12 级研究实验室，最高 5 级；前置要塞协议。' },
  battleship_design: { name: '战列舰设计', description: '毁灭性火力战列舰，解锁战列舰。每级 +1% 舰船耐久；需要 12 级研究实验室，最高 5 级；前置巡洋舰设计和重型装甲。' },
  dreadnought_design: { name: '无畏舰设计', description: '超资本舰设计，解锁无畏舰。每级 +1% 攻击；需要 12 级研究实验室，最高 5 级；前置战列舰设计。' },
  fleet_auxiliary_systems: { name: '舰队辅助系统', description: '舰队维护支援船。每级 +2% 舰船耐久；需要 10 级研究实验室，最高 5 级；前置巡洋舰设计和前哨工程。' },
  bomber_wing_doctrine: { name: '轰炸机联队学说', description: '反结构轰炸战术，解锁轰炸机。每级 +2% 行星攻击；需要 10 级研究实验室，最高 5 级；前置航母作战和导弹系统。' },
  bomber_wing: { name: '轰炸机联队学说', description: '反结构轰炸战术，解锁轰炸机。每级 +2% 行星攻击；需要 10 级研究实验室，最高 5 级；前置航母作战和导弹系统。' },
  advanced_ai_officer: { name: '高级 AI 军官', description: '更强威胁分析和智能撤离，撤退时自动装载货物。+2% 舰船速度；需要 10 级研究实验室；前置 AI 军官协议。' },
  grand_strategy: { name: '大战略', description: '最高战术指挥。每级 +2 舰队槽、-10% 燃料成本；需要 12 级研究实验室，最高 5 级；前置舰队战术和神经网络。' },
  combined_operations: { name: '联合作战', description: '与联盟成员协调联合攻击。需要 7 级研究实验室；前置舰队战术和联盟通信。' },
  alliance_logistics: { name: '联盟物流', description: '优化联盟补给线。+30% 转移和赠送任务速度；需要 10 级研究实验室；前置联盟通信和行星际补给链。' },
  jump_drive: { name: '跳跃引擎', description: '点对点瞬时传送，启用月球跳跃门。需要 10 级研究实验室；前置曲速引擎。' },
  advanced_navigation: { name: '高级导航', description: 'AI 路线规划。+2 舰队槽；需要 10 级研究实验室；前置导航计算机和舰队战术。' },
  galactic_cartography: { name: '银河制图', description: '完整绘制你的旋臂，本旋臂内所有星区变为部分可见。需要 8 级研究实验室；前置深空扫描。' },
  quantum_sensors: { name: '量子传感器', description: '量子纠缠传感器探测隐形舰并显示舰队组成。需要 10 级研究实验室；前置银河制图和反情报。' },
  neural_networks: { name: '神经网络', description: '高级 AI 系统。+15% 研究速度、+1 舰队槽；需要 10 级研究实验室；前置量子计算。' },
  cyberwarfare: { name: '网络战', description: '黑入敌方殖民地系统以干扰运行。需要 12 级研究实验室；前置加密系统和电子战。' },
  deep_wormhole_navigation: { name: '深层虫洞导航', description: '导航更深、更危险的虫洞，可进入 3-4 级虫洞。需要 8 级研究实验室；前置虫洞理论和高级护盾。' },
  deep_wormholes: { name: '深层虫洞导航', description: '导航更深、更危险的虫洞，可进入 3-4 级虫洞。需要 8 级研究实验室；前置虫洞理论和高级护盾。' },
  rogue_genesis_research: { name: '失控创世研究', description: '研究失控 AI 模式，在裂隙中遭遇远古 AI。需要 12 级研究实验室；前置裂隙导航和遗物分析。' },
  xenoarchaeology: { name: '异星考古学', description: '研究月球古代外星遗迹，获得独特蓝图和加成。需要 10 级研究实验室；前置遗物分析和月球作业。' },
  lunar_expansion: { name: '月球扩张', description: '高级月球工程，月球殖民上限提高到 3。需要 12 级研究实验室；前置月球作业。' },
  megastructure_engineering: { name: '巨构工程', description: '银河级工程，解锁戴森球、分子装配器和量子枢纽。+3 殖民槽；需要 16 级研究实验室；前置纳米制造和高级前哨系统。' },
  galactic_exchange: { name: '银河交易所', description: '任意殖民地可访问的银河市场，解锁远程交易。需要 14 级研究实验室；前置贸易精通和银河制图。' },
  antimatter_warheads: { name: '反物质弹头', description: '物质反物质湮灭武器。每级 +3% 攻击；需要 14 级研究实验室，最高 5 级；前置武器过载和离子炮。' },
  dark_matter_weapons: { name: '暗物质武器', description: '绕过已知护盾技术的奇异物质武器。每级 +0.5% 穿甲、+1% 攻击，消耗暗物质；需要 16 级研究实验室，最高 5 级；前置反物质弹头和稀有资源处理。' },
  planet_cracker: { name: '行星裂解器', description: '集中引力子束摧毁行星防御和前哨护盾。每级 +5% 行星攻击、+2% 攻击；需要 16 级研究实验室，最高 5 级；前置攻城武器和反物质弹头。' },
  phase_shields: { name: '相位护盾', description: '相位偏移护盾有概率完全无效化来袭命中。每级 +1% 相位闪避、+2% 伤害减免；需要 14 级研究实验室，最高 5 级；前置自适应护盾。' },
  nanobot_repair_systems: { name: '纳米机器人维修系统', description: '自复制纳米机器人在战斗中持续维修。每级 +1% 纳米维修、+1% 舰船耐久；需要 16 级研究实验室，最高 5 级；前置重型装甲和纳米制造。' },
  titan_design: { name: '泰坦设计', description: '唯一旗舰，解锁泰坦。每级 +1% 攻击，消耗量子尘和暗物质；需要 16 级研究实验室，最高 5 级；前置无畏舰设计和巨构工程。' },
  ship_mastery: { name: '舰船精通', description: '完善舰体设计，所有舰船受益。每级 +7% 船坞速度、+2% 舰船耐久；需要 16 级研究实验室，最高 5 级；前置战列舰设计和纳米制造。' },
  supreme_command: { name: '最高指挥', description: '大幅扩展舰队指挥容量。+5 舰队槽；需要 16 级研究实验室；前置大战略。' },
  alliance_mastery: { name: '联盟精通', description: '最高联盟军事协同。+2% 攻击、+2% 伤害减免；需要 16 级研究实验室；前置联盟物流和联合作战。' },
  quantum_drive: { name: '量子引擎', description: '量子隧穿推进，最快且最高效。每级 +8% FTL 速度、-6% 燃料成本；需要 14 级研究实验室，最高 5 级；前置跳跃引擎和曲速引擎。' },
  galactic_highway_network: { name: '银河高速网络', description: '互联跳跃门网络，殖民地间可瞬时舰队转移。需要 16 级研究实验室；前置高级导航和跳跃引擎。' },
  omniscience_array: { name: '全知阵列', description: '遍布银河的量子纠缠传感器网络，获得所有系统可见性。需要 14 级研究实验室；前置量子传感器。' },
  artificial_consciousness: { name: '人工意识', description: '自进化 AI 大幅减少研究时间。每级 +5% 研究速度；需要 14 级研究实验室，最高 5 级；前置神经网络。' },
  genesis_core_hacking: { name: '创世核心入侵', description: '黑入失控创世 AI 核心，获取其高级技术。需要 14 级研究实验室；前置失控创世研究和深层虫洞导航。' },
  transcendent_artifacts: { name: '超凡遗物', description: '用古代组件打造强大神器，是最强 PvE 奖励路线之一。需要 16 级研究实验室；前置异星考古学和创世核心入侵。' },
  alcubierre_bubble_drive: { name: '阿尔库别瑞泡泡引擎', description: '让舰队周围时空弯曲，实现极高速且完全不被传感器发现的航行。每次消耗反物质，成本包含暗物质和反物质；需要 16 级研究实验室；前置量子引擎和反物质弹头。' },
  lunar_mastery: { name: '月球精通', description: '完全掌控月球殖民。月球殖民上限提高到 5；需要 14 级研究实验室；前置月球扩张。' },
});

const GAME_TERM_REPLACEMENTS = Object.freeze({
  'Electronic Warfare Ship': '电子战舰',
  'Missile Cruiser': '导弹巡洋舰',
  'Torpedo Frigate': '鱼雷护卫舰',
  'Assault Shuttle': '突击穿梭机',
  'Hacker Ship': '黑客船',
  'Colony Ship': '殖民船',
  'Engineer Ship': '工程船',
  'Stealth Ship': '隐形舰',
  'Spy Probe': '间谍探测器',
  'Mining Vessel': '采矿船',
  'Gas Collector': '气体收集船',
  'Ice Drill': '冰钻船',
  'Repair Ship': '维修船',
  'Lunar Shuttle': '月球穿梭机',
  'Transport Shuttle': '运输穿梭机',
  'Ore Freighter': '矿石货运船',
  'Bulk Carrier': '大型货运船',
  Scout: '侦察舰',
  Fighter: '战斗机',
  Interceptor: '截击机',
  Cruiser: '巡洋舰',
  Carrier: '航母',
  Battleship: '战列舰',
  Bomber: '轰炸机',
  Dreadnought: '无畏舰',
  Titan: '泰坦',
  Freighter: '货运船',
  Probe: '探测器',
  Tanker: '油船',
  Excavator: '挖掘机',
  'Research Lab': '研究实验室',
  Lab: '研究实验室',
  Ore: '矿石',
  Silicates: '硅酸盐',
  Hydrogen: '氢',
  Alloys: '合金',
  'Cryo-Ice': '低温冰',
  'Quantum Dust': '量子尘',
  'Plasma Core': '等离子核心',
  'Dark Matter': '暗物质',
  Antimatter: '反物质',
  Kinetic: '动能',
  Laser: '激光',
  Plasma: '等离子',
  Missile: '导弹',
  Ion: '离子',
  Light: '轻型',
  Medium: '中型',
  Heavy: '重型',
  Shielded: '护盾型',
});

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function researchInfoFor(tech) {
  if (!tech || typeof tech !== 'object') return RESEARCH_INFO_ZH[normGameKey(tech)];
  const def = tech.definition || tech.researchDefinition || {};
  const candidates = [
    tech.key, tech.researchKey, tech.slug, tech.code,
    def.key, def.researchKey, def.slug,
    tech.name, tech.displayName, tech.title,
    def.name, def.displayName, def.title,
  ];
  for (const candidate of candidates) {
    const info = RESEARCH_INFO_ZH[normGameKey(candidate)];
    if (info) return info;
  }
  return undefined;
}

export function translateGameTerms(text) {
  if (text == null) return '';
  let out = String(text);
  const entries = Object.entries(GAME_TERM_REPLACEMENTS).sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of entries) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(from)}\\b`, 'g'), to);
  }
  return out;
}

export function shipDisplayName(ship, fallback) {
  const isObj = ship && typeof ship === 'object';
  const def = isObj ? (ship.definition || ship.shipDefinition || {}) : {};
  const candidates = isObj ? [
    ship.key, ship.shipKey, ship.slug, ship.code,
    def.key, def.shipKey, def.slug,
    ship.name, ship.shipName, ship.displayName, ship.title,
    def.name, def.shipName, def.displayName, def.title,
  ] : [ship];

  for (const candidate of candidates) {
    const norm = normGameKey(candidate);
    if (!norm) continue;
    const direct = SHIP_NAME_LABELS[norm];
    if (direct) return direct;

    const parts = norm.split('_').filter(Boolean);
    const prefixes = [];
    while (parts.length && SHIP_PREFIX_LABELS[parts[0]]) prefixes.push(SHIP_PREFIX_LABELS[parts.shift()]);
    let base = SHIP_NAME_LABELS[parts.join('_')];
    if (!base && parts[parts.length - 1] === 'ship') base = SHIP_NAME_LABELS[parts.slice(0, -1).join('_')];
    if (base) return `${prefixes.join('')}${base}`;
  }

  const displayCandidates = isObj ? [
    ship.name, ship.shipName, ship.displayName, ship.title,
    def.name, def.shipName, def.displayName, def.title,
  ] : [ship];
  const raw = displayCandidates.find(value => typeof value === 'string' && value.trim());
  return translateGameTerms(raw || fallback || '');
}

export function isCommandVessel(ship) {
  if (!ship) return false;
  const isObj = typeof ship === 'object';
  const key = normGameKey(isObj ? (ship.key ?? ship.shipKey) : '');
  const raw = String(isObj ? (ship.name ?? ship.shipName ?? '') : ship);
  const name = normGameKey(raw);
  return key === 'command_vessel' ||
    key === 'leader_command_vessel' ||
    name === 'command_vessel' ||
    name === 'leader_command_vessel' ||
    /command\s+vessel/i.test(raw) ||
    raw.includes('指挥舰');
}

export function commandVesselIds(shipDefs = []) {
  return new Set((shipDefs || [])
    .filter(isCommandVessel)
    .map(s => Number(s.shipDefId))
    .filter(Number.isFinite));
}

export function normalizeRetreatThreshold(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ratio = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0.01, ratio));
}

export function templateRetreatThreshold(template) {
  return normalizeRetreatThreshold(template && template.escortRetreatThreshold);
}

export function retreatThresholdLabel(value) {
  const n = normalizeRetreatThreshold(value);
  return n == null ? '' : `${Math.round(n * 100)}%`;
}

export function templateWantsLeader(template, shipDefs = []) {
  if (!template) return false;
  if (template.attachLeader) return true;
  const ids = commandVesselIds(shipDefs);
  return Object.entries(template.ships || {})
    .some(([id, quantity]) => ids.has(Number(id)) && Number(quantity) > 0);
}

export function templateRegularShips(template, shipDefs = []) {
  const ids = commandVesselIds(shipDefs);
  return Object.entries((template && template.ships) || {})
    .map(([shipDefId, quantity]) => ({ shipDefId: Number(shipDefId), quantity }))
    .filter(s => s.quantity > 0 && !ids.has(s.shipDefId));
}

export function techDisplayName(tech) {
  const info = researchInfoFor(tech);
  if (info?.name) return info.name;
  if (tech && typeof tech === 'object') {
    const def = tech.definition || tech.researchDefinition || {};
    const raw = tech.name || tech.displayName || tech.title || def.name || def.displayName || def.title;
    const key = tech.key || tech.researchKey || tech.slug || def.key || def.researchKey || def.slug;
    return translateGameTerms(raw || uiLabel(key));
  }
  return translateGameTerms(uiLabel(tech));
}

export function techDisplayDescription(tech) {
  const info = researchInfoFor(tech);
  if (info?.description) return info.description;
  const def = tech && typeof tech === 'object' ? (tech.definition || tech.researchDefinition || {}) : {};
  const raw = tech && typeof tech === 'object'
    ? (tech.description || tech.displayDescription || def.description || def.displayDescription)
    : tech;
  return translateGameTerms(raw || '');
}

// Translate stable game enum values for display without changing the values
// used by APIs, filters, storage, or calculations.
const UI_LABELS = Object.freeze({
  ...SHIP_NAME_LABELS,
  ore: '矿石', silicates: '硅酸盐', hydrogen: '氢', alloys: '合金',
  cryo_ice: '低温冰', ice: '冰', quantum_dust: '量子尘', plasma_core: '等离子核心',
  bio_extract: '生物提取物', dark_matter: '暗物质', antimatter: '反物质',
  precursor_fragments: '先驱碎片', artifact: '遗物',
  sentinel: '哨兵区', open: '开放区', dead: '死亡区', rift: '裂隙区', unknown: '未知',
  unknown_target: '未知目标',
  resource_cache: '资源储藏点', rogue_drone: '失控无人机', pirate_base: '海盗基地',
  ruins_survey_complete: '遗迹勘测完成', empty: '空无一物', ambush: '伏击',
  attacker_won: '进攻方胜利', defender_won: '防守方胜利', defender_held: '防守方坚守',
  mutual_destruction: '同归于尽', victory: '胜利', defeat: '失败', won: '胜利', lost: '失败',
  success: '成功', failed: '失败', draw: '平局', stalemate: '僵局',
  military: '军事', science: '科学', economy: '经济',
  maxed: '已满级', researched: '已研究', researching: '研究中', available: '可用', locked: '未解锁',
  active: '进行中', completed: '已完成', in_progress: '进行中', pending: '等待中',
  outbound: '出航中', en_route: '航行中', returning: '返航中', arrived: '已抵达', cancelled: '已取消',
  ancient: '远古型', barren: '荒芜型', crystalline: '晶体型', frozen: '冰封型', gas: '气态型',
  gas_giant: '气态巨行星', hollow: '空心型', icy: '冰冻型', metallic: '金属型', oceanic: '海洋型',
  rocky: '岩石型', terra: '类地型', volcanic: '火山型', arid: '干旱型', desert: '沙漠型',
  toxic: '剧毒型', tundra: '苔原型',
  survey: '勘测', investigate: '调查', collect_debris: '回收残骸', collect_salvage: '回收残余物',
  expedition: '远征', pirate: '海盗', mining: '采矿', mine: '采矿', debris: '残骸', xeno: '异星遗迹',
  xeno_survey: '遗迹勘测', spy: '间谍侦察', attack: '攻击', raid: '突袭', camp_scout: '营地侦察',
  deliver: '运送', transfer: '转移',
  kinetic: '动能', laser: '激光', plasma: '等离子', missile: '导弹', ion: '离子',
  light: '轻型装甲', medium: '中型装甲', heavy: '重型装甲', shielded: '护盾装甲',
  combat: '战斗', special: '特殊', recon: '侦察', utility: '通用',
  missile_defense: '导弹防御阵列', laser_defense: '激光防御阵列', railgun_defense: '轨道炮防御阵列',
  plasma_defense: '等离子防御阵列', ion_defense: '离子防御阵列', ew_system: '电子战系统',
  low: '少量', medium_amount: '中等', high: '大量', very_low: '极少', very_high: '极多', none: '无',
});

export function uiLabel(value) {
  const raw = String(value ?? '');
  if (/^Wormhole #\d+$/i.test(raw)) return raw.replace(/^Wormhole/i, '虫洞');
  if (/^System #\d+$/i.test(raw)) return raw.replace(/^System/i, '星系');
  const key = normGameKey(raw);
  return UI_LABELS[key] || raw.replace(/_/g, ' ');
}

// ── In-flight mission progress bars ─────────────────────────────────────────
// Shared by any tab that lists fleets in transit (Scouting, Expeditions, …).

export function fmtCountdown(ms) {
  if (ms <= 0) return '已到期';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = n => String(n).padStart(2, '0');
  if (h) return `${h}时 ${pad(m)}分 ${pad(sec)}秒`;
  if (m) return `${m}分 ${pad(sec)}秒`;
  return `${sec}秒`;
}

const MISSION_WORK_LABEL = { survey: '正在勘测', investigate: '正在调查',
  collect_debris: '正在回收', collect_salvage: '正在回收', expedition: '正在探索',
  mine: '正在采矿' };

// Where a fleet is in its round trip: outbound (departs→arrives), on-site work
// (arrives→returnDeparts), or returning (returnDeparts→returnArrives). Returns
// the active leg's label, colour, 0..1 fraction, and ETA (ms) to that leg's end.
export function missionProgress(m) {
  const raw = k => k.split('.').reduce((o, p) => (o && o[p] != null ? o[p] : null), m);
  const asTime = v => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
    if (/^\d+(\.\d+)?$/.test(String(v).trim())) {
      const n = Number(v);
      return n < 1e12 ? n * 1000 : n;
    }
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : null;
  };
  const asDuration = v => {
    if (v == null || v === '') return null;
    if (typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v).trim())) {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? (n > 86400 ? n : n * 1000) : null;
    }
    const s = String(v).trim().toLowerCase();
    const colon = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
    if (colon) {
      const parts = colon.slice(1).filter(x => x != null).map(Number);
      const seconds = parts.length === 3
        ? parts[0] * 3600 + parts[1] * 60 + parts[2]
        : parts[0] * 60 + parts[1];
      return seconds > 0 ? seconds * 1000 : null;
    }
    let seconds = 0, matched = false, part;
    const re = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|小时|时|minutes?|mins?|m|分钟|分|seconds?|secs?|s|秒)/g;
    while ((part = re.exec(s))) {
      const n = Number(part[1]);
      const u = part[2];
      matched = true;
      if (/^(hours?|hrs?|h|小时|时)$/.test(u)) seconds += n * 3600;
      else if (/^(minutes?|mins?|m|分钟|分)$/.test(u)) seconds += n * 60;
      else seconds += n;
    }
    return matched && seconds > 0 ? seconds * 1000 : null;
  };
  const firstTime = (...keys) => {
    for (const k of keys) {
      const t = asTime(raw(k));
      if (t != null) return t;
    }
    return null;
  };
  const firstDuration = (...keys) => {
    for (const k of keys) {
      const ms = asDuration(raw(k));
      if (ms != null) return ms;
    }
    return null;
  };
  const now = Date.now();
  let dep = firstTime('departsAt', 'departedAt', 'departureAt', 'departureTime',
    'launchTime', 'launchedAt', 'startedAt', 'startAt', 'startTime', 'createdAt',
    'departs_at', 'departed_at', 'departure_at', 'departure_time', 'launch_time',
    'launched_at', 'started_at', 'start_at', 'start_time', 'created_at');
  let arr = firstTime('arrivesAt', 'arrivedAt', 'arrivalAt', 'arrivalTime',
    'targetArrivesAt', 'targetArrivalAt', 'destinationArrivesAt', 'outboundArrivesAt',
    'outboundArrivalAt', 'arrives_at', 'arrived_at', 'arrival_at', 'arrival_time',
    'target_arrives_at', 'target_arrival_at', 'destination_arrives_at',
    'outbound_arrives_at', 'outbound_arrival_at');
  let rdep = firstTime('returnDepartsAt', 'returnDepartureAt', 'returnStartedAt',
    'returnStartsAt', 'returnStartAt', 'returnStartTime', 'returningAt',
    'return_departs_at', 'return_departure_at', 'return_started_at',
    'return_starts_at', 'return_start_at', 'return_start_time', 'returning_at');
  let rarr = firstTime('returnArrivesAt', 'returnArrivalAt', 'returnAt',
    'returnTime', 'returnEtaAt', 'returnEta', 'homeArrivesAt', 'homeArrivalAt',
    'return_arrives_at', 'return_arrival_at', 'return_at', 'return_time',
    'return_eta_at', 'return_eta', 'home_arrives_at', 'home_arrival_at');
  const work = MISSION_WORK_LABEL[m.missionType] || '正在执行';
  let fallback = null;
  if (m.missionType === 'mine') {
    const status = String(raw('status') ?? raw('phase') ?? raw('state') ??
      raw('missionStatus') ?? raw('currentStage') ?? '').toLowerCase();
    const miningActive = !status || /min|mine|harvest|extract|采矿|开采/.test(status);
    const returningActive = /return|返航/.test(status);
    const durationMs = firstDuration('miningDuration', 'miningDurationSeconds',
      'duration', 'durationSeconds', 'workDuration', 'workDurationSeconds',
      'operationDuration', 'operationDurationSeconds', 'raidParams.miningDuration',
      'mining_duration', 'mining_duration_seconds', 'duration_seconds',
      'work_duration', 'work_duration_seconds', 'operation_duration',
      'operation_duration_seconds');
    const remainingMs = firstDuration('remainingMs', 'remainingMilliseconds',
      'timeRemainingMs', 'etaMs', 'remainingSeconds', 'secondsRemaining',
      'timeRemainingSeconds', 'etaSeconds', 'remainingTime', 'timeRemaining',
      'remaining', 'timeLeft', 'countdown', 'timeUntilComplete',
      'timeUntilCompletion', 'secondsUntilComplete', 'secondsUntilCompletion',
      'secondsToComplete', 'secondsToCompletion', 'remainingDuration',
      'remainingDurationSeconds', 'phaseRemainingSeconds',
      'currentPhaseRemainingSeconds', 'stageRemainingSeconds',
      'workRemainingSeconds', 'operationRemainingSeconds',
      'raidParams.remainingSeconds',
      'raidParams.remainingTime', 'raidParams.timeRemaining',
      'remaining_ms', 'remaining_milliseconds', 'time_remaining_ms', 'eta_ms',
      'remaining_seconds', 'seconds_remaining', 'time_remaining_seconds',
      'eta_seconds', 'remaining_time', 'time_remaining', 'time_left',
      'time_until_complete', 'time_until_completion', 'seconds_until_complete',
      'seconds_until_completion', 'seconds_to_complete', 'seconds_to_completion',
      'remaining_duration', 'remaining_duration_seconds',
      'phase_remaining_seconds', 'current_phase_remaining_seconds',
      'stage_remaining_seconds', 'work_remaining_seconds',
      'operation_remaining_seconds');
    const explicitMineStart = firstTime('miningStartsAt', 'miningStartAt',
      'mineStartsAt', 'mineStartAt', 'workStartsAt', 'workStartAt',
      'operationStartsAt', 'operationStartAt', 'activityStartsAt', 'activityStartAt',
      'raidParams.miningStartsAt', 'raidParams.miningStartAt',
      'mining_starts_at', 'mining_start_at', 'mine_starts_at', 'mine_start_at',
      'work_starts_at', 'work_start_at', 'operation_starts_at',
      'operation_start_at', 'activity_starts_at', 'activity_start_at');
    const explicitMineEnd = firstTime('miningEndsAt', 'miningEndAt', 'mineEndsAt', 'mineEndAt',
      'miningCompletesAt', 'miningCompleteAt', 'workEndsAt', 'workEndAt',
      'operationEndsAt', 'operationEndAt', 'activityEndsAt', 'activityEndAt',
      'phaseEndsAt', 'phaseEndAt', 'currentPhaseEndsAt', 'currentPhaseEndAt',
      'currentStageEndsAt', 'currentStageEndAt', 'stageEndsAt', 'stageEndAt',
      'actionEndsAt', 'actionEndAt', 'activeUntil', 'nextTransitionAt',
      'endsAt', 'endAt', 'completeAt', 'completionAt',
      'raidParams.miningEndsAt', 'raidParams.miningEndAt',
      'mining_ends_at', 'mining_end_at', 'mine_ends_at', 'mine_end_at',
      'mining_completes_at', 'mining_complete_at', 'work_ends_at', 'work_end_at',
      'operation_ends_at', 'operation_end_at', 'activity_ends_at',
      'activity_end_at', 'phase_ends_at', 'phase_end_at',
      'current_phase_ends_at', 'current_phase_end_at',
      'current_stage_ends_at', 'current_stage_end_at', 'stage_ends_at',
      'stage_end_at', 'action_ends_at', 'action_end_at', 'active_until',
      'next_transition_at', 'ends_at', 'end_at', 'complete_at', 'completion_at');
    if (!arr && explicitMineStart) arr = explicitMineStart;
    if (!rdep) rdep = explicitMineEnd || (arr && durationMs ? arr + durationMs : null);
    if (miningActive && remainingMs) {
      const liveEnd = now + remainingMs;
      if (!rdep || rdep <= now || Math.abs(rdep - liveEnd) > 5000) rdep = liveEnd;
    } else if (!rdep && remainingMs) {
      rdep = now + remainingMs;
    }
    if (!arr && rdep && durationMs) arr = rdep - durationMs;
    if (!arr && miningActive && rdep) arr = durationMs ? rdep - durationMs : now - 1;
    if (!rarr) rarr = firstTime('endsAt', 'endAt', 'completedAt', 'completionAt',
      'completeAt', 'endedAt', 'ends_at', 'end_at', 'completed_at',
      'completion_at', 'complete_at', 'ended_at');
    if (returningActive && remainingMs && !rarr) {
      if (!rdep) rdep = now - 1;
      rarr = now + remainingMs;
    }
    if (miningActive) {
      const eta = rdep ? Math.max(0, rdep - now) : (remainingMs || 0);
      const frac = durationMs && remainingMs
        ? Math.max(0, Math.min(1, 1 - remainingMs / durationMs))
        : (arr && rdep && rdep > arr ? Math.max(0, Math.min(1, (now - arr) / (rdep - arr))) : 0.5);
      fallback = { label: work, color: '#f0883e', frac, eta };
    }
  }
  const stages = [];
  if (dep && arr) stages.push(['航行中', '#58a6ff', dep, arr]);
  if (arr && rdep) stages.push([work, '#f0883e', arr, rdep]);
  if (rdep && rarr) stages.push(['返航中', '#56d364', rdep, rarr]);
  for (const [label, color, s, e] of stages) {
      if (now < e) return { label, color, frac: now <= s ? 0 : Math.min(1, (now - s) / (e - s)), eta: e - now };
  }
  if (fallback) return fallback;
  return { label: '即将抵达…', color: '#8b949e', frac: 1, eta: 0 };
}

// Compact inline progress bar for a table cell or transit-list row. Returns
// { el, upd }; caller registers `upd` somewhere it gets called every second.
export function makeMissionBar(m) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-top:5px; min-width:120px;';
  const track = document.createElement('div');
  track.style.cssText = 'height:6px; border-radius:4px; background:#21262d; overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'height:100%; border-radius:4px; transition:width 0.5s linear;';
  track.appendChild(fill);
  const cap = document.createElement('div');
  cap.style.cssText = 'display:flex; justify-content:space-between; gap:6px; font-size:0.7rem; margin-top:2px;';
  const ph = document.createElement('span'), et = document.createElement('span');
  et.style.cssText = 'color:#8b949e; font-variant-numeric:tabular-nums;';
  cap.append(ph, et);
  wrap.append(track, cap);
  const upd = () => {
    const p = missionProgress(m);
    fill.style.width = `${(p.frac * 100).toFixed(1)}%`;
    fill.style.background = p.color;
    ph.textContent = p.label; ph.style.color = p.color;
    et.textContent = p.eta > 0 ? fmtCountdown(p.eta) : '—';
  };
  upd();
  return { el: wrap, upd };
}

// Escape a string for safe interpolation into an innerHTML template. Names
// (ship/tech/colony) come from the game API or the player and must never be
// trusted as markup.
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Mode-aware data helpers ────────────────────────────────────────────────

export function getMode() {
  return document.getElementById('mode-select').value; // 'all'|'daily'|'last3'|'last7'|'last30'|'hourly'
}

// Local-time bucket keys. created_at is stored as UTC/server time; bucketing on
// the raw ISO string mis-files reports near local midnight by the UTC offset.
const pad2 = n => String(n).padStart(2, '0');
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export function hourKey(ts) {
  const d = new Date(ts);
  return `${dayKey(d)}T${pad2(d.getHours())}:00`;
}
export function bucketKey(ts, byHour) {
  return byHour ? hourKey(ts) : dayKey(ts);
}

// Day range from the Days picker, as { from, to } 'YYYY-MM-DD' ('' = open).
export function getWindowRange() {
  const f = document.getElementById('window-from');
  const t = document.getElementById('window-to');
  return { from: f ? f.value : '', to: t ? t.value : '' };
}

// True when the Days picker has a From and/or To set (a range is in effect).
export function windowActive() {
  const { from, to } = getWindowRange();
  return !!(from || to);
}

// Filter records to the Days picker range (by local day). Open range = all.
export function inWindowRange(records) {
  const { from, to } = getWindowRange();
  if (!from && !to) return records || [];
  return (records || []).filter(r => {
    const day = dayKey(r.created_at);
    return (!from || day >= from) && (!to || day <= to);
  });
}

// Fuel (hydrogen) spent, summed from the per-mission fuel log for a tab type
// ('survey'|'pirate'|'mining'|'debris'|'expedition'|'all'), honouring the
// current View + Zone. Counted per launched fleet, independent of reports.
export function fuelForMode(type, mode) {
  let rows = store.fuel_log || [];
  if (type !== 'all') rows = rows.filter(e => e.type === type);
  rows = filterZone(rows);
  if (mode !== 'all') rows = inWindowRange(rows);
  return rows.reduce((s, e) => s + (e.fuel || 0), 0);
}

// Selected security zone, or 'all'.
export function getZone() {
  const el = document.getElementById('zone-select');
  return el ? el.value : 'all';
}

// Filter records to the selected zone (passthrough when 'all'). Records from
// before zones were tracked have no `zone` → treated as 'unknown'.
export function filterZone(reports) {
  const z = getZone();
  if (z === 'all') return reports || [];
  return (reports || []).filter(r => (r.zone || 'unknown') === z);
}

// True when the precomputed all-time totals can be used as-is (no zone filter).
export function isUnfiltered() {
  return getZone() === 'all';
}

export function getLabelKey(mode) {
  return mode === 'hourly' ? 'hour' : 'day';
}

const shortDate = s => new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export function periodLabelFor(mode) {
  if (mode === 'all') return '';
  const { from, to } = getWindowRange();
  if (!from && !to) return '';
  if (from && to) return from === to ? ` (${shortDate(from)})` : ` (${shortDate(from)}–${shortDate(to)})`;
  return from ? `（自 ${shortDate(from)}）` : `（截至 ${shortDate(to)}）`;
}

// ── Shared per-tab helpers ─────────────────────────────────────────────────
// Every tab follows the same pattern: slice the latest day/hour out of its
// report history, optionally compute an hourly series, and draw the standard
// three-resource line chart. The per-tab code only supplies field getters.

// Records to aggregate for the current mode + zone: zone-filtered all-time for
// 'all' mode, else the zone-filtered records within the Days picker range.
export function recordsForMode(allRecords, mode) {
  const filtered = filterZone(allRecords || []);
  if (mode === 'all' && !windowActive()) return filtered;   // a set range overrides All time
  return inWindowRange(filtered);
}

// Time series grouped by day (all/daily modes) or hour (hourly mode).
// fieldGetters: { field: r => value }.
export function computeSeries(reports, mode, fieldGetters) {
  const byHour = mode === 'hourly';
  const keyName = byHour ? 'hour' : 'day';
  const fields = Object.keys(fieldGetters);
  const map = {};
  for (const r of reports) {
    const k = bucketKey(r.created_at, byHour);
    if (!map[k]) {
      map[k] = { [keyName]: k };
      for (const f of fields) map[k][f] = 0;
    }
    for (const [f, get] of Object.entries(fieldGetters)) map[k][f] += get(r);
  }
  const keys = Object.keys(map).sort();
  if (keys.length < 2) return keys.map(k => map[k]);

  // Fill empty days/hours with zero rows so the time axis stays continuous —
  // otherwise the chart's equal-spaced labels misrepresent gaps in activity.
  // Step in LOCAL calendar units (handles the UTC offset and DST correctly).
  const toDate = k => new Date(byHour ? `${k}:00` : `${k}T00:00:00`);   // local time
  const blank = k => { const o = { [keyName]: k }; for (const f of fields) o[f] = 0; return o; };
  const out = [];
  const endD = toDate(keys[keys.length - 1]);
  let cur = toDate(keys[0]), guard = 0;
  while (cur <= endD && guard++ < 100000) {
    const k = bucketKey(cur, byHour);
    out.push(map[k] || blank(k));
    if (byHour) cur.setHours(cur.getHours() + 1); else cur.setDate(cur.getDate() + 1);
  }
  const { from, to } = getWindowRange();
  if (!from && !to) return out;
  return out.filter(o => {
    const day = String(o[keyName] || '').slice(0, 10);   // 'hour' keys are YYYY-MM-DDTHH:00
    return (!from || day >= from) && (!to || day <= to);
  });
}

export const RESOURCE_SERIES = [
  { field: 'ore',          label: '矿石',       color: '#f0883e' },
  { field: 'silicates',    label: '硅酸盐',     color: '#56d364' },
  { field: 'hydrogen',     label: '氢',         color: '#79c0ff' },
  { field: 'alloys',       label: '合金',       color: '#e3b341' },
  { field: 'cryo_ice',     label: '低温冰',     color: '#a5d6ff' },
  { field: 'quantum_dust', label: '量子尘',     color: '#bc8cff' },
  { field: 'plasma_core',  label: '等离子核心', color: '#ff7b72' },
  { field: 'dark_matter',  label: '暗物质',     color: '#d2a8ff' },
  { field: 'antimatter',   label: '反物质',     color: '#ffa657' },
  { field: 'precursor_fragments', label: '先驱碎片', color: '#7ee787' },
  { field: 'artifact',            label: '遗物',     color: '#d29922' },
];

// fieldGetters covering every chartable resource, for computeSeries.
export const SERIES_GETTERS = {};
for (const d of RESOURCE_SERIES) SERIES_GETTERS[d.field] = r => r[d.field] || 0;

// Resource line chart. Ore/silicates/hydrogen always shown; alloys + exotics
// only when the series actually carries some (avoids a wall of flat-zero lines).
// `count` = { field, label } adds a report-count line on a secondary y-axis.
export function makeResourceLineChart(canvasId, series, labelKey, count) {
  const ALWAYS = new Set(['ore', 'silicates', 'hydrogen']);
  const shown = RESOURCE_SERIES.filter(d =>
    ALWAYS.has(d.field) || series.some(r => (r[d.field] || 0) > 0));
  const datasets = shown.map(d => ({
    label: d.label,
    data: series.map(r => r[d.field] || 0),
    borderColor: d.color,
    backgroundColor: d.color + '22',
    fill: true,
    tension: 0.3,
  }));
  const scales = { ...SCALE_OPTS };
  if (count) {
    datasets.push({
      label: count.label,
      data: series.map(r => r[count.field] || 0),
      borderColor: '#8b949e',
      borderDash: [5, 4],
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.3,
      yAxisID: 'count',
    });
    scales.count = {
      position: 'right',
      beginAtZero: true,
      ticks: { color: '#8b949e', precision: 0 },
      grid: { drawOnChartArea: false },
    };
  }
  return new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: { labels: series.map(r => r[labelKey]), datasets },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#e6edf3' } } },
      scales,
    },
  });
}

// ── Pure aggregation helpers ───────────────────────────────────────────────

export function computeEventBreakdown(reports) {
  const map = {};
  for (const r of reports) {
    const et = r.event_type || 'unknown';
    if (!map[et]) map[et] = { event_type: et, count: 0, ore: 0, hydrogen: 0, silicates: 0 };
    map[et].count += 1;
    map[et].ore += r.ore || 0;
    map[et].hydrogen += r.hydrogen || 0;
    map[et].silicates += r.silicates || 0;
    for (const k of EXTRA_RES_KEYS_UI) map[et][k] = (map[et][k] || 0) + (r[k] || 0);
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
}

// A damaged ship costs half its build cost to repair.
export const REPAIR_FACTOR = 0.5;

export function emptyResources() {
  return { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} };
}

// Loss split into full-cost destruction and half-cost repair of damaged ships.
// Returns { destroyed, repair }, each an emptyResources()-shaped object.
export function computeResourcesLost(reports, ships) {
  const out = { destroyed: emptyResources(), repair: emptyResources() };
  const add = (into, detail, factor) => {
    for (const [defId, qty] of Object.entries(detail || {})) {
      const ship = ships[defId];
      if (!ship) continue;
      const q = qty * factor;
      into.ore += q * (ship.costOre || 0);
      into.silicates += q * (ship.costSilicates || 0);
      into.hydrogen += q * (ship.costHydrogen || 0);
      into.alloys += q * (ship.costAlloys || 0);
      for (const [k, v] of Object.entries(ship.rareCosts || {})) {
        into.rare[k] = (into.rare[k] || 0) + q * v;
      }
    }
  };
  for (const r of reports) {
    add(out.destroyed, r.ships_lost_detail, 1);
    add(out.repair, r.ships_damaged_detail, REPAIR_FACTOR);
  }
  return out;
}

// Ship-loss build cost from raw ships_destroyed_raw arrays
// ([{shipDefId,quantity}] or [{key,lost}]) — the shape expeditions/wormholes/
// xeno store per-record, as opposed to computeResourcesLost's shipDefId→qty
// map. Ships destroyed outright (no repair concept for these encounters).
export function computeRawLossCost(reports, ships) {
  const out = emptyResources();
  const byKey = {};
  for (const s of Object.values(ships || {})) if (s && s.key) byKey[s.key] = s;
  for (const r of reports) {
    for (const i of (r.ships_destroyed_raw || [])) {
      const ship = i.shipDefId != null ? ships[i.shipDefId] : byKey[i.key];
      if (!ship) continue;
      const q = i.quantity ?? i.lost ?? 1;
      out.ore += q * (ship.costOre || 0);
      out.silicates += q * (ship.costSilicates || 0);
      out.hydrogen += q * (ship.costHydrogen || 0);
      out.alloys += q * (ship.costAlloys || 0);
      for (const [k, v] of Object.entries(ship.rareCosts || {})) out.rare[k] = (out.rare[k] || 0) + q * v;
    }
  }
  return out;
}

// Per-resource destroyed + repair, for net calculations.
export function combinedLost(lost) {
  const d = lost.destroyed || {}, r = lost.repair || {};
  const out = emptyResources();
  for (const k of ['ore', 'silicates', 'hydrogen', 'alloys']) out[k] = (d[k] || 0) + (r[k] || 0);
  for (const src of [d.rare || {}, r.rare || {}]) {
    for (const [k, v] of Object.entries(src)) out.rare[k] = (out.rare[k] || 0) + v;
  }
  return out;
}

// ── Stat cards ─────────────────────────────────────────────────────────────

export function makeStatCard(label, value, valueClass, valueStyle) {
  const card = document.createElement('div');
  card.className = 'stat-card';
  const labelDiv = document.createElement('div');
  labelDiv.className = 'label';
  labelDiv.textContent = label;
  const valueDiv = document.createElement('div');
  valueDiv.className = valueClass ? `value ${valueClass}` : 'value';
  if (valueStyle) valueDiv.style.cssText = valueStyle;
  valueDiv.textContent = value;
  card.append(labelDiv, valueDiv);
  return card;
}

// ── Charts ─────────────────────────────────────────────────────────────────

export const SCALE_OPTS = {
  x: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } },
  y: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } },
};

// ── Shared helpers for the newer tabs ──────────────────────────────────────

export function zeroCell(v) {
  const td = document.createElement('td');
  if (v) {
    td.textContent = Number(v).toLocaleString();
  } else {
    const span = document.createElement('span');
    span.className = 'zero';
    span.textContent = '—';
    td.appendChild(span);
  }
  return td;
}

// Alloys + exotic resources, shown as their own collected cards. Values may be
// stored flat on totals or inside a `rare` map; read either.
export const EXTRA_RESOURCES = [
  ['alloys', '合金', 'alloys'],
  ['cryo_ice', '低温冰', 'hydrogen'],
  ['quantum_dust', '量子尘', 'rare'],
  ['plasma_core', '等离子核心', 'rare'],
  ['dark_matter', '暗物质', 'rare'],
  ['antimatter', '反物质', 'rare'],
  ['precursor_fragments', '先驱碎片', 'rare'],
  ['artifact', '遗物', 'rare'],
];

export const EXTRA_RES_KEYS_UI = EXTRA_RESOURCES.map(e => e[0]);

export function resourceVal(totals, key) {
  if (totals && totals[key] != null) return totals[key];
  return (totals && totals.rare && totals.rare[key]) || 0;
}

// Append the alloys + exotic-resource cards (alloys always; rares only when
// some has been collected) to a collected-resources container.
export function appendExtraResourceCards(container, totals, suffix) {
  for (const [key, label, cls] of EXTRA_RESOURCES) {
    const v = resourceVal(totals, key);
    if (key === 'alloys' || v > 0) container.appendChild(makeStatCard(`${label}${suffix}`, fmt(v), cls));
  }
}

export function appendRareCards(container, rare, suffix) {
  Object.entries(rare || {})
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => container.appendChild(
      makeStatCard(`${uiLabel(k)}${suffix}`, fmt(v), 'rare')
    ));
}

export function renderPagedTable(reports, page, infoId, prevId, nextId, tbodyId, rowFn) {
  const totalPages = Math.ceil(reports.length / PER_PAGE);
  const maxPage = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), maxPage);
  document.getElementById(infoId).textContent = `第 ${safePage} / ${maxPage} 页（共 ${reports.length} 条）`;
  document.getElementById(prevId).disabled = safePage <= 1;
  document.getElementById(nextId).disabled = safePage >= totalPages;
  const tbody = document.getElementById(tbodyId);
  tbody.textContent = '';
  for (const r of reports.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)) {
    tbody.appendChild(rowFn(r));
  }
}

// Fill a stats container with ore/silicates/hydrogen/alloys + rare cards.
export function fillResourceCards(containerId, res, suffix) {
  const el = document.getElementById(containerId);
  if (!el) return;
  res = res || emptyResources();
  el.textContent = '';
  el.append(
    makeStatCard(`矿石${suffix}`, fmt(res.ore || 0), 'ore'),
    makeStatCard(`硅酸盐${suffix}`, fmt(res.silicates || 0), 'silicates'),
    makeStatCard(`氢${suffix}`, fmt(res.hydrogen || 0), 'hydrogen'),
    makeStatCard(`合金${suffix}`, fmt(res.alloys || 0), 'alloys'),
  );
  appendRareCards(el, res.rare, suffix);
}

// Renders a { destroyed, repair } loss into two separate titled containers.
// Pass repairId = null for tabs with no repair concept (debris, expeditions).
export function renderLostCards(destroyedId, repairId, lost, periodLabel) {
  fillResourceCards(destroyedId, lost.destroyed, periodLabel);
  if (repairId) fillResourceCards(repairId, lost.repair, periodLabel);
}

// Relative value of each resource, used to weight the net total.
export const RESOURCE_WEIGHTS = {
  ore: 1, silicates: 2, hydrogen: 3, alloys: 5,
  precursor_fragments: 50, artifact: 2000,
};
export const RARE_WEIGHT = 10;   // exotics with no specific weight above (ice, quantum dust, …)

// Net gain cards: resources collected minus ship build costs, per resource
// (raw), plus a weighted total (ore×1, silicates×2, hydrogen×3, alloys×5).
// Rare resource losses are not in the total (no common valuation).
export function renderNetCards(containerId, collected, lost, periodLabel, fuelHydrogen = 0) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.textContent = '';
  const cost = combinedLost(lost);   // destruction + repair
  const fuel = fuelHydrogen || 0;
  const fields = [
    ['矿石', 'ore'], ['硅酸盐', 'silicates'], ['氢', 'hydrogen'], ['合金', 'alloys'],
  ];
  let total = 0;
  for (const [label, key] of fields) {
    let v = (collected[key] || 0) - (cost[key] || 0);
    if (key === 'hydrogen') v -= fuel;   // fuel is hydrogen burned on the trip
    total += v * RESOURCE_WEIGHTS[key];
    el.appendChild(makeStatCard(`${label}净收益${periodLabel}`, (v >= 0 ? '+' : '') + fmt(v), key));
  }
  // Exotic resources — net (collected − any rare ship-cost), weighted per
  // RESOURCE_WEIGHTS (falling back to RARE_WEIGHT). Shown when present either side.
  for (const [key, label, cls] of EXTRA_RESOURCES) {
    if (key === 'alloys') continue;   // already a core field above
    const got = resourceVal(collected, key);
    const spent = resourceVal(cost, key);
    if (!got && !spent) continue;
    const v = got - spent;
    total += v * (RESOURCE_WEIGHTS[key] || RARE_WEIGHT);
    el.appendChild(makeStatCard(`${label}净收益${periodLabel}`, (v >= 0 ? '+' : '') + fmt(v), cls));
  }
  const totalCard = makeStatCard(`总净收益${periodLabel}`, (total >= 0 ? '+' : '') + fmt(total),
    '', total >= 0 ? 'color:#56d364' : 'color:#ff7b72');
  totalCard.title = '加权：矿石×1、硅酸盐×2、氢×3、合金×5、先驱碎片×50、遗物×2000、其他稀有资源×10。'
    + (fuel ? ` 已计入约 ${fmt(fuel)} 氢燃料。` : '');
  el.appendChild(totalCard);
}

// Doughnut of a loot/resource breakdown (ore, silicates, hydrogen, alloys and
// any rares) for the current view period. `totals` is a mode-aware totals
// object; returns the Chart instance.
export const RESOURCE_COLORS = {
  ore: '#f0883e', silicates: '#56d364', hydrogen: '#79c0ff', alloys: '#e3b341',
};
export const RARE_PALETTE = ['#bc8cff', '#d2a8ff', '#ff7b72', '#ffa657', '#a5d6ff', '#7ee787'];

export function makeResourceDoughnut(canvasId, totals) {
  const entries = [];
  for (const k of ['ore', 'silicates', 'hydrogen', 'alloys']) {
    if (totals[k] > 0) entries.push([uiLabel(k), totals[k], RESOURCE_COLORS[k]]);
  }
  let ri = 0;
  for (const [k, v] of Object.entries(totals.rare || {})) {
    if (v > 0) entries.push([uiLabel(k), v, RARE_PALETTE[ri++ % RARE_PALETTE.length]]);
  }
  const total = entries.reduce((s, e) => s + e[1], 0);
  return new Chart(document.getElementById(canvasId), {
    type: 'doughnut',
    data: {
      labels: entries.map(e => {
        const pct = total ? (e[1] / total * 100).toFixed(1) : 0;
        return `${e[0]} — ${Number(e[1]).toLocaleString()} (${pct}%)`;
      }),
      datasets: [{ data: entries.map(e => e[1]), backgroundColor: entries.map(e => e[2]) }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'right', labels: { color: '#e6edf3', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = total ? (ctx.parsed / total * 100).toFixed(1) : 0;
              return ` ${Number(ctx.parsed).toLocaleString()} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

// Colored zone badge cell for report tables.
export const ZONE_COLORS = {
  sentinel: '#56d364', open: '#f0883e', dead: '#ff7b72', rift: '#d2a8ff', unknown: '#8b949e',
};
export function zoneCell(zone) {
  const z = zone || 'unknown';
  const td = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = uiLabel(z);
  badge.style.color = ZONE_COLORS[z] || ZONE_COLORS.unknown;
  td.appendChild(badge);
  return td;
}

// ── Sortable tables ─────────────────────────────────────────────────────────
// Click a th.sortable[data-key] to sort; click again to flip. `state` is a
// plain { key, dir } object the caller keeps; `rerender` redraws the table.
export function attachSortable(headId, state, rerender) {
  const head = document.getElementById(headId);
  if (!head) return;
  head.addEventListener('click', e => {
    const th = e.target.closest('th.sortable');
    if (!th) return;
    state.dir = state.key === th.dataset.key ? -state.dir : -1;
    state.key = th.dataset.key;
    rerender();
  });
}

// Sort a copy of records by the state, draw the header arrow, and return it.
export function applySort(headId, records, state, tiebreak = 'created_at') {
  const { key, dir } = state;
  document.querySelectorAll(`#${headId} th.sortable`).forEach(th => {
    const old = th.querySelector('.arrow');
    if (old) old.remove();
    if (th.dataset.key === key) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = dir === -1 ? ' ▼' : ' ▲';
      th.appendChild(arrow);
    }
  });
  return records.slice().sort((a, b) => {
    const va = a[key], vb = b[key];
    let cmp;
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = String(va ?? '').localeCompare(String(vb ?? ''));
    return cmp * dir || String(b[tiebreak] ?? '').localeCompare(String(a[tiebreak] ?? ''));
  });
}
