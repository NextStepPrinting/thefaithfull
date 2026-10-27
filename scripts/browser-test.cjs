// Browser checks use a local server and never submit forms or contact third parties.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const port = 8765;
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn('python3', [path.join(root, 'scripts/serve.py'), '--port', String(port)], { stdio: 'ignore' });
  let browser;
  let serverError;
  server.on('error', error => { serverError = error; });
  const report = [];
  const eventCount = JSON.parse(readFileSync(path.join(root, 'public/data/events.json'), 'utf8')).length;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (serverError) throw serverError;
      if (server.exitCode !== null) throw new Error(`Local test server exited: ${server.exitCode}`);
      try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(ready, 'Local test server did not start');
    const executablePath = process.env.BROWSER_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
    browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
    mkdirSync(path.join(root, 'test-results'), { recursive: true });
    for (const width of [1440, 1024, 768, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: width >= 1024 ? 1000 : 844 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('response', response => { if (response.url().startsWith(origin) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      await page.goto(origin, { waitUntil: 'networkidle' });
      await page.evaluate(async () => {
        document.querySelectorAll('img').forEach(image => { image.loading = 'eager'; });
        await Promise.all([...document.querySelectorAll('img[src]')].map(image => image.decode()));
        await document.fonts.ready;
      });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: horizontal overflow`);
      assert.equal(await page.locator('.event').count(), eventCount);
      assert.equal(await page.locator('[data-photo]').count(), 18);
      assert(await page.evaluate(() => [...document.querySelectorAll('img[src]')].every(image => image.complete && image.naturalWidth > 0)), 'All images must decode');
      assert(await page.evaluate(() => document.fonts.check('26px Dosis') && document.fonts.check('14px "Playfair Display"')), 'Local fonts must load');
      const columns = await page.locator('.photo-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
      assert.equal(columns, width <= 480 ? 1 : width <= 992 ? 2 : 6, `${width}: gallery columns`);

      if (width <= 992) {
        await page.getByRole('button', { name: 'Open navigation' }).click();
        assert(await page.locator('#mobile-menu').evaluate(element => element.open));
        assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
        await page.locator('#mobile-menu nav').getByRole('link', { name: 'Events', exact: true }).click();
        assert.equal(new URL(page.url()).hash, '#tour-dates');
        assert(!await page.locator('#mobile-menu').evaluate(element => element.open));
        await page.waitForFunction(() => document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'false');
        await page.getByRole('button', { name: 'Open navigation' }).click();
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'false');
        assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
      } else {
        await page.locator('.desktop-nav').getByRole('link', { name: 'Events', exact: true }).click();
        assert.equal(new URL(page.url()).hash, '#tour-dates');
      }
      await page.locator('[data-photo]').first().click();
      assert(await page.locator('.lightbox').evaluate(element => element.open));
      await page.getByRole('button', { name: 'Next photo' }).click();
      assert.equal(await page.locator('.lightbox figcaption').textContent(), '2 of 18');
      await page.keyboard.press('ArrowLeft');
      assert.equal(await page.locator('.lightbox figcaption').textContent(), '1 of 18');
      await page.keyboard.press('Escape');
      assert(!await page.locator('.lightbox').evaluate(element => element.open));

      await page.locator('#intro').scrollIntoViewIfNeeded();
      if (width === 1440) {
        await page.getByRole('button', { name: 'Play Go', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('audio').currentTime > 0.2, { timeout: 15000 });
        assert(await page.locator('audio').evaluate(element => element.duration > 60));
        await page.getByRole('button', { name: 'Pause Go' }).click();
        await page.getByRole('button', { name: 'Mute audio', exact: true }).click();
        assert(await page.locator('audio').evaluate(element => element.muted));
        await page.locator('.audio-seek').fill('50');
        await page.waitForFunction(() => {
          const audio = document.querySelector('audio');
          return Math.abs(audio.currentTime / audio.duration - 0.5) < 0.02;
        });
      }
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({ path: path.join(root, 'test-results', `home-${width}.png`), fullPage: true });
      assert.deepEqual(errors, [], `${width}: browser errors`);
      report.push({ width, status: 'passed', checks: ['images', 'fonts', 'no overflow', 'event list', 'navigation', 'gallery lightbox', 'console'], audioPlayback: width === 1440 ? 'passed' : 'not repeated' });
      // Verify embed wiring separately; the external video service is not mocked as working.
      await page.route('https://www.youtube.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Embed URL inspection only</title>' }));
      await page.locator('[data-video]').click();
      assert.equal(await page.locator('.video-frame iframe').getAttribute('src'), 'https://www.youtube.com/embed/61RIRzGXOCA?autoplay=1&rel=0');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelector('.video-frame').childElementCount === 0);
      assert.equal(await page.locator('.video-frame iframe').count(), 0, 'Closing video must unload playback');
      await page.goto(`${origin}/subscribe/`);
      assert(await page.getByRole('heading', { name: 'JOIN OUR MAILING LIST' }).isVisible());
      await page.close();
      console.log(`PASS ${width}px: responsive layout, navigation, images, lightbox, console; embed wiring (external playback untested).`);
    }
    const noJS = await browser.newPage({ javaScriptEnabled: false });
    await noJS.goto(origin);
    assert.equal(await noJS.locator('.event').count(), eventCount);
    assert(await noJS.locator('audio[controls]').isVisible());
    await noJS.close();
    writeFileSync(path.join(root, 'test-results', 'browser-results.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('PASS: event content and native audio remain available without JavaScript.');
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
