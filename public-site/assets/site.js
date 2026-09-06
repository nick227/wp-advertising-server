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

const monthlyBtn = document.querySelector('[data-billing="monthly"]');
const annualBtn = document.querySelector('[data-billing="annual"]');
const amountEls = document.querySelectorAll('[data-price-amount]');

function setBilling(mode) {
  if (!monthlyBtn || !annualBtn) return;
  monthlyBtn.setAttribute('aria-pressed', mode === 'monthly' ? 'true' : 'false');
  annualBtn.setAttribute('aria-pressed', mode === 'annual' ? 'true' : 'false');
  amountEls.forEach((el) => {
    el.textContent = mode === 'annual' ? el.getAttribute('data-annual') : el.getAttribute('data-monthly');
  });
}

monthlyBtn?.addEventListener('click', () => setBilling('monthly'));
annualBtn?.addEventListener('click', () => setBilling('annual'));
