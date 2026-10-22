"""Read-only docs smoke tests. Supports local and public deployments."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE=os.environ.get('DOCS_BASE_URL','http://localhost:3289').rstrip('/')
OUT=Path('/workspace/vendeo-docs-evidence'); OUT.mkdir(exist_ok=True)
checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for locale in ('fr','en'):
        for width,height in ((1440,1000),(390,844),(320,740)):
            context=browser.new_context(viewport={'width':width,'height':height},reduced_motion='reduce')
            def preferences(route):
                route.fulfill(status=200,content_type='application/json',body=json.dumps({'locale':locale}))
            context.route('**/api/account/preferences',preferences)
            context.add_init_script(f"localStorage.setItem('vendeo-lang','{locale}');")
            page=context.new_page(); errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            response=page.goto(BASE+'/docs',wait_until='networkidle')
            assert response.status==200
            page.get_by_role('heading',name='Le guide de votre espace Vendeo.' if locale=='fr' else 'Your guide to the Vendeo workspace.',exact=True).wait_for()
            assert page.locator('html').get_attribute('lang')==locale
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Overflow {locale} {width}'
            page.add_style_tag(content='nextjs-portal{display:none!important}')
            if width!=320: page.screenshot(path=str(OUT/f'docs-overview-{locale}-{width}.png'))
            # Check every guide anchor and nested article anchor, in both locales on desktop.
            targets=page.locator('.docs-guide-card').evaluate_all('(nodes)=>nodes.map(a=>({hash:a.getAttribute("href"),title:a.querySelector("h3").innerText}))')
            assert len(targets)>=22
            if width==1440:
                for target in targets:
                    page.evaluate('(hash)=>{location.hash=hash}',target['hash'])
                    page.locator('.docs-article-header h1').wait_for()
                    page.wait_for_function('(title)=>document.querySelector(".docs-article-header h1")?.innerText===title',arg=target['title'])
                    assert page.locator('.docs-article').count()>=3
                    anchors=page.locator('.docs-in-page a').evaluate_all('(nodes)=>nodes.map(a=>a.hash)')
                    for anchor in anchors:
                        assert page.locator('[id="'+anchor[1:]+'"]').count()==1,anchor
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                page.goto(BASE+'/docs#studio-slideshow/slideshow-structure',wait_until='networkidle')
                page.locator('[id="studio-slideshow/slideshow-structure"]').wait_for()
                assert page.locator('.docs-article-header h1').inner_text() in ('Diaporama animé','Animated slideshow','Diaporama : cinq visuels en MP4','Slideshow: five visuals in MP4') or 'Diaporama' in page.locator('.docs-article-header h1').inner_text() or 'Slideshow' in page.locator('.docs-article-header h1').inner_text()
                page.screenshot(path=str(OUT/f'docs-slideshow-{locale}-{width}.png'))
                page.locator('.docs-screenshot button').click()
                page.get_by_role('dialog').wait_for()
                assert page.get_by_role('dialog').get_by_role('button').evaluate('(node)=>document.activeElement===node')
                page.keyboard.press('Tab')
                assert page.get_by_role('dialog').get_by_role('button').evaluate('(node)=>document.activeElement===node')
                page.keyboard.press('Escape')
                assert page.get_by_role('dialog').count()==0
            else:
                page.locator('.docs-mobile-nav summary').click()
                page.locator('.docs-mobile-links a[href="#studio-slideshow"]').click()
                page.locator('.docs-article-header h1').wait_for()
                assert not page.locator('.docs-mobile-nav details').get_attribute('open')
                if width!=320: page.screenshot(path=str(OUT/f'docs-slideshow-{locale}-{width}.png'))
            # Search is global even when a guide is open.
            search=page.get_by_role('searchbox')
            search.fill('attribution')
            page.locator('.docs-result').first.wait_for()
            assert page.locator('.docs-result').count()>0
            page.locator('.docs-result').first.click()
            assert search.input_value()==''
            page.locator('.docs-article-header h1').wait_for()
            search.fill('no-such-guide-xyz')
            page.get_by_role('heading',name='Aucun article trouvé.' if locale=='fr' else 'No matching articles.',exact=True).wait_for()
            # Locale toggle remains functional without authentication.
            page.get_by_role('button',name='EN' if locale=='fr' else 'FR',exact=True).click()
            assert page.locator('html').get_attribute('lang')!=locale
            assert not errors,errors
            checks.append({'locale':locale,'viewport':width,'guides':len(targets),'status':'passed'})
            context.close()
    # Public landing navigation, including the mobile menu.
    for width in (1440,900,390):
        context=browser.new_context(viewport={'width':width,'height':900},reduced_motion='reduce')
        page=context.new_page();page.goto(BASE+'/',wait_until='networkidle')
        if width<850: page.locator('.landing-menu').click()
        if width>=850:
            nav=page.locator('#landing-navigation').bounding_box();actions=page.locator('.marketing-actions').bounding_box()
            assert nav['x']+nav['width']<=actions['x']+2, f'Navigation overlap {width}'
        page.locator('#landing-navigation a[href="/docs"]').click()
        page.wait_for_url('**/docs')
        checks.append({'route':'landing-to-docs','viewport':width,'status':'passed'})
        context.close()
    browser.close()
(OUT/'browser-checks.json').write_text(json.dumps({'base':BASE,'checks':checks},indent=2))
print(json.dumps({'base':BASE,'checks':checks},indent=2))
