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

  // Google Analytics 4 - eventos de conversion
  function trackGAEvent(eventName, destination, extraParams = {}) {
    if (typeof gtag === 'function') {
      gtag('event', eventName, {
        event_category: 'conversion',
        destination: destination,
        ...extraParams
      });
    }
  }

  // Meta Pixel - eventos de interacción
  function trackMetaEvent(eventName, params = {}) {
    if (typeof fbq === 'function') {
      fbq('trackCustom', eventName, params);
    }
  }

  // Gallery lightbox
  const galleryImages = Array.from(document.querySelectorAll('.lightbox-trigger'));
  const lightbox = document.getElementById('lightbox');
  const lightboxImage = document.getElementById('lightboxImage');
  const lightboxClose = document.getElementById('lightboxClose');
  const lightboxPrev = document.getElementById('lightboxPrev');
  const lightboxNext = document.getElementById('lightboxNext');

  if (galleryImages.length && lightbox && lightboxImage) {
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
  }

  // Sección interactiva: Descansá, recorré, volvé
  const discoverButtons = Array.from(document.querySelectorAll('.discover-pill'));
  const discoverImage = document.getElementById('discoverImage');
  const discoverKicker = document.getElementById('discoverKicker');
  const discoverTitle = document.getElementById('discoverTitle');
  const discoverLead = document.getElementById('discoverLead');
  const discoverList = document.getElementById('discoverList');
  const discoverNote = document.getElementById('discoverNote');
  const discoverCta = document.getElementById('discoverCta');

  const discoverContent = {
    victorica: {
      kicker: 'Muy cerca de Om Shanti',
      title: 'Paseo Victorica',
      lead: 'Una de las postales más lindas de Tigre, ideal para caminar frente al río, tomar algo y disfrutar el atardecer.',
      list: [
        'Recorrer la costanera y sacar fotos al río.',
        'Descubrir bares, cafés y restaurantes con vista.',
        'Pasar por clubes de remo y rincones clásicos de Tigre.',
        'Armar una salida relajada al caer la tarde.'
      ],
      note: 'Ideal si querés combinar descanso con una salida linda sin alejarte demasiado.',
      image: 'assets/paseo-victorica.png',
      alt: 'Paseo Victorica al atardecer en Tigre',
      whatsapp: 'Hola Om Shanti, me interesa una escapada para recorrer Paseo Victorica.'
    },
    delta: {
      kicker: 'Naturaleza y río',
      title: 'Río y Delta',
      lead: 'Tigre invita a vivir el agua de cerca: navegar, mirar el paisaje isleño y bajar un cambio.',
      list: [
        'Hacer una salida en lancha por los ríos del Delta.',
        'Conocer la vida isleña y sus paisajes naturales.',
        'Disfrutar del río en un plan tranquilo y distinto.',
        'Sumar una experiencia ideal para desconectar.'
      ],
      note: 'Perfecto para quienes quieren sentir el Delta desde adentro.',
      image: 'assets/rio-delta.png',
      alt: 'Río y Delta de Tigre',
      whatsapp: 'Hola Om Shanti, me interesa una escapada para disfrutar el río y el Delta.'
    },
    museos: {
      kicker: 'Cultura e historia local',
      title: 'Museos',
      lead: 'Si te gusta combinar paseo con cultura, en Tigre tenés museos muy lindos para visitar a pocos minutos.',
      list: [
        'Visitar el Museo de Arte Tigre (MAT).',
        'Recorrer el Museo Naval y otros espacios históricos.',
        'Conocer rincones con mucha identidad local.',
        'Armar una salida cultural durante la estadía.'
      ],
      note: 'Una propuesta ideal para sumar algo distinto a la escapada.',
      image: 'assets/museos.png',
      alt: 'Museos y escapadas culturales en Tigre',
      whatsapp: 'Hola Om Shanti, me interesa una escapada con paseo por museos en Tigre.'
    },
    gastronomia: {
      kicker: 'Sabores de Tigre',
      title: 'Gastronomía',
      lead: 'Desde meriendas frente al río hasta cenas relajadas, Tigre tiene opciones para comer rico y disfrutar sin apuro.',
      list: [
        'Salir a desayunar, merendar o cenar cerca del río.',
        'Elegir entre cafés, restaurantes y propuestas informales.',
        'Combinar un paseo con una parada gastronómica.',
        'Disfrutar planes simples que hacen especial la escapada.'
      ],
      note: 'Muy buena opción para escapadas de descanso o en pareja.',
      image: 'assets/gastronomia.png',
      alt: 'Gastronomía junto al río en Tigre',
      whatsapp: 'Hola Om Shanti, me interesa una escapada para disfrutar la gastronomía de Tigre.'
    },
    caminatas: {
      kicker: 'Salir a caminar y frenar un poco',
      title: 'Caminatas',
      lead: 'Hay recorridos ideales para caminar, respirar aire libre y disfrutar el ritmo tranquilo que tiene Tigre.',
      list: [
        'Caminar por zonas arboladas y costaneras.',
        'Recorrer sectores tranquilos cerca del río.',
        'Aprovechar el atardecer para una salida suave.',
        'Disfrutar un plan simple, relajado y al aire libre.'
      ],
      note: 'Excelente para quienes buscan una escapada tranquila y sin agenda cargada.',
      image: 'assets/caminatas.png',
      alt: 'Caminatas en Tigre al atardecer',
      whatsapp: 'Hola Om Shanti, me interesa una escapada con caminatas en Tigre.'
    },
    pareja: {
      kicker: 'Plan ideal para dos',
      title: 'Escapadas en pareja',
      lead: 'Om Shanti y Tigre se combinan muy bien para una salida en pareja: descanso, paseo y momentos simples para compartir.',
      list: [
        'Desayunar tranquilos y salir a recorrer sin apuro.',
        'Ver el atardecer, caminar y tomar algo juntos.',
        'Sumar una cena o una experiencia especial.',
        'Volver a la cabaña para seguir disfrutando el descanso.'
      ],
      note: 'Pensado para parejas que quieren frenar, reconectar y disfrutar el tiempo juntos.',
      image: 'assets/escapada-pareja.png',
      alt: 'Escapada romántica en Tigre',
      whatsapp: 'Hola Om Shanti, me interesa una escapada en pareja en Tigre.'
    }
  };

  function renderDiscover(key) {
    const item = discoverContent[key];
    if (!item || !discoverImage || !discoverTitle || !discoverLead || !discoverList || !discoverNote || !discoverCta || !discoverKicker) return;

    discoverImage.src = item.image;
    discoverImage.alt = item.alt;
    discoverKicker.textContent = item.kicker;
    discoverTitle.textContent = item.title;
    discoverLead.textContent = item.lead;
    discoverNote.textContent = item.note;
    discoverList.innerHTML = item.list.map(point => `<li>${point}</li>`).join('');
    discoverCta.href = `https://wa.me/5491168330289?text=${encodeURIComponent(item.whatsapp)}`;

    discoverButtons.forEach(button => {
      const isActive = button.dataset.discover === key;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  if (discoverButtons.length) {
    discoverButtons.forEach(button => {
      button.addEventListener('click', () => {
        const key = button.dataset.discover;
        renderDiscover(key);
        const label = button.textContent?.trim() || key;
        trackGAEvent('discover_tab_click', 'Interactive Section', { section_item: label });
        trackMetaEvent('DiscoverTabClick', { section: 'Descansá, recorré, volvé', item: label });
      });
    });

    renderDiscover('victorica');
  }

  document.querySelectorAll('a[href*="wa.me"]').forEach(link => {
    link.addEventListener('click', () => {
      // Mantiene el evento general de WhatsApp para comparar con el historial.
      trackGAEvent('whatsapp_click', 'WhatsApp');

      // Si el clic viene de una tarjeta de Experiencias, registra además
      // un evento específico para saber qué propuesta generó interés.
      const experience = link.dataset.experience;
      if (experience) {
        const experienceEvents = {
          'Spa': 'experience_spa_click',
          'Aventura': 'experience_aventura_click',
          'City Tour': 'experience_citytour_click'
        };
        const eventName = experienceEvents[experience];
        if (eventName) {
          trackGAEvent(eventName, `WhatsApp Catalog - ${experience}`);
        }
      }
    });
  });

  document.querySelectorAll('a[href*="alquilerargentina.com"]').forEach(link => {
    link.addEventListener('click', () => {
      trackGAEvent('booking_click', 'Alquiler Argentina');
    });
  });

  document.querySelectorAll('a[href*="instagram.com"]').forEach(link => {
    link.addEventListener('click', () => {
      trackGAEvent('instagram_click', 'Instagram');
    });
  });

  document.querySelectorAll('a[href*="wa.me"]').forEach(link => {
    link.addEventListener('click', () => {
      if (typeof fbq === 'function') {
        fbq('track', 'Contact', {channel: 'WhatsApp'});
      }
      trackMetaEvent('WhatsAppClick', {destination: 'WhatsApp'});

      const experience = link.dataset.experience;
      if (experience) {
        const metaEvents = {
          'Spa': 'ExperienceSpaClick',
          'Aventura': 'ExperienceAventuraClick',
          'City Tour': 'ExperienceCityTourClick'
        };
        const eventName = metaEvents[experience];
        if (eventName) {
          trackMetaEvent(eventName, {
            destination: 'WhatsApp Catalog',
            experience: experience
          });
        }
      }
    });
  });

  document.querySelectorAll('a[href*="alquilerargentina.com"]').forEach(link => {
    link.addEventListener('click', () => {
      if (typeof fbq === 'function') {
        fbq('track', 'InitiateCheckout', {destination: 'Alquiler Argentina'});
      }
      trackMetaEvent('BookingClick', {destination: 'Alquiler Argentina'});
    });
  });

  document.querySelectorAll('a[href*="instagram.com"]').forEach(link => {
    link.addEventListener('click', () => {
      trackMetaEvent('InstagramClick', {destination: 'Instagram'});
    });
  });

});
