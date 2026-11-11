const signupForm = document.querySelector('.subscription-form');
const signupStatus = document.querySelector('.subscription-status');
const signupFallback = document.querySelector('.subscription-fallback');
const subscribeButton = signupForm.querySelector('button[type="submit"]');
const signupEndpoint = '/api/subscribe';
let widget;

function showSignupStatus(message, state = '') {
  signupStatus.dataset.state = state;
  signupStatus.textContent = message;
}

async function prepareVerification() {
  try {
    const response = await fetch(signupEndpoint, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return false;
    const { siteKey } = await response.json();
    if (!siteKey) return false;

    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    widget = window.turnstile.render('#signup-verification', {
      sitekey: siteKey,
      action: 'subscribe',
      appearance: 'interaction-only',
      size: 'flexible',
      'error-callback': () => {
        showSignupStatus('Verification is unavailable. Please try again or use the Mailchimp form.', 'error');
        signupFallback.hidden = false;
      },
    });
    return true;
  } catch {
    return false;
  }
}

const verificationReady = prepareVerification();

signupForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (subscribeButton.disabled) return;
  subscribeButton.disabled = true;
  signupFallback.hidden = true;
  showSignupStatus('Submitting…');
  let submitted = false;

  try {
    const ready = await Promise.race([
      verificationReady,
      new Promise(resolve => setTimeout(() => resolve(false), 10000)),
    ]);
    if (!ready) throw new Error('Signup unavailable');

    const token = window.turnstile.getResponse(widget);
    if (!token) {
      showSignupStatus('Complete the verification, then select Subscribe again.');
      return;
    }

    const fields = new FormData(signupForm);
    submitted = true;
    const response = await fetch(signupEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: fields.get('MERGE0'),
        token,
        trap: fields.get('b_name') || fields.get('b_email') || fields.get('b_comment'),
      }),
      signal: AbortSignal.timeout(18000),
    });
    const result = await response.json();
    if (response.ok && result.status === 'pending') {
      showSignupStatus('Check your inbox to confirm your subscription.', 'success');
      signupForm.reset();
    } else if (response.ok && result.status === 'subscribed') {
      showSignupStatus('You’re subscribed. Thanks for joining!', 'success');
      signupForm.reset();
    } else if (response.ok && result.status === 'handled') {
      showSignupStatus('This address has already been used. Check your inbox for a confirmation email, or use the Mailchimp form to manage your signup.');
      signupFallback.hidden = false;
    } else if (result.error === 'email') {
      showSignupStatus('Enter a valid email address and try again.', 'error');
      signupForm.querySelector('#signup-email').focus();
    } else if (result.error === 'verification') {
      showSignupStatus('Verification expired. Please try again.', 'error');
    } else {
      throw new Error('Signup unavailable');
    }
  } catch {
    showSignupStatus('We couldn’t complete your signup. Please try again or use the Mailchimp form.', 'error');
    signupFallback.hidden = false;
  } finally {
    subscribeButton.disabled = false;
    if (submitted) window.turnstile.reset(widget);
  }
});
