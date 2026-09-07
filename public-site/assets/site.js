document.documentElement.classList.add('js');

const header = document.querySelector('.site-header');
const toggle = document.querySelector('.nav-toggle');
const links = document.querySelector('.nav-links');

if (header) {
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

if (toggle && links) {
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}
