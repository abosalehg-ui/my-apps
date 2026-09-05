/* Progressive enhancement only: every card, screenshot and feature list is
   already in the HTML. This file adds expand/collapse, filtering, the
   lightbox and the scroll reveal on top of a page that works without it. */
(() => {
    'use strict';

    /* ---------- Expandable feature lists ---------- */

    function setExpanded(btn, open) {
        btn.setAttribute('aria-expanded', String(open));
        const label = btn.querySelector('.btn-details-text');
        if (label) label.textContent = open ? 'إخفاء التفاصيل' : 'المزيد من التفاصيل';
    }

    function toggleFeatures(appId) {
        const featuresEl = document.getElementById(`features-${appId}`);
        if (!featuresEl) return;

        const willOpen = !featuresEl.classList.contains('active');

        document.querySelectorAll('.features-list.active').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.btn-details').forEach(btn => setExpanded(btn, false));

        if (!willOpen) return;

        featuresEl.classList.add('active');
        const btn = document.querySelector(`[aria-controls="features-${appId}"]`);
        if (btn) setExpanded(btn, true);
        setTimeout(() => featuresEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    }

    /* JS off leaves the lists open, so collapse them once we know JS runs. */
    document.querySelectorAll('.features-list').forEach(el => el.classList.add('js-collapsible'));
    document.querySelectorAll('.btn-details').forEach(btn => {
        btn.hidden = false;
        setExpanded(btn, false);
    });

    /* ---------- Category filter ---------- */

    const filters = document.querySelector('.filters');
    const emptyMsg = document.querySelector('.filter-empty');

    function applyFilter(category) {
        let shown = 0;
        document.querySelectorAll('.app-card').forEach(card => {
            const match = category === 'all' || card.dataset.category === category;
            card.hidden = !match;
            if (match) shown++;
        });
        if (emptyMsg) emptyMsg.hidden = shown > 0;
        filters.querySelectorAll('.filter-chip').forEach(chip => {
            chip.setAttribute('aria-pressed', String(chip.dataset.category === category));
        });
    }

    if (filters) {
        filters.hidden = false;
        filters.addEventListener('click', e => {
            const chip = e.target.closest('.filter-chip');
            if (chip) applyFilter(chip.dataset.category);
        });
    }

    /* ---------- Screenshot lightbox ---------- */

    const lightbox = document.getElementById('lightbox');
    const lightboxBody = lightbox ? lightbox.querySelector('.lightbox-body') : null;
    let lightboxImg = null;

    function ensureLightboxImg() {
        if (!lightboxImg && lightboxBody) {
            lightboxImg = document.createElement('img');
            lightboxBody.appendChild(lightboxImg);
        }
        return lightboxImg;
    }

    /* Cards load the small variant; the lightbox wants the large one. */
    const largeSrc = img => img.src.replace(/-(?:320|720)\.webp$/, '-1080.webp');

    function openLightbox(img) {
        if (!lightbox || !ensureLightboxImg()) return;
        lightboxImg.src = largeSrc(img);
        lightboxImg.alt = img.alt;
        /* showModal() traps focus and wires Esc for us. */
        if (typeof lightbox.showModal === 'function') lightbox.showModal();
        else lightbox.setAttribute('open', '');
    }

    function closeLightbox() {
        if (!lightbox) return;
        if (typeof lightbox.close === 'function') lightbox.close();
        else lightbox.removeAttribute('open');
    }

    if (lightbox) {
        lightbox.addEventListener('close', () => { if (lightboxImg) lightboxImg.remove(); lightboxImg = null; });
        /* Backdrop, image and close button all dismiss. */
        lightbox.addEventListener('click', closeLightbox);
    }

    /* ---------- Screenshots: open the lightbox, or show a placeholder ---------- */

    document.querySelectorAll('.screenshot').forEach(btn => {
        const img = btn.querySelector('img');
        if (!img) return;

        const showPlaceholder = () => {
            btn.disabled = true;
            btn.innerHTML = '<span class="screenshot-placeholder"><span aria-hidden="true">📱</span>الصورة غير متاحة</span>';
        };

        if (img.complete && img.naturalWidth === 0) {
            showPlaceholder();
            return;
        }
        img.addEventListener('error', showPlaceholder);
        btn.addEventListener('click', () => openLightbox(img));
    });

    /* ---------- Delegated clicks for the details buttons ---------- */

    document.addEventListener('click', e => {
        const btn = e.target.closest('.btn-details');
        if (!btn) return;
        const card = btn.closest('.app-card');
        if (card) toggleFeatures(card.dataset.app);
    });

    /* ---------- Smooth scroll for in-page links ---------- */

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#') {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    /* ---------- Reveal cards on scroll ---------- */

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (!entry.isIntersecting) return;
            setTimeout(() => entry.target.classList.add('visible'), index * 100);
            observer.unobserve(entry.target);
        });
    }, { root: null, rootMargin: '0px', threshold: 0.1 });

    document.querySelectorAll('.app-card').forEach(card => observer.observe(card));

    /* ---------- Footer year ---------- */

    const year = document.getElementById('copyright-year');
    if (year) year.textContent = new Date().getFullYear();
})();
