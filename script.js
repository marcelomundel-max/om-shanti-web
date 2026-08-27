
document.addEventListener('DOMContentLoaded', () => {

  // Smooth scrolling for internal anchors
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const href = a.getAttribute('href');
      if (!href || href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Mobile menu
  const btn = document.querySelector('.menu-btn');
  const nav = document.querySelector('nav');

  btn?.addEventListener('click', () => {
    const isOpen = nav.classList.contains('mobile-open');

    if (isOpen) {
      nav.classList.remove('mobile-open');
      nav.removeAttribute('style');
    } else {
      nav.classList.add('mobile-open');
      nav.style.display = 'flex';
      nav.style.position = 'absolute';
      nav.style.top = '100%';
      nav.style.left = '0';
      nav.style.right = '0';
      nav.style.padding = '18px 5vw';
      nav.style.background = 'rgba(20,22,18,.96)';
      nav.style.flexDirection = 'column';
      nav.style.alignItems = 'flex-start';
    }
  });

  // Gallery lightbox
  const galleryImages = Array.from(document.querySelectorAll('.lightbox-trigger'));
  const lightbox = document.getElementById('lightbox');
  const lightboxImage = document.getElementById('lightboxImage');
  const lightboxClose = document.getElementById('lightboxClose');
  const lightboxPrev = document.getElementById('lightboxPrev');
  const lightboxNext = document.getElementById('lightboxNext');

  if (!galleryImages.length || !lightbox || !lightboxImage) return;

  let currentImageIndex = 0;

  function renderImage() {
    const img = galleryImages[currentImageIndex];
    lightboxImage.src = img.dataset.full || img.src;
    lightboxImage.alt = img.alt || '';
  }

  function openLightbox(index) {
    currentImageIndex = index;
    renderImage();
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    lightboxImage.src = '';
  }

  function showNext() {
    currentImageIndex = (currentImageIndex + 1) % galleryImages.length;
    renderImage();
  }

  function showPrev() {
    currentImageIndex = (currentImageIndex - 1 + galleryImages.length) % galleryImages.length;
    renderImage();
  }

  galleryImages.forEach((img, index) => {
    img.setAttribute('tabindex', '0');
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', `Abrir imagen: ${img.alt || 'foto de Om Shanti'}`);

    img.addEventListener('click', () => openLightbox(index));

    img.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox(index);
      }
    });
  });

  lightboxClose?.addEventListener('click', closeLightbox);
  lightboxNext?.addEventListener('click', showNext);
  lightboxPrev?.addEventListener('click', showPrev);

  lightbox.addEventListener('click', e => {
    if (e.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') showNext();
    if (e.key === 'ArrowLeft') showPrev();
  });

});
