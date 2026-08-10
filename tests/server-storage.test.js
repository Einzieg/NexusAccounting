import test from 'node:test';
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';

function installBrowserStorage(seed = {}) {
  const state = { ...seed };
  const local = {
    async get(keys) {
      if (keys == null) return { ...state };
      const defaults = !Array.isArray(keys) && typeof keys === 'object' ? keys : null;
      const list = typeof keys === 'string' ? [keys] : defaults ? Object.keys(defaults) : keys;
      const result = {};
      for (const key of list) {
        if (Object.hasOwn(state, key)) result[key] = state[key];
        else if (defaults) result[key] = defaults[key];
      }
      return result;
    },
    async set(items) { Object.assign(state, items); },
    async remove(keys) {
      for (const key of (Array.isArray(keys) ? keys : [keys])) delete state[key];
    },
    async clear() {
      for (const key of Object.keys(state)) delete state[key];
    },
  };
  globalThis.browser = {
    storage: {
      local,
      onChanged: { addListener() {}, removeListener() {} },
    },
  };
  delete globalThis.nexusStorage;
  return state;
}

test('server storage migrates legacy data and isolates NX-S0 from NX-NF', async () => {
  const state = installBrowserStorage({ totals: { missions: 3 }, records_cap: 5000 });
  await import(`../nexus-addon/server-storage.js?test=${Date.now()}`);
  const storage = globalThis.nexusStorage;

  assert.equal((await storage.getActiveServer()).id, 'NX-S0');
  assert.equal((await storage.get('totals')).totals.missions, 3);
  assert.equal(state.totals, undefined, 'legacy key is removed after migration');
  assert.equal(state['nexus_server:s0:totals'].missions, 3);

  await storage.setActiveServer('nf');
  assert.equal((await storage.get('totals')).totals, undefined);
  await storage.set({ totals: { missions: 7 } });
  assert.equal(state['nexus_server:nf:totals'].missions, 7);

  await storage.setActiveServer('s0');
  assert.equal((await storage.get('totals')).totals.missions, 3);
  await storage.clear();
  assert.equal(state['nexus_server:s0:totals'], undefined);
  assert.equal(state['nexus_server:nf:totals'].missions, 7, 'clearing one server keeps the other');

  assert.equal(storage.serverFromUrl('https://nf.nexuslegacy.space/galaxy').id, 'NX-NF');
  assert.equal(storage.serverFromUrl('https://s0.nexuslegacy.space/').id, 'NX-S0');
});

test('manifest injects the addon on both game servers', async () => {
  const manifestUrl = new URL('../nexus-addon/manifest.json', import.meta.url);
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  for (const script of manifest.content_scripts) {
    assert.ok(script.matches.includes('https://s0.nexuslegacy.space/*'));
    assert.ok(script.matches.includes('https://nf.nexuslegacy.space/*'));
  }
  assert.ok(manifest.content_scripts.some(script =>
    script.run_at === 'document_start' && script.js.includes('server-storage.js')));
  assert.ok(!manifest.permissions.includes('cookies'), 'same-origin API bridge does not need cookie access');
});
