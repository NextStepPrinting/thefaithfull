// Small, independent enhancements; links and the built event list work without JS.
const menu = document.querySelector('.mobile-menu');
const menuToggle = document.querySelector('.menu-toggle');
if (menu && menuToggle) {
  menuToggle.addEventListener('click', () => {
    menu.showModal();
    menuToggle.setAttribute('aria-expanded', 'true');
  });
  menu.querySelector('.menu-close').addEventListener('click', () => menu.close());
  menu.querySelectorAll('nav a').forEach(link => link.addEventListener('click', () => menu.close()));
  menu.addEventListener('close', () => menuToggle.setAttribute('aria-expanded', 'false'));
  matchMedia('(min-width: 993px)').addEventListener('change', event => {
    if (event.matches && menu.open) menu.close();
  });
}

const topLink = document.querySelector('.to-top');
if (topLink) {
  const updateTopLink = () => topLink.classList.toggle('visible', scrollY > 300);
  addEventListener('scroll', updateTopLink, { passive: true });
  updateTopLink();
}

// Native dialogs supply focus containment, Escape handling, and focus restoration.
const lightbox = document.querySelector('.lightbox');
const photos = [...document.querySelectorAll('[data-photo]')];
if (lightbox && photos.length) {
  const image = lightbox.querySelector('img');
  const caption = lightbox.querySelector('figcaption');
  let index = 0;
  function showPhoto(next) {
    index = (next + photos.length) % photos.length;
    image.src = photos[index].href;
    image.alt = photos[index].querySelector('img').alt;
    caption.textContent = `${index + 1} of ${photos.length}`;
  }
  photos.forEach((photo, position) => photo.addEventListener('click', event => {
    // Preserve opening the full image in a new tab via standard modifier clicks.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    showPhoto(position);
    lightbox.showModal();
  }));
  lightbox.querySelector('.lightbox-close').addEventListener('click', () => lightbox.close());
  lightbox.querySelector('.lightbox-prev').addEventListener('click', () => showPhoto(index - 1));
  lightbox.querySelector('.lightbox-next').addEventListener('click', () => showPhoto(index + 1));
  lightbox.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      showPhoto(index + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  lightbox.addEventListener('click', event => { if (event.target === lightbox) lightbox.close(); });
}

const videoDialog = document.querySelector('.video-dialog');
const videoLink = document.querySelector('[data-video]');
if (videoDialog && videoLink) {
  const frame = videoDialog.querySelector('.video-frame');
  videoLink.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const iframe = document.createElement('iframe');
    iframe.src = 'https://www.youtube.com/embed/61RIRzGXOCA?autoplay=1&rel=0';
    iframe.title = 'The Faithfull promotional video';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    frame.replaceChildren(iframe);
    videoDialog.showModal();
  });
  videoDialog.querySelector('.video-close').addEventListener('click', () => videoDialog.close());
  videoDialog.addEventListener('close', () => frame.replaceChildren());
  videoDialog.addEventListener('click', event => { if (event.target === videoDialog) videoDialog.close(); });
}

const audio = document.querySelector('#intro-audio');
if (audio) {
  const controls = document.querySelector('.audio-controls');
  const play = controls.querySelector('.audio-play');
  const seek = controls.querySelector('.audio-seek');
  const volume = controls.querySelector('.audio-volume');
  const mute = controls.querySelector('.audio-mute');
  const elapsed = controls.querySelector('.audio-time');
  const duration = controls.querySelector('.audio-duration');
  const format = seconds => Number.isFinite(seconds)
    ? `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
    : '00:00';
  const updatePlayback = () => {
    play.textContent = audio.paused ? '▶︎' : 'Ⅱ';
    play.classList.toggle('playing', !audio.paused);
    play.setAttribute('aria-label', audio.paused ? 'Play Go' : 'Pause Go');
  };
  const restoreNativeControls = () => {
    controls.hidden = true;
    audio.hidden = false;
    audio.controls = true;
  };
  play.addEventListener('click', async () => {
    if (!audio.paused) return audio.pause();
    try { await audio.play(); } catch { restoreNativeControls(); }
  });
  audio.addEventListener('play', updatePlayback);
  audio.addEventListener('pause', updatePlayback);
  audio.addEventListener('ended', updatePlayback);
  audio.addEventListener('error', restoreNativeControls);
  audio.addEventListener('loadedmetadata', () => { duration.value = format(audio.duration); });
  audio.addEventListener('timeupdate', () => {
    elapsed.value = format(audio.currentTime);
    seek.value = audio.duration ? audio.currentTime / audio.duration * 100 : 0;
  });
  seek.addEventListener('input', () => {
    if (Number.isFinite(audio.duration)) audio.currentTime = Number(seek.value) / 100 * audio.duration;
  });
  volume.addEventListener('input', () => { audio.volume = Number(volume.value); audio.muted = false; });
  mute.addEventListener('click', () => { audio.muted = !audio.muted; });
  audio.addEventListener('volumechange', () => {
    mute.textContent = audio.muted || audio.volume === 0 ? '◖×' : '◖))';
    mute.setAttribute('aria-label', audio.muted ? 'Unmute audio' : 'Mute audio');
    volume.value = audio.muted ? 0 : audio.volume;
  });
  audio.controls = false;
  audio.hidden = true;
  controls.hidden = false;
}
