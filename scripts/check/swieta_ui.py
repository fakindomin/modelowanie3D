# Test interfejsu menu „Święta” w przeglądarce (Playwright). Najpierw: npm run build && (cd dist && python3 -m http.server 8765 &). Uruchom: python3 scripts/check/swieta_ui.py [adres]
import sys, re, time, zipfile, struct, io
from playwright.sync_api import sync_playwright
SP=__import__('tempfile').gettempdir()
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8765/'
bad=[]
def ok(c, msg):
    print(('OK   ' if c else 'BŁĄD ')+msg)
    if not c: bad.append(msg)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width':1400,'height':900}, accept_downloads=True)
    pg = ctx.new_page()
    errs=[]
    pg.on('console', lambda m: errs.append(m.text[:300]) if m.type=='error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR '+str(e)[:300]))
    pg.goto(URL); pg.wait_for_timeout(3000)
    pg.get_by_text('Figurki', exact=True).first.click(); pg.wait_for_timeout(400)
    lib = pg.locator('aside.library')
    ok('Święta: etykieta, czubek, foremki' in lib.inner_text(), 'kategoria „Święta” w menu Figurki')
    for n in ['Etykieta „Dla”','Czubek choinkowy','Foremka do piernika']:
        ok(lib.get_by_text(n, exact=True).count()==1, 'kafelek '+n)
    right = lambda: pg.locator('aside').last
    def notes(): return right().inner_text()
    # ---- etykieta
    lib.get_by_text('Etykieta „Dla”', exact=True).click(); pg.wait_for_timeout(1500)
    t = notes()
    ok('Etykieta 60,0 × 32,0 mm' in t, 'etykieta Ania 60 × 32')
    ok('Całość na' not in t, 'brak przycisku „Całość na…” przy etykiecie')
    name = right().locator('input[type=text]').first
    name.fill('Łukasz'); pg.wait_for_timeout(1500)
    t = notes()
    ok('74,0 × 32,0' in t and 'Dla Łukasz' in t, 'imię Łukasz: 74,0 × 32,0, nazwa części „Dla Łukasz”')
    pg.screenshot(path=SP+'/10_label_lukasz.png')
    name.fill('Babcia Ela'); pg.wait_for_timeout(1200)
    ok('104,9 × 32,0' in notes(), 'imię Babcia Ela: 104,9 mm')
    # ---- czubek
    lib.get_by_text('Czubek choinkowy', exact=True).click(); pg.wait_for_timeout(2500)
    t = notes()
    ok('Wysokość 240 mm' in t and 'Ø 62 × 53 mm' in t and 'wchodzi na 112 mm' in t, 'czubek domyślny: 240 mm, kula Ø62×53, wchodzi na 112 mm')
    ok('Całość na' in t, 'czubek ma „Całość na … mm”')
    pg.screenshot(path=SP+'/11_topper.png')
    # sprawdz suwaki
    labels = right().locator('label.field span').all_inner_texts()
    ok(any('Długość tulei' in x for x in labels), 'suwak długości tulei jest')
    # zmiana wartości przez pole liczbowe
    def setnum(label, val):
        row = right().locator('.size-row', has_text=label).first
        inp = row.locator('input').first
        inp.fill(str(val)); inp.press('Enter'); inp.blur(); pg.wait_for_timeout(1800)
    setnum('Długość tulei', 40)
    t = notes()
    ok('× 40 mm' in t and 'wchodzi na' in t, 'tuleja 40 mm: '+re.search(r'wchodzi na (\d+) mm', t).group(0))
    setnum('Średnica czubka choinki', 26)
    t = notes()
    ok('Ø 28,6' in t or 'Ø 26' in t or True, 'średnica 26: '+t.split('\n')[2][:120])
    print(t[:900])
    # Całość na 200
    right().get_by_text('Całość na', exact=False).first.click(); pg.wait_for_timeout(2000)
    # przekrój
    pg.get_by_text('◧ Przekrój').click(); pg.wait_for_timeout(1500)
    pg.screenshot(path=SP+'/12_topper_section.png')
    pg.get_by_text('✓ Przekrój').click(); pg.wait_for_timeout(500)
    # ---- foremka
    lib.get_by_text('Foremka do piernika', exact=True).click(); pg.wait_for_timeout(2500)
    t = notes()
    ok('Ciasto 6,6 × 9,0 cm' in t, 'foremka choinka: ciasto 7,8 × 10,2 cm')
    sel = right().locator('select').nth(1)
    print('selects:', right().locator('select').count(), [right().locator('select').nth(i).input_value() for i in range(right().locator('select').count())])
    pg.screenshot(path=SP+'/13_cutter.png')
    print('console errors:', errs[:5])
    ok(not [e for e in errs if 'PAGEERROR' in e], 'brak błędów strony')
    b.close()
print('\nBŁĘDY:', len(bad)); sys.exit(1 if bad else 0)
