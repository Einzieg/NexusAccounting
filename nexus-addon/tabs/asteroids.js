// Asteroids Fields tab: asteroid fields in the N nearest explored systems to a
// chosen planet (type, content, multiplier, security zone, distance, miner).
//
//   /api/galaxy/map                        → all systems with coords + sector id
//   /api/galaxy/sectors/{sectorId}/systems → name/zone/planetCount for a sector
//   /api/galaxy/systems/{id}/planets       → that system's asteroidFields
// Per-system scans reuse the finder's shared cache.

import { SCAN_CACHE_MAX, getSystemPlanets } from './finder.js';
import { loadFleetTemplates } from './fleets.js';
import { clearAvailStrip, editFleetDialog, fmtCountdown, fuelEstimate, makeMissionBar, normalizeRetreatThreshold, rememberSelection, rememberedSelections, renderAvailStrip, serverTravelTimeFactor, shipDisplayName, showLeaderRetryNotice, templateRegularShips, templateRetreatThreshold, templateWantsLeader, uiLabel } from '../common.js';

let iconBase = '';
// asteroid fieldType → resource icon + label
const FIELD_TYPES = [
  { type: 'ore', res: 'ore', label: '矿石', color: '#f0883e' },
  { type: 'gas', res: 'hydrogen', label: '气体（氢）', color: '#a371f7' },
  { type: 'ice', res: 'cryo_ice', label: '冰体（低温冰）', color: '#a5d6ff' },
  { type: 'plasma', res: 'plasma_core', label: '等离子体（核心）', color: '#ff7b72' },
  { type: 'quantum', res: 'quantum_dust', label: '量子体（量子尘）', color: '#d2a8ff' },
  { type: 'dark', res: 'dark_matter', label: '暗物质体', color: '#6e40c9' },
];
const TYPE_COLOR = Object.fromEntries(FIELD_TYPES.map(t => [t.type, t.color]));
// Ship recommendation per asteroid field type: specialized ship + per-cycle
// extraction of that resource (Stats.txt "Mining extraction capacity").
const REC_SHIP = {
  ore: ['Mining Vessel', 50], plasma: ['Mining Vessel', 25],
  gas: ['Gas Collector', 17], quantum: ['Gas Collector', 3],
  ice: ['Ice Drill', 25], dark: ['Ice Drill', 3],
};
const REC_SHIP_LABELS = {
  'Mining Vessel': '采矿船',
  'Gas Collector': '气体收集船',
  'Ice Drill': '冰钻船',
  Excavator: '挖掘机',
};
const REC_CYCLES = 10;   // ships to clear the field in this many mining cycles
const EXCAVATOR_BONUS = 1.2;   // +20% fleet extraction capacity when an Excavator is present
const afExcavator = () => document.getElementById('af-excavator').checked;
// Mining ships the recommendation manages; other template ships (escort/combat)
// are left untouched when seeding the launch fleet.
const MINING_SHIPS = new Set([...Object.values(REC_SHIP).map(s => s[0]), 'Excavator']);
// Security-zone colours: safe → hostile.
const ZONE_COLOR = {
  sentinel: '#56d364', open: '#f0883e', dead: '#ff7b72', rift: '#bc8cff', unknown: '#8b949e',
};
const ZONES = ['sentinel', 'open', 'dead', 'rift'];
const afTypeFilter = new Set();    // empty = any; multi-select like the market
const afZoneFilter = new Set();    // empty = any
const lsTypeFilter = new Set();    // live-search type filter (independent)
const lsZoneFilter = new Set();    // live-search zone filter (independent)

let afInited = false;
let afPlanets = [];                // [{ id, name, systemId, systemName, isHomeworld }]
let afRefMS = null;                // chosen reference planet system coords
let afFields = [];                 // scanned asteroid fields
let afRunning = false;
let afSort = { key: 'distance', dir: 1 };
let afPage = 1;
const AF_PER_PAGE = 25;
const MINING_DURATION = 600;   // seconds; fixed for asteroid mining missions
const ASTEROID_CACHE_TTL = 15 * 60 * 1000;   // fields drain fast — refetch after 15 min
const LOCAL_FUEL_K = 0.0496;
const LOCAL_FUEL_BASE = 3.48;
const LOCAL_TRAVEL_SCALE = 10;   // map-distance seconds at speed 1; matches observed game timing closely
let afTravelTimeFactor = 1;
let afTemplates = [];        // fleet templates, managed in the Fleets tab
let afMap = null;            // { byId: {id→{x,y,sectorId,visibility}}, systems: [...] }, cached
const sectorSystems = {};   // sectorId → systems[] (name/zone/planetCount), cached
let afAllShips = [];        // every ship def: [{ shipDefId, key, name, imageUrl, fuelRate, speed }]
let afAvailableShips = {};  // current source planet: shipDefId -> available quantity
let afAccountShips = null;  // account total: shipDefId -> available quantity
let afAccountShipsGen = 0;
let afAvailTimer = null;    // periodic availability poll
let afMyUsername = null;    // this player's username, to spot fields already mined by us
let afMiningFieldIds = new Set();   // fieldIds with an in-flight/active mine mission
let afMiningMissions = [];   // current mine missions from /api/fleet/missions
let afMiningTicks = [];      // progress-bar updaters for the current mining list
let afTick = 0;
const allianceTagCache = {};   // player name → alliance tag (or null), session cache

// Resolve alliance tags for a set of player names not already cached.
async function resolveAllianceTags(names) {
  const need = [...new Set(names)].filter(n => n && !(n in allianceTagCache));
  await Promise.all(need.map(async name => {
    const res = await browser.runtime.sendMessage({ type: 'GET_PLAYER_ALLIANCE_TAG', name });
    allianceTagCache[name] = (res && res.tag) || null;
  }));
}

