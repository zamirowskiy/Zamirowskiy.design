/* ============================================================
   Роман Замировский — портфолио
   Vanilla JS, без библиотек. Всё анимируется через transform/opacity,
   скролл-эффекты крутятся в одном общем requestAnimationFrame.
   ============================================================ */
(function () {
  'use strict';

  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var REDUCED = motionQuery.matches;
  motionQuery.addEventListener('change', function (e) { REDUCED = e.matches; });

  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var clamp = function (v, min, max) { return Math.min(max, Math.max(min, v)); };

  /* ==========================================================
     1. ПРЕЛОАДЕР
     ========================================================== */
  function initPreloader() {
    var el = $('#preloader');
    var countEl = $('#preloaderCount');
    var barEl = $('#preloaderBar');
    if (!el) return;

    var shown = 0;
    var target = 0;
    var loaded = false;
    var done = false;
    var raf;

    window.addEventListener('load', function () { loaded = true; });
    // страховка: не держим посетителя, даже если картинка зависла
    setTimeout(function () { loaded = true; }, 4000);

    function finish() {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      el.classList.add('is-done');
      document.body.classList.remove('is-locked');
      setTimeout(function () { if (el.parentNode) el.remove(); }, 1000);
      document.dispatchEvent(new CustomEvent('preloader:done'));
    }

    // Жёсткий предохранитель на setTimeout: если вкладку открыли в фоне,
    // requestAnimationFrame не тикает и счётчик встаёт — страница осталась бы
    // заблокированной. Таймер работает и в фоне, поэтому доводит дело до конца.
    setTimeout(finish, 5500);

    if (REDUCED) { finish(); return; }

    function tick() {
      target = loaded ? 100 : Math.min(target + Math.random() * 6, 92);
      shown = lerp(shown, target, .12);
      var v = Math.round(shown);
      countEl.textContent = v;
      barEl.style.width = v + '%';
      if (loaded && v >= 100) { finish(); return; }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
  }

  /* ==========================================================
     2. КУРСОР + МАГНИТНЫЕ ЭЛЕМЕНТЫ
     ========================================================== */
  function initCursor() {
    var cursor = $('#cursor');
    if (!cursor || REDUCED) return;
    if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return;

    var dot = $('.cursor__dot', cursor);
    var ring = $('.cursor__ring', cursor);
    var mx = window.innerWidth / 2, my = window.innerHeight / 2;
    var rx = mx, ry = my;

    document.addEventListener('pointermove', function (e) {
      mx = e.clientX; my = e.clientY;
      cursor.classList.add('is-on');
    }, { passive: true });

    document.addEventListener('pointerdown', function () { cursor.classList.add('is-down'); });
    document.addEventListener('pointerup', function () { cursor.classList.remove('is-down'); });
    document.addEventListener('mouseleave', function () { cursor.classList.remove('is-on'); });

    // тип курсора зависит от того, над чем он находится
    document.addEventListener('pointerover', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      cursor.classList.toggle('is-view', !!t.closest('.work-card'));
      cursor.classList.toggle('is-hover',
        !t.closest('.work-card') && !!t.closest('a, button, [data-magnetic]'));
    });

    (function loop() {
      dot.style.transform = 'translate(' + mx + 'px,' + my + 'px) translate(-50%,-50%)';
      rx = lerp(rx, mx, .17);
      ry = lerp(ry, my, .17);
      ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px) translate(-50%,-50%)';
      requestAnimationFrame(loop);
    })();
  }

  function initMagnetic() {
    if (REDUCED) return;
    if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return;

    $$('[data-magnetic]').forEach(function (el) {
      var raf = null, tx = 0, ty = 0, cx = 0, cy = 0;

      function animate() {
        cx = lerp(cx, tx, .18);
        cy = lerp(cy, ty, .18);
        el.style.transform = 'translate(' + cx.toFixed(2) + 'px,' + cy.toFixed(2) + 'px)';
        if (Math.abs(cx - tx) > .1 || Math.abs(cy - ty) > .1) {
          raf = requestAnimationFrame(animate);
        } else {
          el.style.transform = tx === 0 && ty === 0 ? '' : el.style.transform;
          raf = null;
        }
      }
      function kick() { if (raf === null) raf = requestAnimationFrame(animate); }

      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        tx = (e.clientX - (r.left + r.width / 2)) * .28;
        ty = (e.clientY - (r.top + r.height / 2)) * .38;
        kick();
      });
      el.addEventListener('pointerleave', function () { tx = 0; ty = 0; kick(); });
    });
  }

  /* ==========================================================
     3. ПОЯВЛЕНИЕ: разбивка заголовков + IntersectionObserver
     ========================================================== */
  function splitWords(el) {
    if (el.dataset.splitDone) return;
    var words = el.textContent.trim().split(/([ \t\n\r]+)/);
    var frag = document.createDocumentFragment();
    var i = 0;

    words.forEach(function (w) {
      if (!w.trim()) { frag.appendChild(document.createTextNode(' ')); return; }
      var outer = document.createElement('span');
      outer.className = 'split__word';
      var inner = document.createElement('span');
      inner.textContent = w;
      inner.style.setProperty('--d', (i * 55) + 'ms');
      outer.appendChild(inner);
      frag.appendChild(outer);
      i++;
    });

    el.textContent = '';
    el.appendChild(frag);
    el.dataset.splitDone = '1';
  }

  function initReveal() {
    var splits = $$('[data-split]');
    if (!REDUCED) splits.forEach(splitWords);

    var targets = $$('[data-reveal]').concat(splits);
    if (!targets.length) return;

    if (REDUCED || !('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    // соседние элементы внутри одной группы появляются каскадом
    var groups = new Map();
    $$('[data-reveal]').forEach(function (el) {
      var parent = el.parentElement;
      if (!groups.has(parent)) groups.set(parent, 0);
      var n = groups.get(parent);
      el.style.setProperty('--d', Math.min(n, 6) * 80 + 'ms');
      groups.set(parent, n + 1);
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: .12, rootMargin: '0px 0px -8% 0px' });

    targets.forEach(function (el) { io.observe(el); });
  }

  /* ==========================================================
     4. КОНТЕНТ из data/content.js: тексты, логотип, списки
     ========================================================== */
  var CONTENT = window.CONTENT || {};
  var SITE = CONTENT.site || {};
  var CATS = CONTENT.categories || [];
  var PROJECTS = (CONTENT.projects || []).filter(function (p) { return !p.hidden; });

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // неразрывный пробел после коротких слов и перед тире —
  // чтобы «в», «и», «на» не висели в конце строки
  function typo(str) {
    var s = String(str == null ? '' : str);
    for (var i = 0; i < 2; i++) {
      s = s.replace(/(^|[\s («"])([а-яёa-z]{1,2})\s+/gi, '$1$2 ');
    }
    return s.replace(/\s+—\s/g, ' — ');
  }

  function get(path) {
    return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, SITE);
  }

  function applyContent() {
    if (!CONTENT.site) return;

    // тексты по ключам data-t="раздел.поле"
    $$('[data-t]').forEach(function (el) {
      var v = get(el.dataset.t);
      if (typeof v === 'string' && v.trim()) el.textContent = typo(v);
    });

    if (SITE.meta) {
      if (SITE.meta.title) document.title = SITE.meta.title;
      var d = $('meta[name="description"]');
      if (d && SITE.meta.description) d.setAttribute('content', SITE.meta.description);
    }

    var assets = SITE.assets || {};
    if (assets.logo) $$('.js-logo').forEach(function (img) { img.src = assets.logo; });
    if (assets.photo) {
      var ph = $('#aboutPhoto img');
      if (ph) ph.src = assets.photo;
    }

    var w = SITE.work || {};
    var search = $('#workSearch');
    if (search && w.search) { search.placeholder = w.search; search.setAttribute('aria-label', w.search); }

    // бегущая строка: две одинаковые группы для бесшовной петли
    if (SITE.marquee && SITE.marquee.length && $('#marqueeTrack')) {
      var group = '<div class="marquee__group">' + SITE.marquee.filter(Boolean).map(function (m) {
        return '<span>' + esc(m) + '</span><i>✳</i>';
      }).join('') + '</div>';
      $('#marqueeTrack').innerHTML = group + group;
    }

    var a = SITE.about || {};
    if (a.paragraphs && $('#aboutParagraphs')) {
      $('#aboutParagraphs').innerHTML = a.paragraphs.filter(Boolean).map(function (p) {
        return '<p class="about__p" data-reveal>' + esc(typo(p)) + '</p>';
      }).join('');
    }
    if (a.facts && $('#aboutFacts')) {
      var facts = a.facts.filter(function (f) { return f && (f.title || f.text); });
      $('#aboutFacts').innerHTML = facts.map(function (f) {
        return '<li><b>' + esc(typo(f.title)) + '</b><span>' + esc(typo(f.text)) + '</span></li>';
      }).join('');
      $('#aboutFacts').hidden = !facts.length;
    }

    var pr = SITE.process || {};
    if (pr.steps && $('#processList')) {
      $('#processList').innerHTML = pr.steps.filter(function (s) { return s && s.title; }).map(function (s, i) {
        return '<li class="process__item" data-reveal>' +
          '<span class="process__num">' + (i < 9 ? '0' : '') + (i + 1) + '</span>' +
          '<h3 class="h-md">' + esc(typo(s.title)) + '</h3>' +
          '<p>' + esc(typo(s.text)) + '</p></li>';
      }).join('');
    }

    var c = SITE.contact || {};
    if (c.links && $('#contactLinks')) {
      // без ссылки или подписи контакт не показываем — это недозаполненная строка
      $('#contactLinks').innerHTML = c.links.filter(function (l) { return l && l.url && (l.label || l.value); }).map(function (l) {
        var ext = /^https?:/i.test(l.url) ? ' target="_blank" rel="noopener"' : '';
        return '<li data-reveal><a href="' + esc(l.url) + '"' + ext + ' data-magnetic>' +
          '<span class="contact__label">' + esc(l.label) + '</span>' +
          '<span class="contact__value">' + esc(l.value) + '</span>' +
          '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>' +
          '</a></li>';
      }).join('');
    }

    // подвал: разделы портфолио + якоря
    var fnav = $('#footerNav');
    if (fnav) {
      var nav = SITE.nav || {};
      fnav.innerHTML = usedCats().map(function (cat) {
        return '<a href="#' + esc(cat.id) + '" data-filter-link="' + esc(cat.id) + '">' + esc(cat.name) + '</a>';
      }).join('') +
        '<a href="#about">' + esc(nav.about || 'Обо мне') + '</a>' +
        '<a href="#contact">' + esc(nav.contact || 'Контакты') + '</a>';
    }
  }

  /* ==========================================================
     5. РАБОТЫ: разделы + поиск + сетка карточек
     ========================================================== */
  function catName(id) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i].name;
    return '';
  }

  function catNames(p) {
    // в порядке разделов, как в верхней строке
    return CATS.filter(function (c) { return (p.cats || []).indexOf(c.id) !== -1; })
      .map(function (c) { return c.name; });
  }

  function countIn(id) {
    return PROJECTS.filter(function (p) { return (p.cats || []).indexOf(id) !== -1; }).length;
  }

  // пустые разделы в верхнюю строку не попадают
  function usedCats() {
    return CATS.filter(function (c) { return countIn(c.id) > 0; });
  }

  function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }

  function haystack(p) {
    return norm([p.title, p.client, p.year, p.text].concat(p.tags || [], catNames(p)).join(' '));
  }

  function mockupWord(n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'макет';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'макета';
    return 'макетов';
  }

  var setSearch = function () {};

  function initWork() {
    var grid = $('#workGrid');
    var filter = $('#workFilter');
    var search = $('#workSearch');
    var empty = $('#workEmpty');
    if (!grid) return;

    /* --- карточки --- */
    grid.innerHTML = PROJECTS.map(function (p, i) {
      var cats = catNames(p).map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('');
      var tags = (p.tags || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
      var imgs = p.images || [];
      return '' +
        '<a class="work-card" href="#work" data-index="' + i + '"' +
        ' aria-label="' + esc(p.title + (cats ? ' — ' + catNames(p).join(', ') : '')) + '">' +
          '<div class="work-card__media">' +
            // обложка: своя картинка, если задана, иначе первая из галереи
            ((p.cover || imgs[0]) ? '<img src="' + esc(p.cover || imgs[0]) + '" alt="' + esc(p.title) + '"' +
              (p.focus ? ' style="object-position:' + esc(p.focus) + '"' : '') +
              ' loading="lazy" decoding="async" draggable="false">' : '') +
            (cats ? '<span class="work-card__cats">' + cats + '</span>' : '') +
            (imgs.length > 1 ? '<span class="work-card__count">' + imgs.length + ' ' + mockupWord(imgs.length) + '</span>' : '') +
          '</div>' +
          '<div class="work-card__body">' +
            '<div class="work-card__head">' +
              '<h3 class="work-card__title">' + esc(typo(p.title)) + '</h3>' +
              (p.year ? '<span class="work-card__year">' + esc(p.year) + '</span>' : '') +
            '</div>' +
            (p.client ? '<p class="work-card__client">' + esc(typo(p.client)) + '</p>' : '') +
            '<ul class="work-card__tags">' + tags + '</ul>' +
          '</div>' +
        '</a>';
    }).join('');

    var cards = $$('.work-card', grid);
    var hays = PROJECTS.map(haystack);

    /* --- кнопки разделов со счётчиками --- */
    var cats = usedCats();
    var keys = ['all'].concat(cats.map(function (c) { return c.id; }));
    if (filter) {
      filter.innerHTML = '<button class="filter__btn" type="button" role="tab" data-filter="all" aria-selected="true">' +
        esc((SITE.work && SITE.work.all) || 'Все работы') + '<sup>' + PROJECTS.length + '</sup></button>' +
        cats.map(function (c) {
          return '<button class="filter__btn" type="button" role="tab" data-filter="' + esc(c.id) + '"' +
            ' aria-selected="false">' + esc(c.name) + '<sup>' + countIn(c.id) + '</sup></button>';
        }).join('');
    }

    var current = 'all';
    var query = '';

    function render(animate) {
      if (filter) {
        $$('.filter__btn', filter).forEach(function (b) {
          b.setAttribute('aria-selected', b.dataset.filter === current ? 'true' : 'false');
        });
      }
      var words = norm(query).split(/\s+/).filter(Boolean);
      var shown = 0;
      cards.forEach(function (card, i) {
        var p = PROJECTS[i];
        var inCat = current === 'all' || (p.cats || []).indexOf(current) !== -1;
        var inSearch = words.every(function (w) { return hays[i].indexOf(w) !== -1; });
        var on = inCat && inSearch;
        card.hidden = !on;
        card.classList.remove('is-entering');
        if (on && animate && !REDUCED) {
          void card.offsetWidth;                         // перезапуск анимации
          card.style.setProperty('--d', Math.min(shown, 8) * 60 + 'ms');
          card.classList.add('is-entering');
        }
        if (on) shown++;
      });
      if (empty) empty.hidden = shown > 0;
    }

    function setFilter(key, animate) {
      current = keys.indexOf(key) === -1 ? 'all' : key;
      render(animate);
    }

    setSearch = function (q) {
      query = q;
      if (search && search.value !== q) search.value = q;
      render(true);
    };

    function remember(key) {
      try { history.replaceState(null, '', key === 'all' ? '#work' : '#' + key); } catch (err) {}
    }

    if (filter) {
      filter.addEventListener('click', function (e) {
        var btn = e.target.closest('.filter__btn');
        if (!btn || btn.dataset.filter === current) return;
        setFilter(btn.dataset.filter, true);
        remember(btn.dataset.filter);
      });
      // стрелки между вкладками
      filter.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        var btns = $$('.filter__btn', filter);
        var i = btns.indexOf(document.activeElement);
        if (i === -1) return;
        var next = btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length];
        next.focus();
        next.click();
      });
    }

    if (search) {
      var t;
      search.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () { query = search.value; render(true); }, 120);
      });
      search.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && search.value) { e.stopPropagation(); setSearch(''); }
      });
    }

    // ссылки на разделы в подвале
    $$('[data-filter-link]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        setFilter(a.dataset.filterLink, true);
        remember(a.dataset.filterLink);
        $('#work').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
      });
    });

    // прямая ссылка на раздел: site.ru/#logo, #web …
    var hash = decodeURIComponent(location.hash.slice(1));
    var byHash = keys.indexOf(hash) > 0;
    setFilter(byHash ? hash : 'all', false);
    if (byHash) {
      document.addEventListener('preloader:done', function () { $('#work').scrollIntoView(); });
    }

    /* --- клик по карточке открывает галерею --- */
    grid.addEventListener('click', function (e) {
      var card = e.target.closest('.work-card');
      if (!card) return;
      e.preventDefault();
      openLightbox(PROJECTS[+card.dataset.index]);
    });
  }

  /* ==========================================================
     6. ГАЛЕРЕЯ ПРОЕКТА
     ========================================================== */
  var lastFocused = null;
  var lb = { project: null, index: 0, scroll: null };

  var TALL_RATIO = 1.6;      // выше этого отношения высоты к ширине — прокручиваем
  var SCROLL_SPEED = 260;    // px в секунду

  function stopAutoScroll() {
    if (lb.scroll) cancelAnimationFrame(lb.scroll.raf);
    lb.scroll = null;
  }

  // плавно ведём длинный скриншот сверху вниз; таймер слайда ждёт конца прокрутки
  function startTall(view, strip) {
    view.classList.add('is-tall');
    view.scrollTop = 0;
    var dist = view.scrollHeight - view.clientHeight;
    if (dist < 40 || REDUCED) return;

    var delay = 800;
    var duration = Math.min(25000, Math.max(5000, dist / SCROLL_SPEED * 1000));
    strip.style.setProperty('--slide-dur', Math.round(delay + duration + 1500) + 'ms');
    if (strip.classList.contains('is-playing')) {
      strip.classList.remove('is-playing');
      void strip.offsetWidth;
      strip.classList.add('is-playing');
    }

    var t0 = performance.now() + delay;
    var state = { raf: 0 };
    lb.scroll = state;
    (function tick(now) {
      if (lb.scroll !== state) return;
      var k = Math.min(1, Math.max(0, (now - t0) / duration));
      var e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // easeInOut
      view.scrollTop = dist * e;
      if (k < 1) state.raf = requestAnimationFrame(tick);
      else lb.scroll = null;
    })(performance.now());
  }

  function showImage(i) {
    var p = lb.project;
    if (!p) return;
    var imgs = p.images || [];
    var total = imgs.length || 1;
    lb.index = (i + total) % total;

    var el = $('#lightboxImg');
    var view = $('#lightboxView');
    var strip = $('#lightboxThumbs');
    var shown = lb.index;
    stopAutoScroll();
    view.classList.remove('is-tall');
    view.scrollTop = 0;
    strip.style.removeProperty('--slide-dur');
    strip.classList.remove('is-paused');
    el.classList.add('is-loading');
    el.onload = function () {
      el.classList.remove('is-loading');
      if (lb.project !== p || lb.index !== shown) return;
      if (el.naturalHeight / el.naturalWidth > TALL_RATIO) startTall(view, strip);
    };
    el.src = imgs[lb.index] || '';
    el.alt = p.title + ' — макет ' + (lb.index + 1) + ' из ' + total;

    $('#lightboxCount').textContent = (lb.index + 1) + ' / ' + total;
    var active = null;
    $$('button', strip).forEach(function (b, n) {
      b.setAttribute('aria-current', n === lb.index ? 'true' : 'false');
      if (n === lb.index) active = b;
    });

    // активная миниатюра — по центру ленты
    if (active) {
      strip.scrollLeft = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
    }

    // автолистание каждые 3 с: перезапускаем полоску-таймер на новом слайде.
    // При «уменьшить движение» не листаем сами.
    strip.classList.remove('is-playing');
    if (total > 1 && !REDUCED) {
      void strip.offsetWidth;
      strip.classList.add('is-playing');
    }

    // следующую картинку грузим заранее, чтобы листалось без пауз
    if (total > 1) { var pre = new Image(); pre.src = imgs[(lb.index + 1) % total]; }
  }

  function openLightbox(p) {
    var box = $('#lightbox');
    if (!box || !p) return;
    lastFocused = document.activeElement;
    lb.project = p;

    var imgs = p.images || [];
    var many = imgs.length > 1;
    $('#lightboxPrev').hidden = !many;
    $('#lightboxNext').hidden = !many;
    $('#lightboxCount').hidden = !many;

    $('#lightboxCat').textContent = catNames(p).join(' · ') + (p.year ? ' · ' + p.year : '');
    $('#lightboxTitle').textContent = typo(p.title);
    $('#lightboxClient').textContent = typo(p.client || '');
    $('#lightboxText').textContent = typo(p.text || '');
    // клик по тегу — поиск по нему
    $('#lightboxTags').innerHTML = (p.tags || []).map(function (t) {
      return '<li><button type="button" data-tag="' + esc(t) + '">' + esc(t) + '</button></li>';
    }).join('');

    $('#lightboxThumbs').innerHTML = many ? imgs.map(function (src, n) {
      return '<button type="button" data-i="' + n + '" aria-label="Макет ' + (n + 1) + '">' +
        '<img src="' + esc(src) + '" alt="" loading="lazy" decoding="async"></button>';
    }).join('') : '';

    showImage(0);

    box.hidden = false;
    document.body.classList.add('is-locked');
    requestAnimationFrame(function () { box.classList.add('is-open'); });
    $('#lightboxClose').focus();
  }

  function closeLightbox(keepFocus) {
    var box = $('#lightbox');
    if (!box || box.hidden) return;
    box.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    lb.project = null;
    stopAutoScroll();
    $('#lightboxThumbs').classList.remove('is-playing');
    setTimeout(function () { box.hidden = true; }, 400);
    if (!keepFocus && lastFocused && lastFocused.focus) lastFocused.focus({ preventScroll: true });
  }

  function initLightbox() {
    var box = $('#lightbox');
    if (!box) return;

    box.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { closeLightbox(); return; }
      var t = e.target.closest('#lightboxThumbs button');
      if (t) { showImage(+t.dataset.i); return; }
      var tag = e.target.closest('[data-tag]');
      if (tag) {
        closeLightbox(true);
        setSearch(tag.dataset.tag);
        $('#work').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
      }
    });
    // полоска-таймер на активной миниатюре доехала — следующий слайд
    $('#lightboxThumbs').addEventListener('animationend', function (e) {
      if (e.animationName === 'slideTimer' && lb.project) showImage(lb.index + 1);
    });

    // человек сам листает длинный скриншот — отдаём ему управление и держим слайд
    var view = $('#lightboxView');
    function takeOver() {
      if (!view.classList.contains('is-tall')) return;
      stopAutoScroll();
      $('#lightboxThumbs').classList.add('is-paused');
    }
    view.addEventListener('wheel', takeOver, { passive: true });
    view.addEventListener('touchstart', takeOver, { passive: true });
    view.addEventListener('pointerdown', takeOver);

    $('#lightboxPrev').addEventListener('click', function () { showImage(lb.index - 1); });
    $('#lightboxNext').addEventListener('click', function () { showImage(lb.index + 1); });

    document.addEventListener('keydown', function (e) {
      if (!lb.project) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft')  showImage(lb.index - 1);
      if (e.key === 'ArrowRight') showImage(lb.index + 1);
    });

    // свайп по картинке на телефоне
    var media = $('.lightbox__media', box);
    var sx = null, sy = 0;
    media.addEventListener('touchstart', function (e) {
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    media.addEventListener('touchend', function (e) {
      if (sx === null) return;
      var dx = e.changedTouches[0].clientX - sx;
      var dy = e.changedTouches[0].clientY - sy;
      sx = null;
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) showImage(lb.index + (dx < 0 ? 1 : -1));
    });
  }

  /* ==========================================================
     7. МЕНЮ
     ========================================================== */
  function initNav() {
    var burger = $('#burger');
    var nav = $('#nav');
    if (!burger || !nav) return;

    function setOpen(open) {
      nav.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.classList.toggle('is-locked', open);
    }

    burger.addEventListener('click', function () {
      setOpen(burger.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
  }

  /* ==========================================================
     8. ОБЩИЙ SCROLL-ЦИКЛ:
        прогресс, поведение шапки, тема, активный пункт,
        бегущая строка, параллакс
     ========================================================== */
  function initScroll() {
    var header = $('#header');
    var progressBar = $('#progressBar');
    var marqueeTrack = $('#marqueeTrack');
    var lightSections = $$('[data-theme="light"]');
    var parallax = $$('[data-parallax]');
    var navLinks = $$('.nav a');
    var sections = navLinks
      .map(function (a) { return $(a.getAttribute('href')); })
      .filter(Boolean);

    var lastY = window.scrollY;
    var marqueeX = 0;
    var marqueeDir = 1;
    var marqueeSpeed = 42;         // px в секунду
    var groupWidth = 0;
    var lastT = performance.now();
    var ticking = false;

    function measureMarquee() {
      if (!marqueeTrack) return;
      groupWidth = marqueeTrack.scrollWidth / 2;
    }
    measureMarquee();
    window.addEventListener('resize', measureMarquee);
    window.addEventListener('load', measureMarquee);

    function frame(now) {
      var dt = Math.min((now - lastT) / 1000, .05);
      lastT = now;

      var y = window.scrollY;
      var docH = document.documentElement.scrollHeight - window.innerHeight;

      /* прогресс */
      if (progressBar) {
        progressBar.style.width = (docH > 0 ? clamp(y / docH, 0, 1) * 100 : 0) + '%';
      }

      /* шапка: фон при скролле, прячется при движении вниз */
      if (header) {
        header.classList.toggle('is-stuck', y > 40);
        var goingDown = y > lastY && y > 300;
        header.classList.toggle('is-hidden', goingDown && !$('#nav').classList.contains('is-open'));

        /* инверсия темы над светлой секцией */
        var probe = header.getBoundingClientRect().bottom - 12;
        var overLight = lightSections.some(function (s) {
          var r = s.getBoundingClientRect();
          return r.top <= probe && r.bottom >= probe;
        });
        header.classList.toggle('is-light', overLight);
      }

      /* активный пункт меню */
      var mid = y + window.innerHeight * .35;
      var activeIdx = -1;
      sections.forEach(function (s, i) {
        if (s.offsetTop <= mid) activeIdx = i;
      });
      navLinks.forEach(function (a, i) { a.classList.toggle('is-active', i === activeIdx); });

      /* бегущая строка: направление совпадает с направлением скролла */
      if (marqueeTrack && groupWidth > 0 && !REDUCED) {
        if (y !== lastY) marqueeDir = y > lastY ? 1 : -1;
        marqueeX -= marqueeDir * marqueeSpeed * dt;
        marqueeX = ((marqueeX % groupWidth) + groupWidth) % groupWidth;
        marqueeTrack.style.transform = 'translate3d(' + (-marqueeX).toFixed(2) + 'px,0,0)';
      }

      /* параллакс фоновых пятен */
      if (!REDUCED) {
        parallax.forEach(function (el) {
          var f = parseFloat(el.dataset.parallax) || 0;
          el.style.setProperty('translate', '0 ' + (y * f).toFixed(1) + 'px');
        });
      }

      lastY = y;
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(function (t) { lastT = t; frame(t); });
  }

  /* ==========================================================
     9. МЕЛОЧИ
     ========================================================== */
  function initMisc() {
    var year = $('#year');
    if (year) year.textContent = new Date().getFullYear();

    // Фоновое видео: при «уменьшить движение» останавливаем на первом кадре —
    // непрерывно движущийся фон как раз то, от чего эта настройка защищает.
    var video = $('#heroVideo');
    if (video) {
      var applyMotion = function () {
        if (REDUCED) { video.pause(); video.removeAttribute('autoplay'); }
        else { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
      };
      applyMotion();
      motionQuery.addEventListener('change', applyMotion);
    }
  }

  /* ==========================================================
     СТАРТ
     ========================================================== */
  function init() {
    applyContent();
    initPreloader();
    initNav();
    initCursor();
    initMagnetic();
    initReveal();
    initWork();
    initLightbox();
    initScroll();
    initMisc();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
