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
  const startingEvents = JSON.parse(readFileSync(path.join(root, 'public/data/events.json'), 'utf8'));
  const { todayInZone } = await import('../public/scripts/events-core.js');
  const upcomingCount = startingEvents.filter(show => show.date >= todayInZone()).length;
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
      let savedSchedule = null;
      await page.route(`${origin}/api/events**`, async route => {
        const request = route.request();
        if (request.method() === 'PUT') {
          assert.equal(request.headers().authorization, 'Bearer browser-test-key');
          savedSchedule = request.postDataJSON();
          return route.fulfill({ json: { revision: 1 } });
        }
        const admin = new URL(request.url()).searchParams.has('admin');
        if (admin) assert.equal(request.headers().authorization, 'Bearer browser-test-key');
        const events = savedSchedule?.events.filter(show => show.status === 'confirmed') ?? null;
        await route.fulfill({ json: { events, venues: null, revision: 0 } });
      });
      await page.goto(origin, { waitUntil: 'networkidle' });
      await page.evaluate(async () => {
        document.querySelectorAll('img').forEach(image => { image.loading = 'eager'; });
        await Promise.all([...document.querySelectorAll('img[src]')].map(image => image.decode()));
        await document.fonts.ready;
      });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: horizontal overflow`);
      assert.equal(await page.locator('.event').count(), upcomingCount);
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
      await page.route(`${origin}/api/subscribe`, route => route.fulfill({ json: { siteKey: null } }));
      await page.getByRole('link', { name: 'Subscribe', exact: true }).click();
      await page.waitForURL(`${origin}/subscribe/`);
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
      await page.getByRole('button', { name: 'Subscribe', exact: true }).click();
      await page.getByRole('link', { name: 'Open the Mailchimp signup form' }).waitFor();
      assert.equal(page.url(), `${origin}/subscribe/`, 'Unavailable service must not redirect');

      await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?*', route => route.fulfill({
        contentType: 'application/javascript',
        body: 'window.turnstile = { render: () => "test-widget", getResponse: () => "test-token", reset() {} };',
      }));
      let status = 502;
      await page.route(`${origin}/api/subscribe`, route => {
        if (route.request().method() === 'GET') return route.fulfill({ json: { siteKey: 'test-key' } });
        assert.deepEqual(route.request().postDataJSON(), {
          email: 'signup-check@example.com', token: 'test-token', trap: '',
        });
        return route.fulfill({ status, json: status === 200 ? { status: 'subscribed' } : { error: 'unavailable' } });
      });
      await page.reload();
      await email.fill('signup-check@example.com');
      const subscribe = page.getByRole('button', { name: 'Subscribe', exact: true });
      await subscribe.click();
      await page.getByRole('status').filter({ hasText: 'We couldn’t complete your signup' }).waitFor();
      assert.equal(await email.inputValue(), 'signup-check@example.com', 'Keep email on error');
      status = 200;
      await subscribe.click();
      await page.getByRole('status').filter({ hasText: 'You’re subscribed. Thanks for joining!' }).waitFor();
      assert.equal(await email.inputValue(), '', 'Clear email after accepted signup');
      assert.equal(page.url(), `${origin}/subscribe/`, 'Accepted signup must stay on the page');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(root, 'test-results', `subscribe-confirmation-${width}.png`), fullPage: true });
      await page.getByRole('link', { name: 'Back to home' }).click();
      await page.waitForURL(`${origin}/`);
      errors.length = 0; // The signup test above intentionally received a 502.
      await page.goto(`${origin}/admin/`);
      await page.getByLabel('Manager sign-in key').fill('browser-test-key');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.getByText('Starting schedule loaded.', { exact: false }).waitFor();
      await page.locator('#past-shows').evaluate(details => { details.open = true; });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: manager horizontal overflow`);
      await page.screenshot({ path: path.join(root, 'test-results', `show-manager-${width}.png`), fullPage: true });
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: 'Save schedule', exact: true }).click();
      await page.getByText('Schedule and venues saved.', { exact: false }).waitFor();
      assert.equal(savedSchedule.events.length, startingEvents.length);
      assert.deepEqual(savedSchedule.events.map(({ date, venue, city, tickets_url }) => ({
        date, venue, location: city, url: tickets_url
      })), startingEvents, 'First save must preserve the existing shows and order');
      savedSchedule.events.push({ date: todayInZone(), venue: 'Test venue <safe text>', city: 'Test city', status: 'confirmed',
        map_url: 'https://example.com/map', tickets_url: 'https://example.com/tickets' });
      savedSchedule.events.push({ date: '2000-01-01', venue: 'Old test venue', city: 'Test city', status: 'confirmed' });
      savedSchedule.events.forEach((show, index) => { if (index < startingEvents.length) show.status = 'draft'; });
      await page.goto(origin);
      await page.getByRole('heading', { name: 'Test venue <safe text>' }).waitFor();
      assert.equal(await page.locator('.event').count(), 1);
      const directions = page.getByRole('link', { name: 'Test city — directions (opens in a new tab)' });
      assert.equal(await directions.getAttribute('href'), 'https://example.com/map');
      assert.equal(await page.locator('.event .ticket').count(), 1);
      assert.deepEqual(errors, [], `${width}: browser errors`);
      await page.close();
      console.log(`PASS ${width}px: responsive layout, navigation, images, lightbox, console; embed wiring (external playback untested).`);
    }
    const noJS = await browser.newPage({ javaScriptEnabled: false });
    await noJS.goto(origin);
    assert.equal(await noJS.locator('.event').count(), upcomingCount);
    assert(await noJS.locator('audio[controls]').isVisible());
    await noJS.close();
    writeFileSync(path.join(root, 'test-results', 'browser-results.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('PASS: event content and native audio remain available without JavaScript.');
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
