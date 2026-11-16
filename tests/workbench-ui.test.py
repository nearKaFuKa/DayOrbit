import shutil
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='workbench-ui-') as temp:
    site = Path(temp)
    shutil.copy2(root / '工作台.html', site / '工作台.html')
    (site / 'src').mkdir()
    shutil.copy2(root / 'src/workbench-core.js', site / 'src/workbench-core.js')
    shutil.copy2(root / 'src/workbench-window.js', site / 'src/workbench-window.js')
    url = (site / '工作台.html').as_uri()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url)
        page.evaluate('''() => {
          const date = new Date().toISOString().slice(0,10);
          const cards = [
            {id:100,text:'根节点',status:'new',priority:'mid',date,board:'测试项目',created:'2026-11-10T01:00:00Z',updated:'2026-11-10T01:00:00Z',x:50,y:50,tx:40,ty:100,temporary:false},
            {id:101,text:'子节点',status:'new',priority:'mid',date,board:'测试项目',created:'2026-11-10T02:00:00Z',updated:'2026-11-10T02:00:00Z',x:50,y:50,tx:340,ty:100,temporary:false},
            {id:102,text:'后续子节点',status:'new',priority:'mid',date,board:'测试项目',created:'2026-11-10T03:00:00Z',updated:'2026-11-10T03:00:00Z',x:50,y:50,tx:340,ty:260,temporary:false}
          ];
          localStorage.setItem('wt_boards', JSON.stringify([
            {id:1,name:'测试项目',created:'2026-11-10T01:00:00Z'},
            {id:2,name:'旧概念白板',kind:'concept',created:'2026-11-10T02:00:00Z'},
            {id:3,name:'开发白板',kind:'dev',created:'2026-11-10T03:00:00Z'}
          ]));
          localStorage.setItem('wt_ideas', JSON.stringify(cards));
          localStorage.setItem('wt_links', JSON.stringify([{f:100,t:101},{f:100,t:102}]));
          localStorage.setItem('wt_mats', JSON.stringify([{id:200,type:'text',content:'原素材',note:'原备注',tags:['原'],created:'2026-11-10T01:00:00Z'}]));
          localStorage.setItem('wt_groups', JSON.stringify(['设计组','研发组']));
        }''')
        page.reload()

        # 刷新后保留当前页、选中的项目与今日白板日期（状态仅属于当前标签页）
        page.locator('.tab[data-page="topic"]').click()
        page.locator('#boardSelect').select_option('2')
        page.reload()
        assert page.locator('.tab.active').get_attribute('data-page') == 'topic'
        assert page.locator('#boardSelect').input_value() == '2'
        page.locator('.tab[data-page="materials"]').click()
        page.reload()
        assert page.locator('.tab.active').get_attribute('data-page') == 'materials'
        page.locator('.tab[data-page="board"]').click()
        page.locator('#datePick').fill('2026-11-09')
        page.locator('#datePick').dispatch_event('change')
        page.reload()
        assert page.locator('.tab.active').get_attribute('data-page') == 'board'
        assert page.locator('#datePick').input_value() == '2026-11-09'
        page.locator('#todayBtn').click()

        # 今日白板新任务排在当前状态列顶部
        for label in ('新任务 A', '新任务 B'):
            page.locator('#quickIdeaInput').fill(label)
            page.locator('#quickIdeaInput').press('Enter')
        todo_texts = page.locator('#board .idea-card[data-kstatus="todo"] textarea').evaluate_all('(nodes) => nodes.map(node => node.value)')
        assert todo_texts[:2] == ['新任务 B', '新任务 A'], todo_texts

        # 1. 左侧并行项目拖拽排序 + 持久化 + 新项目默认置顶
        proj_names_before = page.locator('#sideProjects .proj-name').all_inner_texts()
        assert proj_names_before == ['开发白板', '旧概念白板', '测试项目'], proj_names_before
        # 将“测试项目”拖到“开发白板”上方
        page.evaluate('''() => {
          const items = [...document.querySelectorAll('#sideProjects .proj-item')];
          const src = items.find(el => el.dataset.boardName === '测试项目');
          const tgt = items.find(el => el.dataset.boardName === '开发白板');
          const dt = new DataTransfer();
          src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
          const rect = tgt.getBoundingClientRect();
          tgt.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientY: rect.top + 2, dataTransfer: dt }));
          tgt.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientY: rect.top + 2, dataTransfer: dt }));
          src.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
        }''')
        proj_names_after = page.locator('#sideProjects .proj-name').all_inner_texts()
        assert proj_names_after == ['测试项目', '开发白板', '旧概念白板'], proj_names_after
        page.reload()
        assert page.locator('#sideProjects .proj-name').all_inner_texts() == ['测试项目', '开发白板', '旧概念白板']

        # 5. 新建白板模板精简（仅保留“开发进行中”与“空白白板”入口），且新项目默认置顶
        page.locator('#sideNewProjBtn').click()
        picker_kinds = page.evaluate('''() => [...document.querySelectorAll('#boardKindPicker button')].map(b => b.dataset.kind)''')
        assert picker_kinds == ['dev', ''], picker_kinds
        page.locator('#boardKindPicker button[data-kind="dev"]').click()
        page.locator('.wb-popover .wb-pop-input').fill('新置顶开发板')
        page.locator('.wb-popover .wb-pop-btn').click()
        assert page.locator('#sideProjects .proj-name').first.inner_text() == '新置顶开发板'

        # 4. 校准项目白板新建区域：正常窗口、窄窗口下三区域对齐且间距一致；区域内连续新建卡片归属与对齐
        area_metrics = page.evaluate('''() => {
          const els = [...document.querySelectorAll('#tboard .t-area')];
          return els.map(e => ({
            area: e.dataset.area,
            left: e.offsetLeft,
            top: e.offsetTop,
            width: e.offsetWidth,
            height: e.offsetHeight
          }));
        }''')
        assert [a['area'] for a in area_metrics] == ['Bug 修复', '体验优化', '新功能'], area_metrics
        assert area_metrics[0]['top'] == area_metrics[1]['top'] == area_metrics[2]['top'] == 24, area_metrics
        assert area_metrics[0]['width'] == area_metrics[1]['width'] == area_metrics[2]['width'] == 340, area_metrics
        assert area_metrics[0]['height'] == area_metrics[1]['height'] == area_metrics[2]['height'], area_metrics
        gap_01 = area_metrics[1]['left'] - (area_metrics[0]['left'] + area_metrics[0]['width'])
        gap_12 = area_metrics[2]['left'] - (area_metrics[1]['left'] + area_metrics[1]['width'])
        assert gap_01 == gap_12 == 24, (gap_01, gap_12)

        # 在“Bug 修复”区域内连续新建两条紧凑任务，验证项目与区域归属
        for label in ('第一条Bug', '第二条Bug'):
            area_input = page.locator('.t-area[data-area="Bug 修复"] .t-sub-quick input')
            area_input.fill(label)
            area_input.press('Enter')
        dev_cards = page.evaluate('''() => JSON.parse(localStorage.wt_ideas).filter(c => c.board === '新置顶开发板')''')
        assert len(dev_cards) == 2, dev_cards
        assert dev_cards[0]['tarea'] == 'Bug 修复' and dev_cards[1]['tarea'] == 'Bug 修复', dev_cards
        assert [c['text'] for c in dev_cards] == ['第一条Bug', '第二条Bug'], dev_cards
        assert page.locator('.t-area[data-area="Bug 修复"] .t-sub-row').count() == 2

        # 旧“概念型项目”白板仍可正常打开和编辑
        page.locator('#sideProjects .proj-item[data-board-name="旧概念白板"]').click()
        assert page.locator('#boardKindTag').inner_text() == '概念型项目'

        # 切回“测试项目”验证树同级创建、多选、批量移动、Delete 批量删除与撤销
        page.locator('#sideProjects .proj-item[data-board-name="测试项目"]').click()
        child = page.locator('#tboard .idea-card[data-id="101"]')
        child.locator('textarea').click()
        page.keyboard.press('Enter')
        page.keyboard.type('新同级节点')
        page.locator('#tboard').click(position={'x':700,'y':500})
        state = page.evaluate('''() => ({cards:JSON.parse(localStorage.wt_ideas),links:JSON.parse(localStorage.wt_links)})''')
        created = next(c for c in state['cards'] if c['text']=='新同级节点')
        assert {'f':100,'t':created['id']} in state['links'], state
        assert next(c for c in state['cards'] if c['id']==102)['ty']>created['ty'], state
        page.keyboard.press('Meta+z')
        assert all(c['id']!=created['id'] for c in page.evaluate('JSON.parse(localStorage.wt_ideas)'))
        page.keyboard.press('Meta+Shift+z')
        assert any(c['id']==created['id'] for c in page.evaluate('JSON.parse(localStorage.wt_ideas)'))

        # 3. 项目白板多选（普通点击单选、Command/Shift 增减选、多选整组移动、多选 Command+C 提示）
        c101 = page.locator('#tboard .idea-card[data-id="101"]')
        c102 = page.locator('#tboard .idea-card[data-id="102"]')
        c101.click()
        c102.click(modifiers=['Shift'])
        sel_ids = page.evaluate('''() => [...document.querySelectorAll('#tboard .idea-card.selected')].map(e => Number(e.dataset.id)).sort()''')
        assert sel_ids == [101, 102], sel_ids

        # 多选时按 Command+C 给出明确反馈且不悄悄复制单张
        page.keyboard.press('Meta+c')
        assert '暂不支持多选批量复制' in page.locator('#toast').inner_text()

        # 拖动多选中的卡片：整组一起移动并保持相对位置，单步撤销恢复
        pos_before = page.evaluate('''() => {
          const cs = JSON.parse(localStorage.wt_ideas);
          return {
            c101: cs.find(c => c.id === 101),
            c102: cs.find(c => c.id === 102)
          };
        }''')
        grip101 = c101.locator('.drag-grip').bounding_box()
        page.mouse.move(grip101['x'] + 4, grip101['y'] + 4)
        page.mouse.down()
        page.mouse.move(grip101['x'] + 64, grip101['y'] + 34, steps=5)
        page.mouse.up()
        pos_after = page.evaluate('''() => {
          const cs = JSON.parse(localStorage.wt_ideas);
          return {
            c101: cs.find(c => c.id === 101),
            c102: cs.find(c => c.id === 102)
          };
        }''')
        assert (pos_after['c102']['tx'] - pos_after['c101']['tx']) == (pos_before['c102']['tx'] - pos_before['c101']['tx'])
        assert (pos_after['c102']['ty'] - pos_after['c101']['ty']) == (pos_before['c102']['ty'] - pos_before['c101']['ty'])
        assert pos_after['c101']['tx'] > pos_before['c101']['tx']
        page.keyboard.press('Meta+z')
        pos_undo = page.evaluate('''() => {
          const cs = JSON.parse(localStorage.wt_ideas);
          return {
            c101: cs.find(c => c.id === 101),
            c102: cs.find(c => c.id === 102)
          };
        }''')
        assert pos_undo['c101']['tx'] == pos_before['c101']['tx'] and pos_undo['c102']['ty'] == pos_before['c102']['ty']

        # 2. Delete / Backspace 批量删除选中卡片及关联连线，取消选中后单步撤销恢复
        c101.click()
        c102.click(modifiers=['Meta'])
        page.keyboard.press('Backspace')
        after_del = page.evaluate('''() => ({
          ids: JSON.parse(localStorage.wt_ideas).filter(c => c.board === '测试项目').map(c => c.id),
          links: JSON.parse(localStorage.wt_links)
        })''')
        assert 101 not in after_del['ids'] and 102 not in after_del['ids'], after_del
        assert all(l['t'] not in (101, 102) and l['f'] not in (101, 102) for l in after_del['links']), after_del
        # 单步撤销恢复两张卡片及连线
        page.keyboard.press('Meta+z')
        after_undo_del = page.evaluate('''() => ({
          ids: JSON.parse(localStorage.wt_ideas).filter(c => c.board === '测试项目').map(c => c.id),
          links: JSON.parse(localStorage.wt_links)
        })''')
        assert 101 in after_undo_del['ids'] and 102 in after_undo_del['ids'], after_undo_del
        assert {'f': 100, 't': 101} in after_undo_del['links'] and {'f': 100, 't': 102} in after_undo_del['links'], after_undo_del

        # 6. 素材库在选中分组视图内新增内容自动归组（按钮点击、回车、复制均保留分组）
        page.locator('.tab[data-page="materials"]').click()
        page.locator('#matGroups .mat-group-item[data-group="设计组"]').click()
        page.locator('#matInput').fill('设计组内回车新增素材')
        page.locator('#matInput').press('Enter')
        page.locator('#matInput').fill('https://example.com/design-ref')
        page.locator('#tagInput').fill('UI, 灵感')
        page.locator('#addMat').click()
        assert page.locator('#matGrid .mat-card').count() == 2
        page.locator('#matGrid .mat-card').first.locator('.copy').click()
        assert page.locator('#matGrid .mat-card').count() == 3
        design_mats = page.evaluate('''() => JSON.parse(localStorage.wt_mats).filter(m => m.mgroup === '设计组')''')
        assert len(design_mats) == 3, design_mats
        assert len({m['id'] for m in design_mats}) == 3, design_mats

        # 同一段文字连续设置格式，旧颜色/字号须被新值替换且选区不丢
        page.locator('#matGrid .mat-card').filter(has_text='设计组内回车新增素材').locator('.snippet').click()
        selected_text = '设计组内回车新增素材'
        page.evaluate('''() => {
          const editor = document.querySelector('#matGrid .mat-editing .mat-inline-rich');
          const range = document.createRange();
          range.selectNodeContents(editor);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }''')
        page.locator('#matGrid .mat-editing .rich-toolbar').wait_for(state='visible')
        for selector in (
            '[data-rich="bold"]',
            '[data-rich="color"][data-color="#c0392b"]',
            '[data-rich="color"][data-color="#1e8449"]',
            '[data-rich="size"][data-size="0.92em"]',
            '[data-rich="size"][data-size="1.18em"]',
        ):
            page.locator(f'#matGrid .mat-editing .rich-toolbar button{selector}').click()
            assert page.evaluate('''() => window.getSelection().toString()''') == selected_text
            page.evaluate('''() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))''')
            assert page.locator('#matGrid .mat-editing .rich-toolbar').is_visible()
        page.locator('#matGrid .mat-editing .mat-inline-save').click()
        formatted = page.evaluate('''() => JSON.parse(localStorage.wt_mats).find(m => m.content.includes('设计组内回车新增素材')).content''')
        assert '<b>' in formatted and 'color:#1e8449' in formatted and 'font-size:1.18em' in formatted, formatted
        assert 'color:#c0392b' not in formatted and 'font-size:0.92em' not in formatted, formatted

        # 窄窗口与多视口校验
        for width in (1280, 800, 480, 320):
            page.set_viewport_size({'width': width, 'height': 800})
            box = page.locator('#materials').bounding_box()
            card = page.locator('.mat-card').first.bounding_box()
            assert card['x'] >= box['x'] and card['x'] + card['width'] <= box['x'] + box['width'] + 1, (width, box, card)
            page.locator('.tab[data-page="board"]').click()
            canvas = page.locator('#board').bounding_box()
            wrap = page.locator('#boardWrap').bounding_box()
            assert canvas['width'] >= 760 and wrap['x'] >= 0, (width, canvas, wrap)
            page.locator('.tab[data-page="materials"]').click()

        assert not errors, errors
        browser.close()
        print('UI check passed: project sort, multi-select, group move, Delete batch undo, dev area calibration, template simplify, material auto-group, responsive widths')