export async function initAsteroidsTab() {
  if (afInited) return;
  afInited = true;
  const server = await globalThis.nexusStorage.getActiveServer();
  iconBase = `${server.origin}/images/resources/`;
  afTravelTimeFactor = serverTravelTimeFactor(server);
  const status = document.getElementById('af-progress');
  status.textContent = '正在加载…';

  const planets = await browser.runtime.sendMessage({ type: 'GET_PLANETS' });
  if (planets.error) { status.textContent = `错误：${planets.error}`; afInited = false; return; }
  afPlanets = (planets.planets || []).filter(p => p.systemId != null);

  const me = await browser.runtime.sendMessage({ type: 'GET_AUTH_ME' });
  afMyUsername = (me && !me.error && me.user) ? me.user.username : null;

  const pSel = document.getElementById('af-planet');
  const lsSel = document.getElementById('ls-planet');
  pSel.textContent = ''; lsSel.textContent = '';
  for (const p of afPlanets) {
    const label = p.systemName ? `${p.name} (${p.systemName})` : p.name;
    const o = document.createElement('option');
    o.value = p.id; o.textContent = label;
    if (p.isHomeworld) o.selected = true;
    pSel.appendChild(o);
    const o2 = document.createElement('option');
    o2.value = p.id; o2.textContent = label;
    if (p.isHomeworld) o2.selected = true;
    lsSel.appendChild(o2);
  }
  const savedSel = await rememberedSelections();
  if (savedSel['af-planet'] && afPlanets.some(p => String(p.id) === savedSel['af-planet'])) {
    pSel.value = savedSel['af-planet'];   // remembered planet survives tabs/sessions
  }

  setupAfTypeSelect();
  drawTypeIcons();
  drawZoneToggles();
  await loadLiveSearch();   // populate ls-* fields + button from saved config
  refreshSlots();

  await refreshTemplates();
  // Keep the selector in sync with edits made in the Fleets tab.
  globalThis.nexusStorage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.fleet_templates) refreshTemplates();
    // Live search can be stopped from the game-page results window — reflect it.
    if (changes.live_search) {
      const en = !!(changes.live_search.newValue && changes.live_search.newValue.enabled);
      if (en !== lsRunning) { lsRunning = en; setLsButton(); }
    }
  });

  pSel.addEventListener('change', () => { rememberSelection('af-planet', pSel.value); setRefFromMap(pSel.value); renderAsteroids(); updateAfAvail(); renderTemplateSummary(); });
  document.getElementById('af-scan').addEventListener('click', scan);
  document.getElementById('af-mining-refresh').addEventListener('click', refreshMiningNow);
  document.getElementById('af-type-select').addEventListener('change', e => {
    afTypeFilter.clear();
    if (e.target.value && e.target.value !== '__multi') afTypeFilter.add(e.target.value);
    localStorage.setItem('nx-af-type-select', e.target.value || '');
    drawTypeIcons();
    clearAfScanResultsForTypeChange();
  });
  document.getElementById('af-template-select').addEventListener('change', e => { rememberSelection('af-template-select', e.target.value); renderTemplateSummary(); computeFuel(); });
  const excChk = document.getElementById('af-excavator');
  excChk.checked = localStorage.getItem('nx-af-excavator') === '1';
  excChk.addEventListener('change', () => { localStorage.setItem('nx-af-excavator', excChk.checked ? '1' : '0'); renderAsteroids(); });
  document.getElementById('af-results-head').addEventListener('click', e => {
    const th = e.target.closest('th.sortable');
    if (!th) return;
    afSort = { key: th.dataset.key, dir: afSort.key === th.dataset.key ? -afSort.dir : -1 };
    afPage = 1;
    renderAsteroids();
  });
  document.getElementById('af-btn-prev').addEventListener('click', () => { afPage--; renderAsteroids(); });
  document.getElementById('af-btn-next').addEventListener('click', () => { afPage++; renderAsteroids(); });
  for (const id of ['af-mult-min', 'af-qty-min', 'af-left-min']) {
    document.getElementById(id).addEventListener('input', e => {
      if (parseFloat(e.target.value) < 0) e.target.value = '';   // positive only
      clearAfScanResultsForCriteriaChange();
    });
  }

  // Live-search controls.
  document.getElementById('ls-search').addEventListener('click', toggleLiveSearch);
  document.getElementById('ls-planet').addEventListener('change', saveLiveSearchIfOn);
  for (const id of ['ls-mult-min', 'ls-qty-min', 'ls-left-min', 'ls-near']) {
    document.getElementById(id).addEventListener('input', e => {
      if (parseFloat(e.target.value) < 0) e.target.value = '';   // positive only
      saveLiveSearchIfOn();
    });
  }

  // Ship catalog (names + icons) for the availability strip, then start it.
  const defs = await browser.runtime.sendMessage({ type: 'GET_SHIP_DEFS' });
  afAllShips = (defs.ships || []).map(s => ({
    shipDefId: s.shipDefId,
    key: s.key,
    name: s.name,
    imageUrl: s.imageUrl,
    fuelRate: s.fuelRate || 0,
    speed: s.speed || s.shipSpeed || s.travelSpeed || 0,
  }));
  updateAfAccountShips();
  updateAfAvail();
  renderTemplateSummary();
  computeFuel();
  if (!afAvailTimer) {
    afAvailTimer = setInterval(() => {
      if (document.getElementById('asteroids-content').style.display === 'none') return;
      for (const upd of afMiningTicks) upd();
      if (++afTick % 10 === 0) { updateAfAvail(); refreshSlots(); }
    }, 1000);   // live progress bars; API refresh stays at 10s
  }

  status.textContent = '请选择目标结果数，然后点击“扫描”。';
}

// Ships stationed on the selected mining planet, shown above the fields table.
async function updateAfAvail() {
  const box = document.getElementById('af-avail');
  const planetId = Number(document.getElementById('af-planet').value);
  if (!planetId || !afAllShips.length) { afAvailableShips = {}; clearAvailStrip(box); renderTemplateSummary(); return; }
  const av = await browser.runtime.sendMessage({ type: 'GET_PLANET_SHIPS', planetId });
  if (av.error) { afAvailableShips = {}; clearAvailStrip(box, av.error); renderTemplateSummary(); return; }
  afAvailableShips = av.available || {};
  renderAvailStrip(box, afAllShips, afAvailableShips, '该星球上没有舰船。');
  renderTemplateSummary();
}

// Galaxy map (all systems with coords + sector id), fetched once and cached.
async function loadMap() {
  if (afMap) return afMap;
  const res = await browser.runtime.sendMessage({ type: 'GET_GALAXY_MAP' });
  if (res.error) throw new Error(res.error);
  const systems = res.systems || [];
  const byId = {};
  for (const s of systems) byId[s.id] = s;
  afMap = { systems, byId };
  return afMap;
}

// Systems of a sector (with name/zone/planetCount/visibility), cached.
async function sectorSystemsFor(sectorId) {
  if (sectorSystems[sectorId]) return sectorSystems[sectorId];
  const res = await browser.runtime.sendMessage({ type: 'GET_SECTOR_SYSTEMS', sectorId });
  if (res.error) throw new Error(res.error);
  sectorSystems[sectorId] = res.systems || [];
  return sectorSystems[sectorId];
}

// Set the distance reference from the cached map (no fetch if map isn't loaded).
function setRefFromMap(planetId) {
  afRefMS = null;
  const p = afPlanets.find(x => x.id === Number(planetId));
  const sys = p && afMap && afMap.byId[p.systemId];
  if (sys) afRefMS = { x: sys.x, y: sys.y };
}

