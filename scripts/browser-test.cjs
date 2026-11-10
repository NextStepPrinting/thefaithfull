// Browser checks use a local server and never submit forms or contact third parties.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const port = Number(process.env.TEST_PORT || 8765);
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.env.PYTHON_PATH || 'python3', [path.join(root, 'scripts/serve.py'), '--port', String(port)], { stdio: 'ignore' });
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
      const available = await new Promise(resolve => {
        const request = http.get(origin, response => { response.resume(); resolve(response.statusCode === 200); });
        request.on('error', () => resolve(false));
        request.setTimeout(1000, () => { request.destroy(); resolve(false); });
      });
      if (available) { ready = true; break; }
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
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(root, 'test-results', `subscribe-${width}.png`), fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: signup horizontal overflow`);
      assert(await page.locator('.subscription-logo').evaluate(image => image.complete && image.naturalWidth > 0));
      const email = page.getByRole('textbox', { name: 'Email address', exact: true });
      await page.getByRole('button', { name: 'Subscribe', exact: true }).click();
      assert(await email.evaluate(input => input.validity.valueMissing), 'Email is required');
      await email.fill('invalid');
      assert(await email.evaluate(input => input.validity.typeMismatch), 'Email format is validated');
      await email.fill('signup-check@example.com');
      await page.route('https://thefaithfullpjtribute.us20.list-manage.com/**', async route => {
        assert.equal(route.request().method(), 'POST');
        const data = new URLSearchParams(route.request().postData());
        assert.equal(data.get('MERGE0'), 'signup-check@example.com');
        assert.equal(data.get('u'), '8011db6d702b768de88ff9e14');
        assert.equal(data.get('id'), '27b646a88d');
        for (const field of ['b_name', 'b_email', 'b_comment']) assert.equal(data.get(field), '');
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Intercepted form submission: no subscription sent</title>' });
      });
      await Promise.all([
        page.waitForURL('https://thefaithfullpjtribute.us20.list-manage.com/subscribe/post'),
        page.getByRole('button', { name: 'Subscribe', exact: true }).click(),
      ]);
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
