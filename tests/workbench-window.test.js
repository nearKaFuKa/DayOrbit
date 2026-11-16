const test = require('node:test');
const assert = require('node:assert/strict');
const { createCoordinator } = require('../src/workbench-window.js');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}

test('only one editor can hold a browser lock; a second window can take over after release', async () => {
  let holder = false;
  const locks = {
    request: (_key, _options, callback) => {
      if (holder) return Promise.resolve(callback(null));
      holder = true;
      return Promise.resolve(callback({})).finally(() => { holder = false; });
    }
  };
  const options = { locks, storage: memoryStorage(), key: 'workbench-test' };
  const first = createCoordinator(options);
  const second = createCoordinator(options);
  assert.equal(await first.claim(), true);
  assert.equal(await second.claim(), false);
  assert.equal(first.canWrite(), true);
  assert.equal(second.canWrite(), false);
  first.release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await second.claim(), true);
  second.release();
});

test('shared browser storage still blocks a second editor if lock scopes differ', async () => {
  const storage = memoryStorage();
  const separateLock = () => ({ request: (_key, _options, callback) => Promise.resolve(callback({})) });
  const options = { storage, key: 'workbench-shared-storage', now: () => 1000,
    delay: callback => callback(), schedule: () => 1, cancel: () => {} };
  const first = createCoordinator({ ...options, locks: separateLock(), id: 'first' });
  const second = createCoordinator({ ...options, locks: separateLock(), id: 'second' });
  assert.equal(await first.claim(), true);
  assert.equal(await second.claim(), false);
  assert.equal(second.canWrite(), false);
  first.release();
  assert.equal(await second.claim(), true);
  second.release();
});

test('storage fallback blocks a second editor and detects a stolen lease', async () => {
  const storage = memoryStorage();
  let time = 1000;
  let lost = 0;
  const options = { storage, key: 'workbench-test', now: () => time,
    delay: callback => callback(), schedule: () => 1, cancel: () => {} };
  const first = createCoordinator({ ...options, id: 'first', onLost: () => { lost += 1; } });
  const second = createCoordinator({ ...options, id: 'second' });
  assert.equal(await first.claim(), true);
  assert.equal(await second.claim(), false);
  assert.equal(second.canWrite(), false);
  storage.setItem(first.leaseKey, JSON.stringify({ id: 'other', until: time + 30000 }));
  assert.equal(first.check(), false);
  assert.equal(lost, 1);
  time += 30001;
  assert.equal(await second.claim(), true);
  assert.equal(second.canWrite(), true);
  second.release();
});

test('simultaneous fallback claims settle on one editor', async () => {
  const storage = memoryStorage();
  const options = { storage, key: 'workbench-race', now: () => 1000,
    delay: callback => callback(), schedule: () => 1, cancel: () => {} };
  const first = createCoordinator({ ...options, id: 'first' });
  const second = createCoordinator({ ...options, id: 'second' });
  const claims = await Promise.all([first.claim(), second.claim()]);
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(Number(first.canWrite()) + Number(second.canWrite()), 1);
  first.release();
  second.release();
});

test('closing a window during a pending claim does not leave it as editor', async () => {
  const storage = memoryStorage();
  let finishDelay;
  const coordinator = createCoordinator({ storage, key: 'workbench-closing', id: 'closing',
    delay: callback => { finishDelay = callback; }, schedule: () => 1, cancel: () => {} });
  const claim = coordinator.claim();
  coordinator.release();
  finishDelay();
  assert.equal(await claim, false);
  assert.equal(coordinator.canWrite(), false);
  assert.equal(storage.getItem(coordinator.leaseKey), null);
});

test('a suspended heartbeat does not revoke an editor that still holds its browser lock', async () => {
  let time = 1000;
  const coordinator = createCoordinator({
    storage: memoryStorage(), key:'workbench-resume', id:'owner', now:()=>time,
    locks: {request: (_key, _options, callback) => Promise.resolve(callback({}))},
    delay: callback=>callback(), schedule: ()=>1, cancel: ()=>{}
  });
  assert.equal(await coordinator.claim(), true);
  time += 60000;
  assert.equal(coordinator.canWrite(), true);
  coordinator.release();
});