// Clickable resource-icon type toggles (mirrors the market filter). Empty
// selection means all types. `redraw` re-renders the set; `after` runs side
// effects (re-render table for the main filter, save config for live search).
function drawTypeInto(boxId, filter, redraw, after) {
  const box = document.getElementById(boxId);
  box.textContent = '';
  for (const t of FIELD_TYPES) {
    const img = document.createElement('img');
    img.className = 'res-icon' + (filter.has(t.type) ? ' sel' : '');
    img.src = `${iconBase}${t.res}.webp`;
    img.alt = t.label;
    img.title = t.label;
    img.addEventListener('click', () => {
      if (filter.has(t.type)) filter.delete(t.type); else filter.add(t.type);
      redraw();
      if (boxId === 'af-type') {
        syncAfTypeSelect();
        clearAfScanResultsForTypeChange();
      }
      if (after) after();
    });
    box.appendChild(img);
  }
}

function setupAfTypeSelect() {
  const sel = document.getElementById('af-type-select');
  if (!sel) return;
  sel.textContent = '';
  const all = document.createElement('option');
  all.value = '';
  all.textContent = '全部类型';
  sel.appendChild(all);
  const multi = document.createElement('option');
  multi.value = '__multi';
  multi.textContent = '多个类型';
  multi.disabled = true;
  sel.appendChild(multi);
  for (const t of FIELD_TYPES) {
    const o = document.createElement('option');
    o.value = t.type;
    o.textContent = t.label;
    sel.appendChild(o);
  }
  const saved = localStorage.getItem('nx-af-type-select');
  if (saved && FIELD_TYPES.some(t => t.type === saved)) {
    afTypeFilter.clear();
    afTypeFilter.add(saved);
  }
  syncAfTypeSelect();
}

function syncAfTypeSelect() {
  const sel = document.getElementById('af-type-select');
  if (!sel) return;
  const types = [...afTypeFilter];
  sel.value = types.length === 0 ? '' : types.length === 1 ? types[0] : '__multi';
  if (types.length <= 1) localStorage.setItem('nx-af-type-select', sel.value);
  else localStorage.removeItem('nx-af-type-select');
}

function afTypeSelectionText() {
  if (!afTypeFilter.size) return '全部类型';
  return [...afTypeFilter]
    .map(type => FIELD_TYPES.find(t => t.type === type)?.label || uiLabel(type))
    .join('、');
}

function clearAfScanResultsForTypeChange() {
  clearAfScanResultsForCriteriaChange(`矿类型已设为“${afTypeSelectionText()}”，请点击“扫描”重新获取结果。`);
}

function clearAfScanResultsForCriteriaChange(message = '扫描条件已变更，请点击“扫描”重新获取结果。') {
  afFields = [];
  afPage = 1;
  renderAsteroids();
  const status = document.getElementById('af-progress');
  if (status) status.textContent = message;
}

// Clickable zone toggles, coloured per zone. Empty selection means all zones.
function drawZoneInto(boxId, filter, redraw, after) {
  const box = document.getElementById(boxId);
  box.textContent = '';
  for (const z of ZONES) {
    const b = document.createElement('button');
    const on = filter.has(z);
    b.type = 'button';
    b.textContent = uiLabel(z);
    b.style.cssText = `padding:4px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem;
      border:1px solid ${ZONE_COLOR[z]}; text-transform:capitalize;
      color:${on ? '#0d1117' : ZONE_COLOR[z]}; background:${on ? ZONE_COLOR[z] : 'transparent'};`;
    b.addEventListener('click', () => {
      if (on) filter.delete(z); else filter.add(z);
      redraw();
      if (after) after();
    });
    box.appendChild(b);
  }
}

// Main fields filter: re-render the table on toggle.
function drawTypeIcons() { drawTypeInto('af-type', afTypeFilter, drawTypeIcons, () => { afPage = 1; renderAsteroids(); }); }
function drawZoneToggles() { drawZoneInto('af-zone', afZoneFilter, drawZoneToggles, () => clearAfScanResultsForCriteriaChange()); }
// Live-search filter: persist config on toggle (if currently running).
function drawLsTypeIcons() { drawTypeInto('ls-type', lsTypeFilter, drawLsTypeIcons, saveLiveSearchIfOn); }
function drawLsZoneToggles() { drawZoneInto('ls-zone', lsZoneFilter, drawLsZoneToggles, saveLiveSearchIfOn); }

// ── Live search (background, every 5 min) ──────────────────────────────────
let lsRunning = false;

function readLsConfig() {
  const num = id => { const v = parseFloat(document.getElementById(id).value); return isNaN(v) ? null : v; };
  return {
    enabled: lsRunning,
    planetId: Number(document.getElementById('ls-planet').value) || null,
    multMin: num('ls-mult-min'),
    qtyMin: num('ls-qty-min'),
    leftMin: num('ls-left-min'),
    near: Math.max(1, Math.min(10, parseInt(document.getElementById('ls-near').value, 10) || 5)),
    types: [...lsTypeFilter],
    zones: [...lsZoneFilter],
  };
}
function saveLiveSearch() { return browser.runtime.sendMessage({ type: 'SET_LIVE_SEARCH', config: readLsConfig() }); }
function saveLiveSearchIfOn() { if (lsRunning) saveLiveSearch(); }

function setLsButton() {
  const btn = document.getElementById('ls-search');
  const status = document.getElementById('ls-status');
  btn.textContent = lsRunning ? '停止实时搜索' : '实时搜索';
  btn.style.cssText = lsRunning ? 'background:#da3633; border:1px solid #f85149; color:#fff;' : '';
  if (!lsRunning) { status.textContent = ''; status.style.color = '#8b949e'; return; }
  if (!lsTypeFilter.size) {
    status.textContent = '⚠ 未选择资源类型，所有小行星带类型都会匹配。';
    status.style.color = '#e3b341';
  } else {
    status.textContent = '每 5 分钟在后台扫描一次，发现新匹配项时会发送通知。';
    status.style.color = '#8b949e';
  }
}
async function toggleLiveSearch() {
  if (!lsRunning && !document.getElementById('ls-planet').value) return;   // need a planet
  lsRunning = !lsRunning;
  setLsButton();
  await saveLiveSearch();
}

// Restore the live-search controls from the persisted config.
async function loadLiveSearch() {
  const { live_search: cfg } = await globalThis.nexusStorage.get('live_search');
  if (cfg) {
    if (cfg.planetId != null) document.getElementById('ls-planet').value = cfg.planetId;
    document.getElementById('ls-mult-min').value = cfg.multMin ?? '';
    document.getElementById('ls-qty-min').value = cfg.qtyMin ?? '';
    document.getElementById('ls-left-min').value = cfg.leftMin ?? '';
    document.getElementById('ls-near').value = Math.max(1, Math.min(10, parseInt(cfg.near, 10) || 5));
    lsTypeFilter.clear(); (cfg.types || []).forEach(t => lsTypeFilter.add(t));
    lsZoneFilter.clear(); (cfg.zones || []).forEach(z => lsZoneFilter.add(z));
    lsRunning = !!cfg.enabled;
  }
  drawLsTypeIcons();
  drawLsZoneToggles();
  setLsButton();
}

