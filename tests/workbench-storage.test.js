const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../工作台.html'), 'utf8');

// Execute the page's real storage methods with isolated directory handles.
function storageHarness(handle) {
  const elements = new Map();
  let remembered;
  const context = vm.createContext({
    window: {showDirectoryPicker: true},
    showDirectoryPicker: async () => handle,
    idbSet: async (_key, value) => { remembered = value; },
    idbGet: async () => handle,
    setSaveState: () => {}, toast: () => {},
    editorWindow: {canWrite: () => true},
    $: selector => {
      if (!elements.has(selector)) elements.set(selector, {classList: {add() {}, remove() {}}});
      return elements.get(selector);
    }
  });
  const source = html.slice(html.indexOf('const Store = {'), html.indexOf("let lastSaveError = ''"));
  vm.runInContext(source + '\nthis.store = Store;', context);
  return {store: context.store, remembered: () => remembered};
}

test('failed folder preparation cannot mark a new directory connected or remember it', async () => {
  const candidate = {name: '拒绝写入的目录', getDirectoryHandle: async () => {throw Error('permission denied');}};
  const {store, remembered} = storageHarness(candidate);
  await assert.rejects(store.connect(), /permission denied/);
  assert.equal(store.folderMode, false);
  assert.equal(store.root, null);
  assert.equal(remembered(), undefined);
});

test('denied renewed permission disables writes even if the directory was connected earlier', async () => {
  const handle = {requestPermission: async () => 'denied'};
  const {store} = storageHarness(handle);
  store.root = handle; store.folderMode = true;
  assert.equal(await store.requestPermission(), false);
  assert.equal(store.folderMode, false);
});

test('permission granted but directory inaccessible does not leave writes enabled', async () => {
  const handle = {requestPermission: async () => 'granted', getDirectoryHandle: async () => {throw Error('unavailable');}};
  const {store} = storageHarness(handle);
  store.root = handle;
  await assert.rejects(store.requestPermission(), /unavailable/);
  assert.equal(store.folderMode, false);
});

test('successful permission and directory preparation connects the selected handle', async () => {
  const dir = {getDirectoryHandle: async () => dir};
  const handle = {name:'验收临时目录', getDirectoryHandle: async () => dir};
  const {store, remembered} = storageHarness(handle);
  assert.equal(await store.connect(), true);
  assert.equal(store.root, handle);
  assert.equal(store.folderMode, true);
  assert.equal(remembered(), handle);
});
