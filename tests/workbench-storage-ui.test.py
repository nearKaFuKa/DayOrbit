"""Isolated browser acceptance; OPFS replaces the real folder picker, never user data."""
import functools
import http.server
import shutil
import tempfile
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='workbench-storage-test-') as temp:
    site = Path(temp)
    shutil.copy2(root / '工作台.html', site / '工作台.html')
    shutil.copytree(root / 'src', site / 'src')
    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0),
        functools.partial(QuietHandler, directory=str(site)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/工作台.html'
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={'width': 1280, 'height': 900})
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(url)
            page.wait_for_function('!document.querySelector("#app").inert')
            page.evaluate(r'''async () => {
              const root = await navigator.storage.getDirectory();
              const mats = await root.getDirectoryHandle('素材', {create:true});
              async function write(name, text) {
                const h = await mats.getFileHandle(name, {create:true});
                const w = await h.createWritable(); await w.write(text); await w.close();
              }
              await write('_groups.json', JSON.stringify(['常用Skill','空分组']));
              await write('mat-200.md', '---\ntype: text\nid: 200\nmgroup: 常用Skill\ncreated: 2026-11-16T00:00:00Z\n---\n\n原素材正文');
              window.showDirectoryPicker = async () => root;
            }''')
            page.locator('#storeBtn').click()
            page.locator('#saveState[data-state="saved"]').wait_for(state='attached')
            page.locator('.tab[data-page="materials"]').click()
            group_names = page.locator('#matGroups .g-name').all_text_contents()
            assert '常用Skill' in group_names and '空分组' in group_names, group_names
            assert page.evaluate('JSON.parse(localStorage.wt_groups)') == ['常用Skill','空分组']
            page.locator('.mat-card .snippet').click()
            page.locator('.mat-inline-rich').fill('修改后独立保存的素材')
            page.locator('.mat-inline-save').click()
            page.locator('#saveState[data-state="saved"]').wait_for(state='attached')
            assert '修改后独立保存的素材' in page.evaluate('''async () => {
              const d = await Store.root.getDirectoryHandle('素材');
              return (await (await d.getFileHandle('mat-200.md')).getFile()).text();
            }''')
            page.reload()
            page.locator('#saveState[data-state="saved"]').wait_for(state='attached')
            assert page.locator('.mat-card .snippet').inner_text() == '修改后独立保存的素材'
            assert page.evaluate('matGroups') == ['常用Skill','空分组']
            second = context.new_page()
            second.goto(url)
            second.locator('#windowGuard').wait_for(state='visible')
            assert second.evaluate('editorWindow.canWrite()') is False
            second.close()
            # A failed read blocks all writes instead of replacing unread metadata with [].
            page.evaluate('''async () => {
              const d = await Store.root.getDirectoryHandle('素材');
              const h = await d.getFileHandle('_groups.json');
              const w = await h.createWritable(); await w.write('{invalid'); await w.close();
            }''')
            page.reload()
            page.locator('#saveState[data-state="error"]').wait_for(state='attached')
            assert page.evaluate('Store.folderMode') is False
            assert page.evaluate('''async () => {
              const d = await Store.root.getDirectoryHandle('素材');
              return (await (await d.getFileHandle('_groups.json')).getFile()).text();
            }''') == '{invalid'
            assert not errors, errors
            print('PASS: fresh-origin groups, empty groups, edit/write/reload, second-window protection, failed-read preservation; no page errors')
            browser.close()
    finally:
        server.shutdown()