async function scan() {
  const btn = document.getElementById('af-scan');
  if (afRunning) { afRunning = false; return; }

  const status = document.getElementById('af-progress');
  const planetId = Number(document.getElementById('af-planet').value);
  const p = afPlanets.find(x => x.id === planetId);
  if (!p) return;
  const desiredCount = Math.max(1, Math.min(10, parseInt(document.getElementById('af-near').value, 10) || 5));
  document.getElementById('af-near').value = String(desiredCount);

  status.textContent = `正在加载星系地图… 矿类型：${afTypeSelectionText()}`;
  let map;
  try { map = await loadMap(); } catch (e) { status.textContent = `错误：${e.message}`; return; }
  const src = map.byId[p.systemId];
  if (!src) { status.textContent = '地图上找不到出发星系。'; return; }
  afRefMS = { x: src.x, y: src.y };

  // Walk explored systems from nearest to farthest until enough matching fields are found.
  const targets = map.systems
    .filter(s => s.visibility === 'full' || s.visibility === 'partial')
    .map(s => ({ s, d: Math.hypot(s.x - src.x, s.y - src.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, SCAN_CACHE_MAX)
    .map(o => o.s);
  if (!targets.length) { status.textContent = '附近没有已探索星系。'; return; }

  const { planet_scan_cache } = await globalThis.nexusStorage.get('planet_scan_cache');
  const cache = planet_scan_cache || {};

  afRunning = true;
  btn.textContent = '停止';
  afFields = [];
  afPage = 1;
  const scanTypeFilter = new Set(afTypeFilter);
  const scanZoneFilter = new Set(afZoneFilter);
  const num = (id, dflt) => {
    const v = parseFloat(document.getElementById(id).value);
    return isNaN(v) ? dflt : v;
  };
  const multMin = num('af-mult-min', -Infinity);
  const qtyMin = num('af-qty-min', -Infinity);
  const leftMin = num('af-left-min', -Infinity);
  let scanned = 0, errors = 0;
  try {
    for (const sys of targets) {
      if (!afRunning) break;
      if (afFields.length >= desiredCount) break;
      // name/zone/planetCount come from the system's sector (cached per sector).
      let meta;
      try {
        meta = (await sectorSystemsFor(sys.sectorId)).find(s => s.id === sys.id);
      } catch { errors++; continue; }
      if (!meta || !meta.planetCount) { scanned++; continue; }   // no bodies → no fields
      let data;
      try {
        data = await getSystemPlanets(sys.id, cache, ASTEROID_CACHE_TTL);
      } catch { errors++; scanned++; continue; }
      for (const f of (data.asteroidFields || [])) {
        const fieldType = f.fieldType || '—';
        if (scanTypeFilter.size && !scanTypeFilter.has(fieldType)) continue;
        const remaining = f.remainingResources ?? null;
        const total = f.totalResources ?? null;
        const leftPct = total ? Math.round((remaining / total) * 100) : null;
        const zone = meta.securityZone || '—';
        if (scanZoneFilter.size && !scanZoneFilter.has(zone)) continue;
        if ((f.richness ?? -Infinity) < multMin) continue;
        if ((remaining ?? -Infinity) < qtyMin) continue;
        if ((leftPct ?? -Infinity) < leftMin) continue;
        afFields.push({
          fieldId: f.id,
          name: f.name || `#${f.id}`,
          system: meta.name || `#${sys.id}`,
          systemId: sys.id,
          type: fieldType,
          mult: f.richness ?? null,
          remaining,
          total,
          zone,
          sx: sys.x, sy: sys.y,
          minerPresent: f.controllerName || null,
          ownerName: (f.outpostShieldMaxHp ?? 0) > 0 ? (f.controllerName || null) : null,
        });
        if (afFields.length >= desiredCount) break;
      }
      scanned++;
      if (scanned % 10 === 0) {
        status.textContent = `正在扫描… 已查 ${scanned} 个星系，目标 ${desiredCount} 条，矿类型：${afTypeSelectionText()}，已找到 ${afFields.length} 条。`;
        renderAsteroids();
      }
      await new Promise(r => setTimeout(r, 80)); // be polite to the game API
    }
  } finally {
    afRunning = false;
    btn.textContent = '扫描';
  }

  // Persist the shared scan cache, oldest entries dropped first.
  const ids = Object.keys(cache);
  if (ids.length > SCAN_CACHE_MAX) {
    ids.sort((a, b) => cache[a].at - cache[b].at)
      .slice(0, ids.length - SCAN_CACHE_MAX)
      .forEach(id => delete cache[id]);
  }
  await globalThis.nexusStorage.set({ planet_scan_cache: cache });

  await resolveAllianceTags(afFields.filter(f => f.ownerName).map(f => f.ownerName));

  status.textContent = `完成：按“${afTypeSelectionText()}”从近到远扫描 ${scanned} 个星系，找到 ${afFields.length}/${desiredCount} 条匹配小行星带` +
    (errors ? ` · 因错误跳过 ${errors} 个` : '') + '。';
  renderAsteroids();
}

function distance(f) {
  if (!afRefMS || f.sx == null) return null;
  return Math.round(Math.hypot(f.sx - afRefMS.x, f.sy - afRefMS.y));
}

// Recommended fleet to clear a field in REC_CYCLES cycles:
//   ships = ceil( remaining / (rate * cycles * richness) )
// Returns { count, name, shipDefId } or null when it can't be computed.
function recommend(f) {
  const spec = REC_SHIP[f.type];
  if (!spec || !f.remaining || !f.mult) return null;
  const [name, rate] = spec;
  const cap = rate * (afExcavator() ? EXCAVATOR_BONUS : 1);
  const count = Math.ceil(f.remaining / (cap * REC_CYCLES * f.mult));
  const def = afAllShips.find(d => d.name === name);
  return { count, name, shipDefId: def ? def.shipDefId : null };
}

async function refreshTemplates() {
  afTemplates = await loadFleetTemplates();
  afTemplates.sort((a, b) => (a.name || '').localeCompare(b.name || ''));   // alphabetical dropdown
  const sel = document.getElementById('af-template-select');
  const saved = await rememberedSelections();
  const want = saved['af-template-select'] || sel.value;   // survives tabs/sessions
  sel.textContent = '';
  const miningTemplates = afTemplates.filter(template => !(template.escortZones || []).length);
  if (!miningTemplates.length) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = '— 无（请在“舰队模板”中创建）—';
    sel.appendChild(o);
    renderTemplateSummary();
    return;
  }
  for (const t of miningTemplates) {
    const o = document.createElement('option');
    o.value = t.id; o.textContent = t.name;
    sel.appendChild(o);
  }
  if (want && miningTemplates.some(t => String(t.id) === want)) sel.value = want;
  renderTemplateSummary();
}

function miningTemplateShips(template) {
  return templateRegularShips(template, afAllShips);
}

function miningTemplateAttachLeader(template) {
  return templateWantsLeader(template, afAllShips);
}

function miningTemplateRetreatThreshold(template) {
  return templateRetreatThreshold(template);
}

async function updateAfAccountShips() {
  if (!afAllShips.length) return;
  const gen = ++afAccountShipsGen;
  let res;
  try {
    res = await browser.runtime.sendMessage({ type: 'GET_FLEET', planetId: 'all' });
  } catch (err) {
    res = { error: err && err.message ? err.message : String(err) };
  }
  if (gen !== afAccountShipsGen) return;
  if (res?.error) {
    afAccountShips = null;
    renderTemplateSummary();
    return;
  }
  const byKey = new Map(afAllShips.map(s => [s.key, s]));
  const totals = {};
  for (const [key, qty] of Object.entries(res.fleet || {})) {
    const def = byKey.get(key);
    if (!def || def.shipDefId == null) continue;
    totals[def.shipDefId] = (totals[def.shipDefId] || 0) + (Number(qty) || 0);
  }
  afAccountShips = totals;
  renderTemplateSummary();
}

function renderTemplateSummary() {
  const box = document.getElementById('af-template-summary');
  const sel = document.getElementById('af-template-select');
  if (!box || !sel) return;
  const tpl = afTemplates.find(t => String(t.id) === sel.value);
  box.textContent = '';
  if (!tpl) {
    box.style.display = 'none';
    return;
  }
  const ships = miningTemplateShips(tpl);
  const attachLeader = miningTemplateAttachLeader(tpl);
  const threshold = miningTemplateRetreatThreshold(tpl);
  const sourcePlanet = afPlanets.find(p => String(p.id) === String(document.getElementById('af-planet')?.value));
  const requiredTotal = ships.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
  const fulfilledTotal = ships.reduce((sum, s) => {
    const have = Number(afAvailableShips[s.shipDefId]) || 0;
    return sum + Math.min(have, Number(s.quantity) || 0);
  }, 0);
  const accountTotal = afAccountShips
    ? ships.reduce((sum, s) => sum + (Number(afAccountShips[s.shipDefId]) || 0), 0)
    : null;

  const title = document.createElement('div');
  title.className = 'af-template-summary-title';
  const name = document.createElement('strong');
  name.textContent = `模板：${tpl.name || '未命名模板'}`;
  const basis = document.createElement('span');
  basis.textContent = '显示模板数量';
  const source = document.createElement('span');
  source.textContent = `出发点：${sourcePlanet ? sourcePlanet.name : '未选择'}`;
  const total = document.createElement('span');
  total.textContent = `普通舰可满足 ${fulfilledTotal.toLocaleString()} / 需要 ${requiredTotal.toLocaleString()} 艘` +
    (accountTotal == null ? '' : ` · 账号总计 ${accountTotal.toLocaleString()} 艘`);
  title.append(name, basis, source, total);
  if (attachLeader) {
    const leader = document.createElement('span');
    leader.textContent = '指挥舰已编入';
    title.append(leader);
  }
  if (threshold != null) {
    const retreat = document.createElement('span');
    retreat.textContent = `护航阈值 ${Math.round(threshold * 100)}%`;
    title.append(retreat);
  }

  const list = document.createElement('div');
  list.className = 'af-template-summary-ships';
  if (attachLeader) {
    const chip = document.createElement('div');
    chip.className = 'af-template-chip leader';
    const strong = document.createElement('strong');
    strong.textContent = '指挥舰 × 1';
    const note = document.createElement('span');
    note.textContent = '待命状态由派出接口确认';
    chip.append(strong, note);
    list.append(chip);
  }
  for (const s of ships) {
    const qty = Number(s.quantity) || 0;
    const have = Number(afAvailableShips[s.shipDefId]) || 0;
    const account = afAccountShips ? (Number(afAccountShips[s.shipDefId]) || 0) : null;
    const def = afAllShips.find(d => Number(d.shipDefId) === Number(s.shipDefId));
    const chip = document.createElement('div');
    chip.className = `af-template-chip ${have >= qty ? 'ok' : 'short'}`;
    const strong = document.createElement('strong');
    strong.textContent = `${shipDisplayName(def, `#${s.shipDefId}`)} × ${qty.toLocaleString()}`;
    const local = document.createElement('span');
    local.className = 'af-template-stat';
    const owned = document.createElement('span');
    owned.className = 'af-template-owned';
    owned.textContent = `出发点拥有 ${have.toLocaleString()}`;
    const needed = document.createElement('span');
    needed.className = have >= qty ? 'af-template-needed-ok' : 'af-template-needed';
    needed.textContent = `需要 ${qty.toLocaleString()}`;
    local.append(owned, document.createTextNode(' / '), needed);
    const acct = document.createElement('span');
    acct.className = 'af-template-stat af-template-total';
    acct.textContent = `账号总计 ${account == null ? '—' : account.toLocaleString()}`;
    chip.append(strong, local, acct);
    list.append(chip);
  }
  if (!list.childElementCount) {
    const empty = document.createElement('span');
    empty.style.color = '#8b949e';
    empty.textContent = '该模板未选择舰船。';
    list.append(empty);
  }
  box.append(title, list);
  box.style.display = 'block';
}

function recommendedFuelShips(f) {
  const rec = recommend(f);
  const ships = rec && rec.shipDefId != null ? [{ shipDefId: rec.shipDefId, quantity: rec.count }] : [];
  if (afExcavator()) {
    const exc = afAllShips.find(d => d.name === 'Excavator');
    if (exc) ships.push({ shipDefId: exc.shipDefId, quantity: 1 });
  }
  return ships;
}

function localAsteroidEstimate(field, ships, attachLeader) {
  if (!field || !Array.isArray(ships) || !ships.length) return null;
  const dist = distance(field);
  if (dist == null) return null;
  let fuelRate = 0;
  let slowestSpeed = Infinity;
  let missingStats = !!attachLeader;
  for (const s of ships) {
    const qty = Number(s.quantity) || 0;
    if (qty <= 0) continue;
    const def = afAllShips.find(d => Number(d.shipDefId) === Number(s.shipDefId));
    if (!def) { missingStats = true; continue; }
    const rate = Number(def.fuelRate) || 0;
    const speed = Number(def.speed || def.shipSpeed || def.travelSpeed) || 0;
    if (rate > 0) fuelRate += rate * qty;
    else missingStats = true;
    if (speed > 0) slowestSpeed = Math.min(slowestSpeed, speed);
    else missingStats = true;
  }
  if (fuelRate <= 0 && slowestSpeed === Infinity) return null;
  const baseTravelTime = slowestSpeed < Infinity
    ? Math.max(60, Math.round((dist * LOCAL_TRAVEL_SCALE) / slowestSpeed))
    : null;
  return {
    distance: dist,
    fuelCost: fuelRate > 0 ? Math.round(fuelRate * (LOCAL_FUEL_K * dist + LOCAL_FUEL_BASE)) : null,
    travelTime: baseTravelTime != null ? Math.max(1, Math.round(baseTravelTime * afTravelTimeFactor)) : null,
    missingStats,
  };
}

function distanceTitle(est, fallback) {
  const raw = est && est.distance != null ? Number(est.distance) : fallback?.distance;
  return Number.isFinite(raw) ? `距离 ${raw.toFixed(1)} 光年` : '距离未知';
}

// Open the editable fleet dialog seeded from the ship recommendation (falling
// back to the selected template), then dispatch. Sends once — the saved
// template is left untouched.
async function sendMineMission(f) {
  const planetId = Number(document.getElementById('af-planet').value);
  const planet = afPlanets.find(p => p.id === planetId);
  const status = document.getElementById('af-progress');
  if (!planetId) { alert('请先选择出发星球。'); return; }

  status.textContent = '正在检查舰队…';
  const av = await browser.runtime.sendMessage({ type: 'GET_PLANET_SHIPS', planetId });
  if (av.error) { status.textContent = `错误：${av.error}`; return; }
  const avail = av.available || {};

  // Seed the editor straight from the selected template — the "Optimise Mining
  // Fleet" button in the dialog is what swaps in the recommended mining ships.
  const tpl = afTemplates.find(t => String(t.id) === document.getElementById('af-template-select').value);
  const wantsLeader = miningTemplateAttachLeader(tpl);
  const seed = {};
  for (const s of templateRegularShips(tpl, afAllShips)) seed[s.shipDefId] = s.quantity;

  const recShips = recommendedFuelShips(f);
  if (afExcavator()) {
    const exc = afAllShips.find(d => d.name === 'Excavator');
    if (exc && !(avail[exc.shipDefId] || 0)) {
      const i = recShips.findIndex(s => s.shipDefId === exc.shipDefId);
      if (i >= 0) recShips.splice(i, 1);
    }
  }
  const miningShipIds = new Set(afAllShips.filter(d => MINING_SHIPS.has(d.name)).map(d => d.shipDefId));
  const fieldZone = f.zone && f.zone !== '—' ? f.zone : null;
  const escortTemplates = fieldZone
    ? afTemplates.filter(template => (template.escortZones || []).includes(fieldZone))
    : [];
  const miningTemplates = afTemplates.filter(template => !(template.escortZones || []).length);

  const ships = await editFleetDialog({
    title: `开采 ${f.name}`,
    subtitle: `目标：${f.name}（${f.system}）\n出发点：${planet ? planet.name : planetId}`,
    avail, seed, recShips, miningShipIds,
    attachLeader: wantsLeader,
    escortRetreatThreshold: miningTemplateRetreatThreshold(tpl),
    retreatThresholdOptional: true,
    leaderOptional: true,
    templates: miningTemplates,
    escortTemplates,
    selectedTemplateId: tpl?.id,
    templateShipDefs: afAllShips,
    templateMemoryKey: 'asteroid-mining',
    templateMemoryScope: String(planetId),
  });
  if (!ships || (!ships.length && !ships.attachLeader)) return;   // cancelled or emptied
  if (ships.templateId != null) {
    const sel = document.getElementById('af-template-select');
    if (sel && afTemplates.some(t => String(t.id) === String(ships.templateId))) {
      sel.value = String(ships.templateId);
      rememberSelection('af-template-select', sel.value);
      computeFuel();
    }
  }

  status.textContent = `正在派往 ${f.name}…`;
  const attachLeader = !!ships.attachLeader;
  const escortRetreatThreshold = normalizeRetreatThreshold(ships.escortRetreatThreshold);
  const res = await browser.runtime.sendMessage({
    type: 'SEND_MINE',
    sourcePlanetId: planetId,
    targetFieldId: f.fieldId,
    ships,
    miningDuration: MINING_DURATION,
    attachLeader,
    escortRetreatThreshold,
    hangarAssignments: {},
  });
  showLeaderRetryNotice(res);
  status.textContent = res.error ? `派出失败：${res.error}` : `舰队已派往 ${f.name} ✓`;
  if (!res.error) {
    afMiningFieldIds.add(f.fieldId);   // optimistic — GET_MISSIONS can lag right after the send
    renderAsteroids();
    refreshSlots(); updateAfAvail(); updateAfAccountShips();
  }
}

function miningFieldForMission(m) {
  const fieldId = Number(missionValue(m, 'targetFieldId', 'targetAsteroidFieldId',
    'target_field_id', 'target_asteroid_field_id', 'fieldId', 'field_id',
    'targetField.id', 'asteroidField.id'));
  return Number.isFinite(fieldId) ? afFields.find(f => Number(f.fieldId) === fieldId) : null;
}

function missionValue(obj, ...paths) {
  for (const path of paths) {
    const value = path.split('.').reduce((o, key) => (o && o[key] != null ? o[key] : null), obj);
    if (value != null && value !== '') return value;
  }
  return null;
}

function miningTargetLabel(m) {
  const local = miningFieldForMission(m);
  const fieldId = missionValue(m, 'targetFieldId', 'targetAsteroidFieldId',
    'target_field_id', 'target_asteroid_field_id', 'fieldId', 'field_id',
    'targetField.id', 'asteroidField.id');
  const system = local?.system || missionValue(m, 'targetSystemName', 'systemName',
    'targetSystem.name', 'target.systemName', 'target.system.name',
    'target_system_name', 'system_name') ||
    (m.targetSystemId != null ? `#${m.targetSystemId}` : '');
  const slotRaw = missionValue(m, 'targetFieldSlot', 'targetAsteroidFieldSlot',
    'asteroidFieldSlot', 'fieldSlot', 'slot', 'targetFieldIndex',
    'targetAsteroidFieldIndex', 'asteroidFieldIndex', 'fieldIndex',
    'target.slot', 'targetField.slot', 'asteroidField.slot', 'raidParams.targetFieldSlot',
    'target_field_slot', 'target_asteroid_field_slot', 'asteroid_field_slot',
    'field_slot', 'target_field_index', 'asteroid_field_index', 'field_index');
  const slot = Number(slotRaw);
  const derived = system && Number.isFinite(slot) && slot > 0 ? `${system}-AF${slot}` : '';
  const field = local?.name || derived || missionValue(m, 'targetFieldName', 'targetAsteroidFieldName',
    'asteroidFieldName', 'fieldName', 'targetName', 'target.name', 'targetField.name',
    'asteroidField.name', 'target_field_name', 'target_asteroid_field_name',
    'asteroid_field_name', 'field_name', 'target_name') ||
    (fieldId != null ? `AF#${fieldId}` : '');
  if (field && system) return String(field).includes(String(system)) ? field : `${field}（${system}）`;
  return field || system || `任务 #${m.id ?? '?'}`;
}

function miningSourceLabel(m) {
  return missionValue(m, 'sourcePlanetName', 'originPlanetName', 'fromPlanetName',
    'source.name', 'sourcePlanet.name', 'origin.name', 'from.name',
    'source_planet_name', 'origin_planet_name', 'from_planet_name') ||
    (m.sourcePlanetId != null ? `星球 #${m.sourcePlanetId}` : '');
}

function miningCargoSummary(m) {
  const cargo = m.cargo || m.resourcesMined || m.resourcesDelivered || m.raidParams?.resources || {};
  const labels = { ore: '矿石', silicates: '硅酸盐', hydrogen: '氢', alloys: '合金',
    cryo_ice: '低温冰', plasma_core: '等离子核心', quantum_dust: '量子尘', dark_matter: '暗物质' };
  const parts = Object.entries(labels)
    .map(([key, label]) => [label, Number(cargo[key]) || 0])
    .filter(([, value]) => value > 0)
    .map(([label, value]) => `${label}: ${value.toLocaleString()}`);
  return parts.length ? parts.join('  ') : '';
}

function miningFleetSummary(m) {
  const fleet = m.fleetComposition || m.fleet || [];
  const parts = [];
  if (m.attachLeader || m.leaderAttached || m.commander || m.leaderId) parts.push('1× 指挥舰');
  for (const s of fleet) {
    const quantity = s.quantity ?? s.count ?? 1;
    const def = { key: s.shipKey || s.key, name: s.shipName || s.name };
    const fallback = s.shipName || s.name || s.shipKey || s.key || (s.shipDefId ? `#${s.shipDefId}` : '舰船');
    parts.push(`${quantity}× ${shipDisplayName(def, fallback)}`);
  }
  return parts.join('  ');
}

function renderMiningTransit() {
  const box = document.getElementById('af-mining-list');
  const count = document.getElementById('af-mining-count');
  if (!box || !count) return;
  box.textContent = '';
  afMiningTicks = [];
  count.textContent = `${afMiningMissions.length} 支采矿中`;
  if (!afMiningMissions.length) {
    const d = document.createElement('div');
    d.style.cssText = 'color:#484f58; padding:4px 0;';
    d.textContent = '当前没有航行中的采矿舰队。';
    box.appendChild(d);
    return;
  }
  for (const m of afMiningMissions) {
    const row = document.createElement('div');
    const head = document.createElement('div');
    head.style.cssText = 'display:flex; align-items:baseline; gap:8px; font-size:0.85rem; margin-bottom:3px;';
    const name = document.createElement('span');
    name.style.color = '#e6edf3';
    name.textContent = `${miningTargetLabel(m)} · 采矿`;
    head.appendChild(name);
    const source = miningSourceLabel(m);
    if (source) {
      const src = document.createElement('span');
      src.style.cssText = 'color:#8b949e; font-size:0.78rem;';
      src.textContent = `出发点：${source}`;
      head.appendChild(src);
    }
    row.appendChild(head);
    const fleet = miningFleetSummary(m);
    if (fleet) {
      const ships = document.createElement('div');
      ships.style.cssText = 'color:#8b949e; font-size:0.78rem; margin-bottom:3px;';
      ships.textContent = fleet;
      row.appendChild(ships);
    }
    const cargo = miningCargoSummary(m);
    if (cargo) {
      const cargoLine = document.createElement('div');
      cargoLine.style.cssText = 'color:#e3b341; font-size:0.78rem; margin-bottom:3px;';
      cargoLine.textContent = cargo;
      row.appendChild(cargoLine);
    }
    const bar = makeMissionBar(m);
    bar.el.style.marginTop = '0';
    row.appendChild(bar.el);
    box.appendChild(row);
    afMiningTicks.push(bar.upd);
  }
}

// "used/max fleet slots" and in-flight mine missions — both come from the
// missions endpoint. afMiningFieldIds drives the "already mining" row highlight.
async function refreshSlots() {
  const mi = await browser.runtime.sendMessage({ type: 'GET_MISSIONS' });
  if (mi.maxFleetSlots != null) {
    document.getElementById('af-slots').textContent = `舰队槽位 ${(mi.missions || []).length}/${mi.maxFleetSlots}`;
  }
  afMiningMissions = (mi.missions || []).filter(m => m.missionType === 'mine');
  afMiningFieldIds = new Set(afMiningMissions
    .map(m => Number(missionValue(m, 'targetFieldId', 'targetAsteroidFieldId',
      'target_field_id', 'target_asteroid_field_id', 'fieldId', 'field_id',
      'targetField.id', 'asteroidField.id')))
    .filter(Number.isFinite));
  renderMiningTransit();
  renderAsteroids();
}

async function refreshMiningNow() {
  const btn = document.getElementById('af-mining-refresh');
  if (btn) { btn.disabled = true; btn.textContent = '刷新中…'; }
  try {
    await refreshSlots();
    await updateAfAvail();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '刷新'; }
  }
}

export function renderAsteroids() {
  const tbody = document.getElementById('af-results-tbody');
  tbody.textContent = '';

  document.querySelectorAll('#af-results-head th.sortable').forEach(th => {
    const old = th.querySelector('.arrow');
    if (old) old.remove();
    if (th.dataset.key === afSort.key) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = afSort.dir === -1 ? '▼' : '▲';
      th.appendChild(arrow);
    }
  });

  let rows = afFields.map(f => {
    const rec = recommend(f);
    return {
      ...f,
      distance: distance(f),
      leftPct: f.total ? Math.round((f.remaining / f.total) * 100) : null,
      rec, recShips: rec ? rec.count : null,
    };
  });
  if (afZoneFilter.size) rows = rows.filter(f => afZoneFilter.has(f.zone));

  const num = (id, dflt) => {
    const v = parseFloat(document.getElementById(id).value);
    return isNaN(v) ? dflt : v;
  };
  const multMin = num('af-mult-min', -Infinity), qtyMin = num('af-qty-min', -Infinity);
  const leftMin = num('af-left-min', -Infinity);
  rows = rows.filter(f =>
    (f.mult ?? -Infinity) >= multMin && (f.remaining ?? -Infinity) >= qtyMin
    && (f.leftPct ?? -Infinity) >= leftMin);
  const { key, dir } = afSort;
  rows.sort((a, b) => {
    const va = a[key], vb = b[key];
    let cmp;
    if (va == null && vb == null) cmp = 0;
    else if (va == null) cmp = 1;
    else if (vb == null) cmp = -1;
    else if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = String(va).localeCompare(String(vb));
    return cmp * dir;
  });

  const totalPages = Math.max(1, Math.ceil(rows.length / AF_PER_PAGE));
  afPage = Math.min(Math.max(1, afPage), totalPages);
  document.getElementById('af-page-info').textContent = `第 ${afPage} / ${totalPages} 页`;
  document.getElementById('af-btn-prev').disabled = afPage <= 1;
  document.getElementById('af-btn-next').disabled = afPage >= totalPages;
  const pageRows = rows.slice((afPage - 1) * AF_PER_PAGE, afPage * AF_PER_PAGE);

  for (const f of pageRows) {
    const tr = document.createElement('tr');
    tr.dataset.system = f.systemId;
    tr.dataset.field = f.fieldId;
    if ((afMyUsername && f.minerPresent === afMyUsername) || afMiningFieldIds.has(f.fieldId)) {
      tr.style.background = 'rgba(63,185,80,0.15)';   // already mining / claimed by us
    }

    const sendTd = document.createElement('td');
    const ship = document.createElement('span');
    ship.textContent = '🚀';
    ship.title = '向此处派出采矿舰队';
    ship.style.cssText = 'cursor:pointer;';
    ship.addEventListener('click', () => sendMineMission(f));
    sendTd.appendChild(ship);
    tr.appendChild(sendTd);

    const content = f.remaining == null ? '—'
      : `${f.remaining.toLocaleString()} / ${(f.total ?? 0).toLocaleString()}`;
    const tag = f.ownerName ? allianceTagCache[f.ownerName] : null;
    const owner = f.ownerName ? (tag ? `${f.ownerName} [${tag}]` : f.ownerName) : '—';
    const cells = [
      f.system, FIELD_TYPES.find(t => t.type === f.type)?.label || uiLabel(f.type),
      f.mult == null ? '—' : `×${f.mult}`,
      content,
      f.leftPct == null ? '—' : `${f.leftPct}%`,
      uiLabel(f.zone),
      owner,
      f.distance == null ? '—' : String(f.distance),
      '…',   // fuel cost, filled async
      '…',   // travel time, filled async
      f.rec ? `${f.rec.count}× ${REC_SHIP_LABELS[f.rec.name] || shipDisplayName(f.rec.name)}` : '—',
    ];
    cells.forEach((v, i) => {
      const td = document.createElement('td');
      td.textContent = v;
      if (i === 1) td.style.color = TYPE_COLOR[f.type] || '#e6edf3';
      else if (i === 2 && f.mult != null) td.style.color = '#e3b341';
      else if (i === 5) td.style.color = ZONE_COLOR[f.zone] || '#8b949e';
      else if (i === 8) td.className = 'af-fuel';
      else if (i === 9) td.className = 'af-time';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  document.getElementById('af-count').textContent = `${rows.length} 个小行星带`;
  computeFuel();
}

// Fill the Fuel Cost column: selected template first, otherwise the row's
// recommended mining fleet. A generation guard discards superseded renders.
let afFuelGen = 0;
async function computeFuel() {
  const gen = ++afFuelGen;
  const planetId = Number(document.getElementById('af-planet').value);
  const server = await globalThis.nexusStorage.getActiveServer().catch(() => null);
  afTravelTimeFactor = serverTravelTimeFactor(server);
  const fuelCells = () => document.querySelectorAll('#af-results-tbody td.af-fuel');
  const timeCells = () => document.querySelectorAll('#af-results-tbody td.af-time');
  if (!planetId) {
    fuelCells().forEach(c => { c.textContent = '—'; c.title = '尚未选择出发星球'; });
    timeCells().forEach(c => { c.textContent = '—'; c.title = '尚未选择出发星球'; });
    return;
  }
  const tpl = afTemplates.find(t => String(t.id) === document.getElementById('af-template-select').value);
  const attachLeader = miningTemplateAttachLeader(tpl);
  const templateShips = miningTemplateShips(tpl);
  for (const tr of document.querySelectorAll('#af-results-tbody tr')) {
    if (gen !== afFuelGen) return;
    const cell = tr.querySelector('.af-fuel');
    const timeCell = tr.querySelector('.af-time');
    const sysId = Number(tr.dataset.system);
    if (!cell || !Number.isFinite(sysId)) continue;
    cell.textContent = '…';
    cell.title = '正在估算燃料成本';
    cell.style.color = '';
    if (timeCell) {
      timeCell.textContent = '…';
      timeCell.title = '正在估算单程航行时间';
      timeCell.style.color = '';
    }
    const fieldId = Number(tr.dataset.field);
    const field = afFields.find(f => f.fieldId === fieldId);
    let ships = templateShips;
    let estimateLabel = tpl && (templateShips.length || attachLeader) ? '舰队模板' : '推荐舰船';
    if (!ships.length) ships = field ? recommendedFuelShips(field) : [];
    if (!ships.length && !attachLeader) {
      cell.textContent = '—';
      cell.title = '没有可用于估算的模板或推荐舰船';
      if (timeCell) { timeCell.textContent = '—'; timeCell.title = cell.title; }
      continue;
    }
    let est;
    try {
      est = await fuelEstimate(planetId, sysId, ships, attachLeader, 'mine');
    } catch (err) {
      est = { error: err && err.message ? err.message : String(err) };
    }
    if (gen !== afFuelGen) return;
    const fallback = (est?.error || est?.fuelCost == null || est?.travelTime == null || est?.distance == null)
      ? localAsteroidEstimate(field, ships, attachLeader)
      : null;
    const fuelCost = est?.fuelCost ?? fallback?.fuelCost;
    const travelTime = est?.travelTime ?? fallback?.travelTime;
    const usedFallback = fallback && (est?.error || est?.fuelCost == null || est?.travelTime == null || est?.distance == null);
    if (fuelCost == null && travelTime == null) {
      const reason = est?.error || '燃料估算接口没有返回燃料或时间，且本地舰船数据不足';
      cell.textContent = '?';
      cell.title = reason;
      cell.style.color = '#ff7b72';
      if (timeCell) { timeCell.textContent = '?'; timeCell.title = reason; timeCell.style.color = '#ff7b72'; }
      continue;
    }
    cell.textContent = fuelCost != null ? `${fuelCost}` : '—';
    cell.style.color = est?.inRange === false ? '#ff7b72' : '';
    const titleBits = [
      est?.inRange === false ? '超出航程' : distanceTitle(est, fallback),
      usedFallback ? `按${estimateLabel}本地估算` : `按${estimateLabel}估算`,
    ];
    if (usedFallback && est?.error) titleBits.push(`接口错误：${est.error}`);
    if (usedFallback && fallback?.missingStats) titleBits.push('部分舰船/指挥舰缺少本地燃料或速度字段');
    cell.title = titleBits.join('；');
    if (timeCell) {
      timeCell.textContent = travelTime != null ? fmtCountdown(travelTime * 1000) : '—';
      timeCell.title = travelTime != null
        ? `单程航行时间；${usedFallback ? `按${estimateLabel}本地估算` : `按${estimateLabel}估算`}`
        : cell.title;
    }
  }
}
