// Server registry + browser.storage.local adapter.
//
// Nexus Accounting used to have one implicit universe (Season 0), so every
// value lived at an unprefixed storage key. The adapter keeps the existing API
// while prefixing keys with the selected universe. That prevents report ids,
// planet caches and preferences from leaking between NX-S0 and NX-NF.
(function initNexusServerStorage() {
  'use strict';

  if (globalThis.nexusStorage) return;

  const ACTIVE_SERVER_KEY = 'nexus_active_server';
  const MIGRATION_KEY = 'nexus_server_storage_v1';
  const PREFIX = 'nexus_server:';
  const SERVERS = Object.freeze({
    s0: Object.freeze({
      key: 's0',
      id: 'NX-S0',
      name: '第 0 赛季',
      hostname: 's0.nexuslegacy.space',
      origin: 'https://s0.nexuslegacy.space',
    }),
    nf: Object.freeze({
      key: 'nf',
      id: 'NX-NF',
      name: '新边疆',
      hostname: 'nf.nexuslegacy.space',
      origin: 'https://nf.nexuslegacy.space',
    }),
  });

  function normalizeServerKey(key) {
    return Object.hasOwn(SERVERS, key) ? key : 's0';
  }

  function serverKeyFromHostname(hostname) {
    const host = String(hostname || '').toLowerCase();
    return Object.values(SERVERS).find(server => server.hostname === host)?.key || null;
  }

  function serverFromUrl(url) {
    try {
      const key = serverKeyFromHostname(new URL(url).hostname);
      return key ? SERVERS[key] : null;
    } catch {
      return null;
    }
  }

  function extensionApi() {
    return globalThis.browser || globalThis.chrome;
  }

  function rawStorage() {
    const local = extensionApi()?.storage?.local;
    if (!local) throw new Error('browser.storage.local 不可用');
    return local;
  }

  function pageServerKey() {
    return serverKeyFromHostname(globalThis.location?.hostname);
  }

  async function getActiveServerKey() {
    const pageKey = pageServerKey();
    if (pageKey) return pageKey;
    const stored = await rawStorage().get(ACTIVE_SERVER_KEY);
    return normalizeServerKey(stored[ACTIVE_SERVER_KEY]);
  }

  async function getActiveServer() {
    return SERVERS[await getActiveServerKey()];
  }

  async function setActiveServer(key) {
    if (!Object.hasOwn(SERVERS, key)) throw new Error(`未知的 Nexus Legacy 服务器：${key}`);
    await rawStorage().set({ [ACTIVE_SERVER_KEY]: key });
    return SERVERS[key];
  }

  // Tests replace the global browser stub between imports. Tie the one-time
  // migration promise to that object so each isolated store is migrated too.
  let migrationBrowser = null;
  let migrationPromise = null;

  function scopedKey(serverKey, key) {
    return `${PREFIX}${serverKey}:${key}`;
  }

  function isInternalKey(key) {
    return key === ACTIVE_SERVER_KEY || key === MIGRATION_KEY || key.startsWith(PREFIX);
  }

  async function ensureMigrated() {
    if (migrationBrowser !== extensionApi()) {
      migrationBrowser = extensionApi();
      migrationPromise = null;
    }
    if (migrationPromise) return migrationPromise;

    migrationPromise = (async () => {
      const local = rawStorage();
      const all = await local.get(null);
      if (all[MIGRATION_KEY]) return;

      const legacyKeys = Object.keys(all).filter(key => !isInternalKey(key));
      if (legacyKeys.length) {
        const migrated = {};
        for (const key of legacyKeys) migrated[scopedKey('s0', key)] = all[key];
        // Copy first, then remove. An interrupted migration can safely retry.
        await local.set(migrated);
        await local.remove(legacyKeys);
      }
      await local.set({ [MIGRATION_KEY]: 1 });
    })();

    return migrationPromise;
  }

  async function get(keys) {
    await ensureMigrated();
    const serverKey = await getActiveServerKey();
    const prefix = scopedKey(serverKey, '');
    const local = rawStorage();

    if (keys == null) {
      const all = await local.get(null);
      const result = {};
      for (const [key, value] of Object.entries(all)) {
        if (key.startsWith(prefix)) result[key.slice(prefix.length)] = value;
      }
      return result;
    }

    const defaults = !Array.isArray(keys) && typeof keys === 'object' ? keys : null;
    const requested = typeof keys === 'string' ? [keys] : defaults ? Object.keys(defaults) : keys;
    const prefixed = requested.map(key => scopedKey(serverKey, key));
    const stored = await local.get(prefixed);
    const result = {};
    for (let i = 0; i < requested.length; i++) {
      const key = requested[i];
      const storageKey = prefixed[i];
      if (Object.hasOwn(stored, storageKey)) result[key] = stored[storageKey];
      else if (defaults && Object.hasOwn(defaults, key)) result[key] = defaults[key];
    }
    return result;
  }

  async function set(items) {
    await ensureMigrated();
    const serverKey = await getActiveServerKey();
    const scoped = {};
    for (const [key, value] of Object.entries(items)) scoped[scopedKey(serverKey, key)] = value;
    await rawStorage().set(scoped);
  }

  async function remove(keys) {
    await ensureMigrated();
    const serverKey = await getActiveServerKey();
    const list = Array.isArray(keys) ? keys : [keys];
    await rawStorage().remove(list.map(key => scopedKey(serverKey, key)));
  }

  async function clear() {
    await ensureMigrated();
    const serverKey = await getActiveServerKey();
    const prefix = scopedKey(serverKey, '');
    const all = await rawStorage().get(null);
    const keys = Object.keys(all).filter(key => key.startsWith(prefix));
    if (keys.length) await rawStorage().remove(keys);
  }

  const listenerWrappers = new WeakMap();
  const onChanged = Object.freeze({
    addListener(listener) {
      if (listenerWrappers.has(listener)) return;
      const wrapper = (changes, area) => {
        if (area !== 'local') return;
        void (async () => {
          const serverKey = await getActiveServerKey();
          const prefix = scopedKey(serverKey, '');
          const scoped = {};
          for (const [key, change] of Object.entries(changes)) {
            if (key.startsWith(prefix)) scoped[key.slice(prefix.length)] = change;
          }
          if (Object.keys(scoped).length) listener(scoped, area);
        })();
      };
      listenerWrappers.set(listener, wrapper);
      extensionApi().storage.onChanged.addListener(wrapper);
    },
    removeListener(listener) {
      const wrapper = listenerWrappers.get(listener);
      if (!wrapper) return;
      extensionApi().storage.onChanged.removeListener(wrapper);
      listenerWrappers.delete(listener);
    },
  });

  globalThis.nexusStorage = Object.freeze({
    get,
    set,
    remove,
    clear,
    onChanged,
    servers: SERVERS,
    getActiveServer,
    setActiveServer,
    serverFromUrl,
  });

  // Opening a game page makes that universe the dashboard/background target.
  const detected = pageServerKey();
  if (detected) void setActiveServer(detected).catch(() => {});
})();
