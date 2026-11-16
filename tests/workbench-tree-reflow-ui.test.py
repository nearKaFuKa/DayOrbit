import shutil
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright


root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='daydeck-tree-reflow-') as temp:
    site = Path(temp)
    shutil.copy2(root / '工作台.html', site / '工作台.html')
    (site / 'src').mkdir()
    for filename in ('workbench-core.js', 'workbench-window.js'):
        shutil.copy2(root / 'src' / filename, site / 'src' / filename)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto((site / '工作台.html').as_uri())
        page.evaluate('''() => {
          const date = new Date().toISOString().slice(0, 10);
          const common = {status:'new', priority:'mid', date, board:'树测试', x:40, y:40, temporary:false};
          localStorage.setItem('wt_boards', JSON.stringify([{id:1, name:'树测试', kind:'concept', created:'2026-11-16T01:00:00Z'}]));
          localStorage.setItem('wt_ideas', JSON.stringify([
            {...common, id:1, text:'根', tx:40, ty:122, created:'2026-11-16T01:00:00Z'},
            {...common, id:2, text:'第一项', tx:326, ty:40, created:'2026-11-16T02:00:00Z'},
            {...common, id:3, text:'第二项', tx:326, ty:204, created:'2026-11-16T03:00:00Z'},
            {...common, id:9, text:'自由卡', tx:700, ty:700, created:'2026-11-16T04:00:00Z'}
          ]));
          localStorage.setItem('wt_links', JSON.stringify([{f:1,t:2},{f:1,t:3}]));
        }''')
        page.reload()
        page.locator('.tab[data-page="topic"]').click()
        first = page.locator('#tboard .idea-card[data-id="2"]')
        second = page.locator('#tboard .idea-card[data-id="3"]')
        free = page.locator('#tboard .idea-card[data-id="9"]')
        original_second_y = second.evaluate('(e) => e.offsetTop')
        original_free_y = free.evaluate('(e) => e.offsetTop')
        first.locator('textarea').dblclick()
        editor = first.locator('textarea')
        editor.fill('长文字\n' * 30)
        assert editor.evaluate('(e) => document.activeElement === e'), 'typing focus was lost'
        expanded_second_y = second.evaluate('(e) => e.offsetTop')
        first_bottom = first.evaluate('(e) => e.offsetTop + e.offsetHeight')
        assert expanded_second_y >= first_bottom + 16, (expanded_second_y, first_bottom)
        assert expanded_second_y > original_second_y, (expanded_second_y, original_second_y)
        editor.fill('变短')
        compact_second_y = second.evaluate('(e) => e.offsetTop')
        assert compact_second_y < expanded_second_y, (compact_second_y, expanded_second_y)
        assert free.evaluate('(e) => e.offsetTop') == original_free_y
        editor.press('Tab')
        page.wait_for_timeout(700)
        page.reload()
        page.locator('.tab[data-page="topic"]').click()
        second = page.locator('#tboard .idea-card[data-id="3"]')
        assert second.evaluate('(e) => e.offsetTop') == compact_second_y
        first = page.locator('#tboard .idea-card[data-id="2"]')
        first.hover()
        first.locator('button.del').click()
        after_delete_y = second.evaluate('(e) => e.offsetTop')
        assert after_delete_y < compact_second_y, (after_delete_y, compact_second_y)
        assert page.locator('#tboard .idea-card[data-id="9"]').evaluate('(e) => e.offsetTop') == original_free_y
        page.keyboard.press('Meta+z')
        assert page.locator('#tboard .idea-card[data-id="2"]').count() == 1
        assert page.locator('#tboard .idea-card[data-id="3"]').evaluate('(e) => e.offsetTop') == compact_second_y
        page.keyboard.press('Meta+Shift+z')
        assert page.locator('#tboard .idea-card[data-id="2"]').count() == 0
        assert page.locator('#tboard .idea-card[data-id="3"]').evaluate('(e) => e.offsetTop') == after_delete_y
        page.wait_for_timeout(700)
        page.reload()
        page.locator('.tab[data-page="topic"]').click()
        assert page.locator('#tboard .idea-card[data-id="3"]').evaluate('(e) => e.offsetTop') == after_delete_y
        page.evaluate('''() => {
          const cards = JSON.parse(localStorage.wt_ideas);
          const sample = cards.find(c => c.id === 3);
          cards.push({...sample, id:4, text:'下一项', ty:204, created:'2026-11-16T05:00:00Z'});
          localStorage.setItem('wt_ideas', JSON.stringify(cards));
          localStorage.setItem('wt_links', JSON.stringify([{f:1,t:3},{f:1,t:4}]));
        }''')
        page.reload()
        page.locator('.tab[data-page="topic"]').click()
        page.locator('#tboard .idea-card[data-id="3"]').click()
        page.keyboard.press('Delete')
        assert page.locator('#tboard .idea-card[data-id="3"]').count() == 0
        assert page.locator('#tboard .idea-card[data-id="4"]').evaluate('(e) => e.offsetTop') == 40
        root_card = page.locator('#tboard .idea-card[data-id="1"]')
        root_card.locator('button.fold').click()
        assert page.locator('#tboard .idea-card[data-id="4"]').count() == 0
        folded_y = root_card.evaluate('(e) => e.offsetTop')
        root_card.locator('textarea').dblclick()
        root_card.locator('textarea').fill('折叠时输入的长文字\n' * 15)
        assert root_card.evaluate('(e) => e.offsetTop') == folded_y
        assert not errors, errors
        browser.close()

print('Tree reflow UI: grow, shrink, button/keyboard delete, undo/redo, folded tree, focus, refresh and free card passed')
