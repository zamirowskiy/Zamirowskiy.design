/* ============================================================
   Админка портфолио.
   Данные — data/content.js (через tools/admin.py). Все правки сначала
   живут в памяти страницы, на диск уходят по кнопке «Сохранить» / Ctrl+S.
   ============================================================ */
(function () {
  'use strict';

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var token = '';
  var state = null;          // текущее содержимое (правится на месте)
  var savedJSON = '';        // то, что лежит на диске — для индикатора «есть изменения»
  var page = 'works';
  var view = { cat: 'all', q: '' };
  var editingId = null;
  var uploads = {};          // id кейса → [{key, name, p}] — идущие загрузки

  var ICON = {
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
    left: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
    grip: '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    upload: '<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>'
  };

  /* ==========================================================
     УТИЛИТЫ
     ========================================================== */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').trim(); }
  function debounce(fn, ms) {
    var t;
    return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); };
  }
  var TR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
  function slugify(s) {
    return String(s || '').toLowerCase().split('').map(function (c) { return TR[c] != null ? TR[c] : c; }).join('')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }
  function uniqueId(base, taken) {
    var id = base || 'item', n = 2;
    while (taken.indexOf(id) !== -1) id = base + '-' + n++;
    return id;
  }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function src(path) { return /^(https?:|data:|blob:)/.test(path) ? path : '../' + path; }
  function move(arr, from, to) {
    if (to < 0 || to >= arr.length || from === to) return;
    arr.splice(to, 0, arr.splice(from, 1)[0]);
  }
  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function setPath(obj, path, val) {
    var keys = path.split('.'), last = keys.pop();
    var o = keys.reduce(function (o, k) { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; return o[k]; }, obj);
    o[last] = val;
  }

  function toast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' toast--' + type : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, type === 'error' ? 6000 : 3200);
  }

  function confirmBox(title, text, okLabel) {
    return new Promise(function (resolve) {
      var modal = $('#modal');
      $('#modalTitle').textContent = title;
      $('#modalText').textContent = text || '';
      $('#modalOk').textContent = okLabel || 'Удалить';
      modal.hidden = false;
      $('#modalOk').focus();
      function done(v) {
        modal.hidden = true;
        modal.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKey, true);
        resolve(v);
      }
      function onClick(e) {
        var b = e.target.closest('[data-modal]');
        if (b) done(b.dataset.modal === 'ok');
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); done(false); }
      }
      modal.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey, true);
    });
  }

  /* ==========================================================
     СЕРВЕР
     ========================================================== */
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'X-Admin-Token': token }, opts.headers || {});
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error(data.error || ('Ошибка ' + r.status));
        return data;
      });
    });
  }

  function load() {
    return fetch('/api/content', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      token = data.token;
      state = data.content;
      normalize();
      savedJSON = serialize();
      updateStatus();
    });
  }

  // страховка от старых/ручных правок: у всех полей есть нужный тип
  function normalize() {
    state.site = state.site || {};
    state.site.assets = state.site.assets || {};
    state.categories = state.categories || [];
    state.projects = (state.projects || []).map(function (p) {
      return {
        id: p.id, title: p.title || '', client: p.client || '', year: p.year || '',
        cats: p.cats || [], tags: p.tags || [], images: p.images || [],
        text: p.text || '', hidden: !!p.hidden, focus: p.focus || '', cover: p.cover || ''
      };
    });
  }

  // поля с «_» — служебные (новый кейс и т.п.), в файл не попадают
  function serialize() {
    return JSON.stringify(state, function (k, v) { return k.charAt(0) === '_' ? undefined : v; });
  }
  function isDirty() { return state && serialize() !== savedJSON; }

  function updateStatus(mode) {
    var st = $('#status'), btn = $('#saveBtn');
    var dirty = isDirty();
    if (mode === 'saving') { st.dataset.state = 'saving'; st.textContent = 'Сохраняю…'; btn.disabled = true; return; }
    if (mode === 'error') { st.dataset.state = 'error'; st.textContent = 'Не сохранилось'; btn.disabled = false; return; }
    st.dataset.state = dirty ? 'dirty' : 'saved';
    st.textContent = dirty ? 'Есть несохранённые изменения' : 'Всё сохранено';
    btn.disabled = !dirty;
    $('#navCount').textContent = state.projects.length;
    if (state.site.assets.logo) $('#sideLogo').src = src(state.site.assets.logo);
  }
  var changed = debounce(function () { updateStatus(); }, 150);

  function save() {
    if (!isDirty()) return;
    var busy = Object.keys(uploads).some(function (k) { return uploads[k].length; });
    if (busy) { toast('Дождитесь, пока догрузятся картинки', 'error'); return; }
    // пустые названия не пропускаем — на сайте такой кейс выглядел бы сломанным
    var bad = state.projects.filter(function (p) { return !p.title.trim(); });
    if (bad.length) {
      toast('У кейса нет названия — открыл его, заполните', 'error');
      setPage('works');
      openCase(bad[0].id);
      return;
    }
    updateStatus('saving');
    var body = serialize();
    api('/api/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
      .then(function () {
        savedJSON = body;
        updateStatus();
        toast('Сохранено. Обновите вкладку с сайтом, чтобы увидеть изменения', 'ok');
      })
      .catch(function (e) {
        updateStatus('error');
        toast('Не сохранилось: ' + e.message, 'error');
      });
  }

  /* --- картинки: уменьшаем в браузере, потом отправляем --- */
  function prepareImage(file, maxSide) {
    var type = file.type;
    if (type === 'image/svg+xml' || type === 'image/gif') return Promise.resolve({ blob: file, name: file.name });
    if (!/^image\//.test(type)) return Promise.reject(new Error('это не картинка'));

    return createImageBitmap(file).then(function (bmp) {
      var scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
      var small = scale === 1 && file.size < 1.5 * 1024 * 1024 && /jpe?g|webp/.test(type);
      if (small) return { blob: file, name: file.name };

      var w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, w, h);

      // прозрачный PNG оставляем PNG, иначе фон станет чёрным
      var alpha = false;
      if (/png|webp/.test(type)) {
        var data = ctx.getImageData(0, 0, w, h).data;
        var step = Math.max(4, Math.floor(data.length / 4 / 4000)) * 4;
        for (var i = 3; i < data.length; i += step) { if (data[i] < 250) { alpha = true; break; } }
      }
      var outType = alpha ? 'image/png' : 'image/jpeg';
      var base = file.name.replace(/\.[^.]+$/, '');
      return new Promise(function (res) {
        canvas.toBlob(function (blob) {
          res({ blob: blob, name: base + (alpha ? '.png' : '.jpg') });
        }, outType, .86);
      });
    });
  }

  function upload(blob, name, kind, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload?kind=' + kind + '&name=' + encodeURIComponent(name));
      xhr.setRequestHeader('X-Admin-Token', token);
      xhr.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = function () {
        var data = {};
        try { data = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status === 200 && data.path) resolve(data.path);
        else reject(new Error(data.error || 'ошибка загрузки'));
      };
      xhr.onerror = function () { reject(new Error('сервер не отвечает')); };
      xhr.send(blob);
    });
  }

  function pickFiles(accept, multiple) {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.multiple = !!multiple;
      input.onchange = function () { resolve(Array.prototype.slice.call(input.files)); };
      input.click();
    });
  }

  /* ==========================================================
     НАВИГАЦИЯ
     ========================================================== */
  var TITLES = { works: 'Портфолио', cats: 'Разделы', texts: 'Тексты и кнопки', brand: 'Логотип и фото', backups: 'Резервные копии' };

  // каждая страница рисуется в свежий контейнер — старые обработчики уходят вместе с ним
  function freshPage() {
    var old = $('#page');
    var el = old.cloneNode(false);
    old.replaceWith(el);
    return el;
  }

  function setPage(p) {
    if (!TITLES[p]) p = 'works';
    page = p;
    $$('#sideNav button').forEach(function (b) { b.classList.toggle('is-active', b.dataset.page === p); });
    $('#pageTitle').textContent = TITLES[p];
    try { history.replaceState(null, '', '#' + p); } catch (e) {}
    PAGES[p]();
    window.scrollTo(0, 0);
  }

  /* ==========================================================
     СТРАНИЦА: ПОРТФОЛИО
     ========================================================== */
  function catById(id) {
    for (var i = 0; i < state.categories.length; i++) if (state.categories[i].id === id) return state.categories[i];
    return null;
  }
  function inCat(p, id) { return p.cats.indexOf(id) !== -1; }
  function countCat(id) { return state.projects.filter(function (p) { return inCat(p, id); }).length; }
  function allTags() {
    var count = {};
    state.projects.forEach(function (p) { p.tags.forEach(function (t) { count[t] = (count[t] || 0) + 1; }); });
    return Object.keys(count).sort(function (a, b) { return count[b] - count[a] || a.localeCompare(b, 'ru'); });
  }

  function matches(p) {
    if (view.cat === '_none' && p.cats.length) return false;
    if (view.cat === '_hidden' && !p.hidden) return false;
    if (view.cat !== 'all' && view.cat[0] !== '_' && !inCat(p, view.cat)) return false;
    var words = norm(view.q).split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    var hay = norm([p.title, p.client, p.year, p.text].concat(p.tags, p.cats.map(function (c) {
      var cat = catById(c); return cat ? cat.name : '';
    })).join(' '));
    return words.every(function (w) { return hay.indexOf(w) !== -1; });
  }

  function filtered() { return view.cat !== 'all' || norm(view.q) !== ''; }

  function pageWorks() {
    freshPage().innerHTML =
      '<div class="toolbar">' +
        '<div class="toolbar__row">' +
          '<label class="search">' + ICON.search +
            '<input id="q" type="search" placeholder="Поиск: название, клиент, тег, год…" value="' + esc(view.q) + '" autocomplete="off">' +
            '<kbd>/</kbd></label>' +
          '<button class="btn btn--accent" id="addCase">' + ICON.plus + 'Новый кейс</button>' +
        '</div>' +
        '<div class="chips" id="catChips"></div>' +
      '</div>' +
      '<div class="notice" id="orderNote" hidden></div>' +
      '<div class="cases" id="cases"></div>';

    renderChips();
    renderCases();

    $('#q').addEventListener('input', debounce(function (e) { view.q = e.target.value; renderCases(); }, 120));
    $('#addCase').addEventListener('click', addCase);
    $('#catChips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]');
      if (!b) return;
      if (b.dataset.cat === '_manage') { setPage('cats'); return; }
      view.cat = b.dataset.cat;
      renderChips();
      renderCases();
    });
    bindCaseDnD($('#cases'));
  }

  function renderChips() {
    var box = $('#catChips');
    if (!box) return;
    if (view.cat !== 'all' && view.cat[0] !== '_' && !catById(view.cat)) view.cat = 'all';
    var none = state.projects.filter(function (p) { return !p.cats.length; }).length;
    var hidden = state.projects.filter(function (p) { return p.hidden; }).length;
    function chip(id, name, n, extra) {
      return '<button class="chip' + (view.cat === id ? ' is-on' : '') + (extra || '') + '" data-cat="' + esc(id) + '">' +
        esc(name) + (n != null ? '<sup>' + n + '</sup>' : '') + '</button>';
    }
    box.innerHTML = chip('all', 'Все', state.projects.length) +
      state.categories.map(function (c) { return chip(c.id, c.name, countCat(c.id)); }).join('') +
      (none ? chip('_none', 'Без раздела', none) : '') +
      (hidden ? chip('_hidden', 'Скрытые', hidden) : '') +
      chip('_manage', '+ раздел', null, ' chip--dashed');
  }

  function renderCases() {
    var box = $('#cases');
    if (!box) return;
    var list = state.projects.filter(matches);
    var canDrag = !filtered();

    var note = $('#orderNote');
    note.hidden = canDrag || !list.length;
    note.textContent = 'Порядок здесь = порядок на сайте. Чтобы перетаскивать карточки, сбросьте поиск и раздел.';

    if (!list.length) {
      box.innerHTML = '<div class="empty" style="grid-column:1/-1">' +
        (state.projects.length ? 'Ничего не нашлось.' : 'Кейсов пока нет — добавьте первый.') + '</div>' +
        (canDrag ? addTile() : '');
      return;
    }

    box.innerHTML = list.map(function (p) {
      var pos = state.projects.indexOf(p) + 1;
      var cats = p.cats.map(function (c) { var cat = catById(c); return cat ? '<span>' + esc(cat.name) + '</span>' : ''; }).join('');
      if (!p.cats.length) cats = '<span class="is-warn">без раздела</span>';
      var n = p.images.length;
      return '<article class="case' + (p.hidden ? ' is-hidden-case' : '') + '" data-id="' + esc(p.id) + '" tabindex="0"' +
        (canDrag ? ' draggable="true"' : '') + '>' +
        '<div class="case__media">' +
          ((p.cover || n) ? '<img src="' + esc(src(p.cover || p.images[0])) + '" alt="" loading="lazy"' + (p.focus ? ' style="object-position:' + esc(p.focus) + '"' : '') + '>' : '<span class="case__noimg">нет картинок</span>') +
          '<span class="case__num">' + pos + '</span>' +
          (p.hidden ? '<span class="case__badge">скрыт</span>' : (n ? '<span class="case__badge">' + n + ' ' + plural(n, 'картинка', 'картинки', 'картинок') + '</span>' : '')) +
          (canDrag ? '<span class="case__handle" title="Перетащите, чтобы поменять порядок">' + ICON.grip + '</span>' : '') +
        '</div>' +
        '<div class="case__body">' +
          '<h3 class="case__title">' + esc(p.title || 'Без названия') + '</h3>' +
          '<div class="case__meta">' + esc([p.client, p.year].filter(Boolean).join(' · ') || '—') + '</div>' +
          '<div class="case__cats">' + cats + '</div>' +
        '</div>' +
      '</article>';
    }).join('') + (canDrag ? addTile() : '');
  }

  function addTile() {
    return '<button class="case case--add" data-add>' + ICON.plus + 'Добавить кейс</button>';
  }

  function bindCaseDnD(box) {
    var dragId = null;

    box.addEventListener('click', function (e) {
      if (e.target.closest('[data-add]')) { addCase(); return; }
      var card = e.target.closest('.case[data-id]');
      if (card) openCase(card.dataset.id);
    });
    box.addEventListener('keydown', function (e) {
      var card = e.target.closest('.case[data-id]');
      if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openCase(card.dataset.id); }
    });

    box.addEventListener('dragstart', function (e) {
      var card = e.target.closest('.case[data-id]');
      if (!card) return;
      dragId = card.dataset.id;
      card.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    });
    box.addEventListener('dragend', function () {
      dragId = null;
      $$('.case', box).forEach(function (c) { c.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after'); });
    });
    box.addEventListener('dragover', function (e) {
      if (!dragId) return;
      var card = e.target.closest('.case[data-id]');
      if (!card || card.dataset.id === dragId) return;
      e.preventDefault();
      var r = card.getBoundingClientRect();
      var after = e.clientX > r.left + r.width / 2;
      $$('.case', box).forEach(function (c) { c.classList.remove('is-drop-before', 'is-drop-after'); });
      card.classList.add(after ? 'is-drop-after' : 'is-drop-before');
    });
    box.addEventListener('drop', function (e) {
      if (!dragId) return;
      var card = e.target.closest('.case[data-id]');
      if (!card || card.dataset.id === dragId) return;
      e.preventDefault();
      var after = card.classList.contains('is-drop-after');
      var arr = state.projects;
      var from = arr.findIndex(function (p) { return p.id === dragId; });
      var item = arr.splice(from, 1)[0];
      var to = arr.findIndex(function (p) { return p.id === card.dataset.id; }) + (after ? 1 : 0);
      arr.splice(to, 0, item);
      renderCases();
      changed();
    });
  }

  function addCase() {
    var id = uniqueId('case-' + Date.now().toString(36), state.projects.map(function (p) { return p.id; }));
    var cat = (view.cat !== 'all' && view.cat[0] !== '_') ? [view.cat] : [];
    state.projects.unshift({
      id: id, title: '', client: '', year: String(new Date().getFullYear()),
      cats: cat, tags: [], images: [], text: '', hidden: false, _new: true
    });
    view.q = '';
    if (page === 'works') { renderChips(); renderCases(); var q = $('#q'); if (q) q.value = ''; }
    openCase(id, true);
  }

  /* ==========================================================
     РЕДАКТОР КЕЙСА
     ========================================================== */
  function current() {
    return state.projects.find(function (p) { return p.id === editingId; });
  }

  function openCase(id, isNew) {
    editingId = id;
    var p = current();
    if (!p) return;
    renderDrawer();
    var d = $('#drawer');
    d.hidden = false;
    requestAnimationFrame(function () { d.classList.add('is-open'); });
    setTimeout(function () {
      var t = $('#drawerBody [data-f="title"]');
      if (t && (isNew || !p.title)) t.focus();
    }, 60);
  }

  function closeCase() {
    var p = current();
    var d = $('#drawer');
    if (!p) { d.hidden = true; return; }
    if ((uploads[p.id] || []).length) { toast('Картинки ещё грузятся — подождите пару секунд', 'error'); return; }
    // новый пустой кейс, в который ничего не ввели, — просто убираем
    if (p._new && !p.title.trim() && !p.images.length && !p.text.trim() && !p.tags.length) {
      state.projects.splice(state.projects.indexOf(p), 1);
    } else if (!p.title.trim()) {
      toast('Добавьте название кейса', 'error');
      $('#drawerBody [data-f="title"]').focus();
      return;
    }
    delete p._new;
    editingId = null;
    d.classList.remove('is-open');
    setTimeout(function () { d.hidden = true; }, 350);
    if (page === 'works') { renderChips(); renderCases(); }
    changed();
  }

  function renderDrawer() {
    var p = current();
    $('#drawerTitle').textContent = p.title || 'Новый кейс';
    $('#drawerBody').innerHTML =
      '<label class="field"><span>Название *</span>' +
        '<input class="input input--title" data-f="title" value="' + esc(p.title) + '" placeholder="Например: Строй и живи"></label>' +
      '<div class="row">' +
        '<label class="field"><span>Клиент / ниша</span>' +
          '<input class="input" data-f="client" value="' + esc(p.client) + '" placeholder="Строительная компания"></label>' +
        '<label class="field" style="max-width:160px"><span>Год</span>' +
          '<input class="input" data-f="year" value="' + esc(p.year) + '" inputmode="numeric" maxlength="9"></label>' +
      '</div>' +
      '<label class="field"><span>Описание <small>— показывается в окне проекта</small></span>' +
        '<textarea class="textarea" data-f="text" rows="4" placeholder="Что сделали и зачем: пара предложений">' + esc(p.text) + '</textarea>' +
        '<p class="hint" id="textCount"></p></label>' +
      '<div class="field"><span class="label">Разделы <small>— кнопки в верхней строке на сайте</small></span>' +
        '<div class="chips" id="caseCats"></div></div>' +
      '<div class="field"><span class="label">Теги <small>— подписи на карточке, по ним работает поиск</small></span>' +
        '<div class="tags" id="caseTags"></div>' +
        '<div class="suggest" id="tagSuggest"></div></div>' +
      '<div class="field"><span class="label">Картинки <small>— первая станет обложкой, порядок меняется перетаскиванием</small></span>' +
        '<div class="images" id="caseImages"></div>' +
        '<p class="hint">Большие файлы уменьшаются до 1600 px автоматически. Можно перетащить сразу несколько файлов в это окно.</p></div>' +
      '<div class="field"><span class="label">Кадр обложки <small>— нажмите на главное место картинки, карточка на сайте сдвинется к нему</small></span>' +
        '<div class="focus" id="caseFocus"></div></div>' +
      '<label class="switch"><input type="checkbox" data-f="visible"' + (p.hidden ? '' : ' checked') + '><i></i>' +
        '<span>Показывать на сайте</span></label>';

    renderCaseCats();
    renderTags();
    renderImages();
    updateTextCount();
  }

  function updateTextCount() {
    var p = current(), el = $('#textCount');
    if (!p || !el) return;
    var n = p.text.length;
    el.textContent = n ? n + ' ' + plural(n, 'символ', 'символа', 'символов') + (n > 320 ? ' — длинновато, в окне проекта лучше 1–3 предложения' : '') : '';
  }

  function renderCaseCats() {
    var p = current();
    $('#caseCats').innerHTML = state.categories.map(function (c) {
      return '<button type="button" class="chip' + (inCat(p, c.id) ? ' is-on' : '') + '" data-toggle-cat="' + esc(c.id) + '">' + esc(c.name) + '</button>';
    }).join('') +
      '<span id="newCatSlot"><button type="button" class="chip chip--dashed" data-new-cat>+ новый раздел</button></span>';
  }

  function renderTags() {
    var p = current();
    var box = $('#caseTags');
    box.innerHTML = p.tags.map(function (t, i) {
      return '<span class="tag">' + esc(t) + '<button type="button" data-del-tag="' + i + '" aria-label="Убрать тег ' + esc(t) + '">' + ICON.x + '</button></span>';
    }).join('') + '<input id="tagInput" placeholder="' + (p.tags.length ? 'ещё тег…' : 'Логотип, Фирменный стиль… Enter — добавить') + '" list="">';

    var mine = p.tags.map(norm);
    var sug = allTags().filter(function (t) { return mine.indexOf(norm(t)) === -1; }).slice(0, 14);
    $('#tagSuggest').innerHTML = sug.map(function (t) {
      return '<button type="button" data-add-tag="' + esc(t) + '">+ ' + esc(t) + '</button>';
    }).join('');
  }

  function addTag(raw) {
    var p = current();
    var parts = String(raw).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var added = false;
    parts.forEach(function (t) {
      t = t.charAt(0).toUpperCase() + t.slice(1);
      if (p.tags.map(norm).indexOf(norm(t)) === -1) { p.tags.push(t); added = true; }
    });
    if (added) { renderTags(); changed(); }
    var input = $('#tagInput');
    if (input) input.focus();
  }

  function renderImages() {
    var p = current();
    var box = $('#caseImages');
    if (!box) return;
    var items = p.images.map(function (path, i) {
      return '<div class="img" draggable="true" data-img="' + i + '">' +
        '<img src="' + esc(src(path)) + '" alt="">' +
        (i === 0 ? '<span class="img__cover">обложка</span>' : '') +
        '<div class="img__actions">' +
          (i > 0 ? '<button type="button" data-img-cover="' + i + '" title="Сделать обложкой">' + ICON.star + '</button>' : '') +
          '<button type="button" data-img-left="' + i + '" title="Левее"' + (i === 0 ? ' hidden' : '') + '>' + ICON.left + '</button>' +
          '<button type="button" data-img-right="' + i + '" title="Правее"' + (i === p.images.length - 1 ? ' hidden' : '') + '>' + ICON.right + '</button>' +
          '<button type="button" class="danger" data-img-del="' + i + '" title="Убрать из кейса">' + ICON.trash + '</button>' +
        '</div></div>';
    }).join('');
    var loading = (uploads[p.id] || []).map(function (u) {
      return '<div class="img img--loading" style="--p:' + Math.round(u.p * 100) + '%"><span>' + esc(u.label) + '</span></div>';
    }).join('');
    box.innerHTML = items + loading +
      '<button type="button" class="drop" id="dropZone">' + ICON.upload + '<span>Добавить картинки<br><small>или перетащите сюда</small></span></button>';
    renderFocus();
  }

  // точка фокуса обложки: слева вся картинка с меткой, справа — как её обрежет карточка 4:3
  function renderFocus() {
    var p = current();
    var box = $('#caseFocus');
    if (!p || !box) return;
    var coverBtns =
      '<button type="button" class="btn btn--ghost btn--sm" data-cover-up>' + (p.cover ? 'Заменить обложку' : 'Своя обложка') + '</button>' +
      (p.cover ? '<button type="button" class="btn btn--ghost btn--sm" data-cover-reset>Взять первую картинку</button>' : '');
    if (!p.images.length && !p.cover) {
      box.innerHTML = '<p class="hint">Сначала добавьте картинки.</p>';
      return;
    }
    var pos = (p.focus || '50% 50%').split(' ');
    var cover = esc(src(p.cover || p.images[0]));
    box.innerHTML =
      '<div class="focus__pick" id="focusPick" title="Нажмите на главное место картинки">' +
        '<img src="' + cover + '" alt="" draggable="false">' +
        '<i class="focus__dot" style="left:' + pos[0] + ';top:' + pos[1] + '"></i>' +
      '</div>' +
      '<div class="focus__side">' +
        '<div class="focus__preview"><img src="' + cover + '" alt="" style="object-position:' + (p.focus || '50% 50%') + '"></div>' +
        '<span class="hint">' + (p.cover ? 'Своя обложка — в галерею не попадает. ' : '') + 'Так она выглядит на карточке</span>' +
        '<div class="btn-row">' +
          (p.focus ? '<button type="button" class="btn btn--ghost btn--sm" data-focus-reset>По центру</button>' : '') +
          coverBtns +
        '</div>' +
      '</div>';
  }

  function addImages(files) {
    var p = current();
    if (!p) return;
    files = files.filter(function (f) { return /^image\//.test(f.type); });
    if (!files.length) { toast('Нужны картинки: JPG, PNG, WEBP, SVG', 'error'); return; }
    var caseId = p.id;
    var prefix = slugify(p.title) || caseId;
    uploads[caseId] = uploads[caseId] || [];

    // грузим по очереди — так порядок картинок совпадает с порядком файлов
    files.reduce(function (chain, file) {
      var u = { label: 'готовлю…', p: .05 };
      uploads[caseId].push(u);
      if (editingId === caseId) renderImages();
      return chain.then(function () {
        return prepareImage(file, 1600).then(function (prep) {
          u.label = 'загружаю…';
          if (editingId === caseId) renderImages();
          var ext = (prep.name.match(/\.[a-z0-9]+$/i) || ['.jpg'])[0].toLowerCase();
          return upload(prep.blob, prefix + ext, 'works', function (x) {
            u.p = .1 + x * .9;
            var el = $$('#caseImages .img--loading')[uploads[caseId].indexOf(u)];
            if (el) el.style.setProperty('--p', Math.round(u.p * 100) + '%');
          });
        }).then(function (path) {
          var proj = state.projects.find(function (x) { return x.id === caseId; });
          if (proj) proj.images.push(path);
        }).catch(function (e) {
          toast(file.name + ': ' + e.message, 'error');
        }).then(function () {
          uploads[caseId].splice(uploads[caseId].indexOf(u), 1);
          if (editingId === caseId) renderImages();
          if (page === 'works') renderCases();
          changed();
        });
      });
    }, Promise.resolve());
  }

  function bindDrawer() {
    var drawer = $('#drawer');
    var body = $('#drawerBody');

    drawer.addEventListener('click', function (e) {
      if (e.target.closest('[data-drawer-close]')) closeCase();
    });

    $('#deleteCase').addEventListener('click', function () {
      var p = current();
      if (!p) return;
      confirmBox('Удалить кейс «' + (p.title || 'Без названия') + '»?',
        'Он пропадёт с сайта после сохранения. Файлы картинок останутся в папке assets/works.')
        .then(function (ok) {
          if (!ok) return;
          state.projects.splice(state.projects.indexOf(p), 1);
          editingId = null;
          drawer.classList.remove('is-open');
          setTimeout(function () { drawer.hidden = true; }, 350);
          if (page === 'works') { renderChips(); renderCases(); }
          changed();
          toast('Кейс удалён — не забудьте сохранить');
        });
    });

    body.addEventListener('input', function (e) {
      var p = current();
      var f = e.target.dataset.f;
      if (!p || !f) return;
      if (f === 'visible') return;
      p[f] = e.target.value;
      if (f === 'title') $('#drawerTitle').textContent = p.title || 'Новый кейс';
      if (f === 'text') updateTextCount();
      changed();
    });
    body.addEventListener('change', function (e) {
      var p = current();
      if (p && e.target.dataset.f === 'visible') { p.hidden = !e.target.checked; changed(); }
    });

    body.addEventListener('click', function (e) {
      var p = current();
      if (!p) return;
      var t;

      if ((t = e.target.closest('#focusPick'))) {
        var r = t.querySelector('img').getBoundingClientRect();
        var x = Math.round(Math.min(100, Math.max(0, (e.clientX - r.left) / r.width * 100)));
        var y = Math.round(Math.min(100, Math.max(0, (e.clientY - r.top) / r.height * 100)));
        p.focus = x + '% ' + y + '%';
        renderFocus(); changed(); return;
      }
      if (e.target.closest('[data-focus-reset]')) { p.focus = ''; renderFocus(); changed(); return; }
      if (e.target.closest('[data-cover-reset]')) { p.cover = ''; p.focus = ''; renderFocus(); changed(); return; }
      if ((t = e.target.closest('[data-cover-up]'))) {
        // отдельная картинка только для карточки — когда главное на фото у самого края
        var caseId = p.id, btn = t;
        pickFiles('image/*', false).then(function (files) {
          if (!files.length) return;
          btn.disabled = true; btn.textContent = 'Загружаю…';
          prepareImage(files[0], 1600).then(function (prep) {
            var ext = (prep.name.match(/\.[a-z0-9]+$/i) || ['.jpg'])[0].toLowerCase();
            return upload(prep.blob, (slugify(p.title) || caseId) + '-cover' + ext, 'works');
          }).then(function (path) {
            var proj = state.projects.find(function (x) { return x.id === caseId; });
            if (proj) { proj.cover = path; proj.focus = ''; }
            if (editingId === caseId) renderFocus();
            changed();
          }).catch(function (err) { toast('Не загрузилось: ' + err.message, 'error'); renderFocus(); });
        });
        return;
      }

      if ((t = e.target.closest('[data-toggle-cat]'))) {
        var id = t.dataset.toggleCat, i = p.cats.indexOf(id);
        if (i === -1) p.cats.push(id); else p.cats.splice(i, 1);
        // разделы кейса держим в порядке верхней строки
        p.cats.sort(function (a, b) {
          return state.categories.findIndex(function (c) { return c.id === a; }) -
                 state.categories.findIndex(function (c) { return c.id === b; });
        });
        renderCaseCats(); changed(); return;
      }
      if (e.target.closest('[data-new-cat]')) {
        $('#newCatSlot').innerHTML = '<input class="input" id="newCatInput" style="height:36px;width:200px;border-radius:999px" placeholder="Название, Enter">';
        $('#newCatInput').focus();
        return;
      }
      if ((t = e.target.closest('[data-del-tag]'))) { p.tags.splice(+t.dataset.delTag, 1); renderTags(); changed(); return; }
      if ((t = e.target.closest('[data-add-tag]'))) { addTag(t.dataset.addTag); return; }
      if (e.target.closest('#caseTags') && !e.target.closest('button')) { $('#tagInput').focus(); return; }

      if ((t = e.target.closest('[data-img-cover]'))) { move(p.images, +t.dataset.imgCover, 0); renderImages(); changed(); return; }
      if ((t = e.target.closest('[data-img-left]'))) { var a = +t.dataset.imgLeft; move(p.images, a, a - 1); renderImages(); changed(); return; }
      if ((t = e.target.closest('[data-img-right]'))) { var b = +t.dataset.imgRight; move(p.images, b, b + 1); renderImages(); changed(); return; }
      if ((t = e.target.closest('[data-img-del]'))) { p.images.splice(+t.dataset.imgDel, 1); renderImages(); changed(); return; }
      if (e.target.closest('#dropZone')) {
        pickFiles('image/*', true).then(addImages);
      }
    });

    body.addEventListener('keydown', function (e) {
      var p = current();
      if (!p) return;
      if (e.target.id === 'tagInput') {
        var v = e.target.value;
        if ((e.key === 'Enter' || e.key === ',') && v.trim()) { e.preventDefault(); addTag(v); }
        else if (e.key === 'Enter') e.preventDefault();
        else if (e.key === 'Backspace' && !v && p.tags.length) { p.tags.pop(); renderTags(); changed(); }
      }
      if (e.target.id === 'newCatInput') {
        if (e.key === 'Escape') { e.stopPropagation(); renderCaseCats(); }
        if (e.key === 'Enter') {
          e.preventDefault();
          var name = e.target.value.trim();
          if (!name) { renderCaseCats(); return; }
          var exist = state.categories.find(function (c) { return norm(c.name) === norm(name); });
          var cat = exist || addCategory(name);
          if (!inCat(p, cat.id)) p.cats.push(cat.id);
          renderCaseCats(); changed();
        }
      }
    });
    body.addEventListener('focusout', function (e) {
      if (e.target.id === 'tagInput' && e.target.value.trim()) addTag(e.target.value);
    });

    /* --- перетаскивание картинок внутри кейса --- */
    var dragImg = null;
    body.addEventListener('dragstart', function (e) {
      var el = e.target.closest('.img[data-img]');
      if (!el) return;
      dragImg = +el.dataset.img;
      el.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'img');
    });
    body.addEventListener('dragend', function () {
      dragImg = null;
      $$('.img', body).forEach(function (c) { c.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after'); });
    });

    /* --- файлы с компьютера: можно бросить в любое место редактора --- */
    var depth = 0;
    function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') !== -1; }
    body.addEventListener('dragenter', function (e) { if (hasFiles(e)) { depth++; body.classList.add('is-over'); } });
    body.addEventListener('dragleave', function (e) { if (hasFiles(e) && --depth <= 0) { depth = 0; body.classList.remove('is-over'); } });
    body.addEventListener('dragover', function (e) {
      if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; return; }
      if (dragImg === null) return;
      var el = e.target.closest('.img[data-img]');
      if (!el || +el.dataset.img === dragImg) return;
      e.preventDefault();
      var r = el.getBoundingClientRect();
      var after = e.clientX > r.left + r.width / 2;
      $$('.img', body).forEach(function (c) { c.classList.remove('is-drop-before', 'is-drop-after'); });
      el.classList.add(after ? 'is-drop-after' : 'is-drop-before');
    });
    body.addEventListener('drop', function (e) {
      if (hasFiles(e)) {
        e.preventDefault();
        depth = 0; body.classList.remove('is-over');
        addImages(Array.prototype.slice.call(e.dataTransfer.files));
        return;
      }
      if (dragImg === null) return;
      var el = e.target.closest('.img[data-img]');
      if (!el) return;
      e.preventDefault();
      var p = current();
      var to = +el.dataset.img + (el.classList.contains('is-drop-after') ? 1 : 0);
      if (to > dragImg) to--;
      move(p.images, dragImg, to);
      dragImg = null;
      renderImages();
      changed();
    });
  }

  /* ==========================================================
     СТРАНИЦА: РАЗДЕЛЫ
     ========================================================== */
  function addCategory(name) {
    var id = uniqueId(slugify(name) || 'razdel', state.categories.map(function (c) { return c.id; }));
    var cat = { id: id, name: name };
    state.categories.push(cat);
    return cat;
  }

  function pageCats() {
    freshPage().innerHTML =
      '<div class="card">' +
        '<h2>Разделы портфолио</h2>' +
        '<p class="hint">Это кнопки в верхней строке над работами. Порядок здесь = порядок на сайте. ' +
        'Раздел без кейсов на сайте не показывается.</p>' +
        '<div class="cat-list" id="catList"></div>' +
        '<form class="add-row" id="catAdd">' +
          '<input class="input" id="catName" placeholder="Новый раздел, например «Упаковка»" autocomplete="off">' +
          '<button class="btn btn--accent" type="submit">' + ICON.plus + 'Добавить</button>' +
        '</form>' +
      '</div>';
    renderCatList();

    $('#catAdd').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#catName').value.trim();
      if (!name) return;
      if (state.categories.some(function (c) { return norm(c.name) === norm(name); })) { toast('Такой раздел уже есть', 'error'); return; }
      addCategory(name);
      $('#catName').value = '';
      renderCatList(); changed();
    });

    var list = $('#catList');
    var prevName = '';
    list.addEventListener('input', function (e) {
      var i = e.target.dataset.catName;
      if (i == null) return;
      state.categories[+i].name = e.target.value;
      changed();
    });
    list.addEventListener('focusout', function (e) {
      var i = e.target.dataset.catName;
      if (i != null && !e.target.value.trim()) {
        toast('Пустое название не сохранится — вернул прежнее', 'error');
        state.categories[+i].name = prevName || 'Раздел';
        renderCatList(); changed();
      }
    });
    list.addEventListener('focusin', function (e) {
      var i = e.target.dataset.catName;
      if (i != null) prevName = state.categories[+i].name;
    });
    list.addEventListener('click', function (e) {
      var t;
      if ((t = e.target.closest('[data-cat-up]'))) { move(state.categories, +t.dataset.catUp, +t.dataset.catUp - 1); renderCatList(); changed(); return; }
      if ((t = e.target.closest('[data-cat-down]'))) { move(state.categories, +t.dataset.catDown, +t.dataset.catDown + 1); renderCatList(); changed(); return; }
      if ((t = e.target.closest('[data-cat-del]'))) {
        var cat = state.categories[+t.dataset.catDel];
        var n = countCat(cat.id);
        var go = n
          ? confirmBox('Удалить раздел «' + cat.name + '»?', 'Он стоит у ' + n + ' ' + plural(n, 'кейса', 'кейсов', 'кейсов') + '. Кейсы останутся, у них просто пропадёт этот раздел.')
          : Promise.resolve(true);
        go.then(function (ok) {
          if (!ok) return;
          state.categories.splice(state.categories.indexOf(cat), 1);
          state.projects.forEach(function (p) { var i = p.cats.indexOf(cat.id); if (i !== -1) p.cats.splice(i, 1); });
          renderCatList(); changed();
        });
      }
    });
  }

  function renderCatList() {
    var cats = state.categories;
    $('#catList').innerHTML = cats.length ? cats.map(function (c, i) {
      var n = countCat(c.id);
      return '<div class="cat">' +
        '<div class="cat__move">' +
          '<button class="icon-btn" data-cat-up="' + i + '" aria-label="Выше"' + (i === 0 ? ' disabled' : '') + '>' + ICON.up + '</button>' +
          '<button class="icon-btn" data-cat-down="' + i + '" aria-label="Ниже"' + (i === cats.length - 1 ? ' disabled' : '') + '>' + ICON.down + '</button>' +
        '</div>' +
        '<input class="input" data-cat-name="' + i + '" value="' + esc(c.name) + '" aria-label="Название раздела">' +
        '<span class="cat__count" title="Ссылка на раздел: сайт/#' + esc(c.id) + '">' + n + ' ' + plural(n, 'кейс', 'кейса', 'кейсов') + ' · #' + esc(c.id) + '</span>' +
        '<button class="icon-btn icon-btn--danger" data-cat-del="' + i + '" aria-label="Удалить раздел">' + ICON.trash + '</button>' +
      '</div>';
    }).join('') : '<p class="hint">Разделов нет — на сайте будет только «Все работы».</p>';
  }

  /* ==========================================================
     СТРАНИЦА: ТЕКСТЫ
     ========================================================== */
  var TEXTS = [
    { id: 'header', title: 'Шапка и меню', fields: [
      ['nav.work', 'Пункт меню «Работы»'], ['nav.about', 'Пункт меню «Обо мне»'],
      ['nav.process', 'Пункт меню «Как работаю»'], ['nav.contact', 'Пункт меню «Контакты»'],
      ['header.cta', 'Кнопка в шапке']] },
    { id: 'hero', title: 'Главный экран', fields: [
      ['hero.eyebrow', 'Надзаголовок — мелкий оранжевый'],
      ['hero.line1', 'Заголовок, строка 1'], ['hero.line2', 'Заголовок, строка 2'], ['hero.line3', 'Заголовок, строка 3 — оранжевая'],
      ['hero.lead', 'Подзаголовок', 'area'],
      ['hero.btnPrimary', 'Главная кнопка'], ['hero.btnSecondary', 'Вторая кнопка']] },
    { id: 'marquee', title: 'Бегущая строка', words: 'marquee', hint: 'Слова, которые едут между звёздочками под главным экраном.' },
    { id: 'work', title: 'Блок «Работы»', fields: [
      ['work.eyebrow', 'Надзаголовок'], ['work.title', 'Заголовок'], ['work.aside', 'Текст справа от заголовка', 'area'],
      ['work.all', 'Первая кнопка фильтра'], ['work.search', 'Подсказка в поле поиска'],
      ['work.empty', 'Если поиск ничего не нашёл']] },
    { id: 'about', title: 'Обо мне', fields: [
      ['about.eyebrow', 'Надзаголовок'], ['about.title', 'Заголовок'], ['about.badge', 'Текст по кругу на значке у фото']],
      lists: [
        { k: 'about.paragraphs', label: 'Абзацы', type: 'strings', add: 'Добавить абзац' },
        { k: 'about.facts', label: 'Факты под текстом', type: 'pairs', add: 'Добавить факт',
          keys: [['title', 'Жирным'], ['text', 'Пояснение']] }] },
    { id: 'process', title: 'Как работаю', fields: [['process.eyebrow', 'Надзаголовок'], ['process.title', 'Заголовок']],
      lists: [{ k: 'process.steps', label: 'Шаги (нумеруются сами)', type: 'pairs', add: 'Добавить шаг',
        keys: [['title', 'Название шага'], ['text', 'Описание', 'area']] }] },
    { id: 'contact', title: 'Контакты', fields: [
      ['contact.eyebrow', 'Надзаголовок'], ['contact.title', 'Заголовок'], ['contact.lead', 'Текст под заголовком', 'area']],
      lists: [{ k: 'contact.links', label: 'Ссылки', type: 'pairs', add: 'Добавить контакт',
        keys: [['label', 'Подпись: ВКонтакте, Telegram…'], ['value', 'Что видно на сайте'], ['url', 'Ссылка: https://…, mailto:…, tel:+7…']] }] },
    { id: 'footer', title: 'Подвал', fields: [['footer.name', 'Имя'], ['footer.role', 'Подпись под именем']] },
    { id: 'seo', title: 'Для поисковиков', fields: [
      ['meta.title', 'Заголовок вкладки браузера'], ['meta.description', 'Описание в поисковой выдаче', 'area']] }
  ];

  function fieldHTML(k, label, type) {
    var v = getPath(state.site, k) || '';
    return '<label class="field"><span>' + esc(label) + '</span>' +
      (type === 'area'
        ? '<textarea class="textarea" rows="3" data-k="' + k + '">' + esc(v) + '</textarea>'
        : '<input class="input" data-k="' + k + '" value="' + esc(v) + '">') +
      '</label>';
  }

  function listHTML(spec) {
    var arr = getPath(state.site, spec.k) || [];
    var items = arr.map(function (item, i) {
      var fields = spec.type === 'strings'
        ? '<textarea class="textarea" rows="3" data-list="' + spec.k + '" data-i="' + i + '">' + esc(item) + '</textarea>'
        : spec.keys.map(function (kk) {
            var v = item[kk[0]] || '';
            return '<label class="field"><span>' + esc(kk[1]) + '</span>' + (kk[2] === 'area'
              ? '<textarea class="textarea" rows="2" data-list="' + spec.k + '" data-i="' + i + '" data-key="' + kk[0] + '">' + esc(v) + '</textarea>'
              : '<input class="input" data-list="' + spec.k + '" data-i="' + i + '" data-key="' + kk[0] + '" value="' + esc(v) + '">') + '</label>';
          }).join('');
      return '<div class="list__item"><div class="list__fields">' + fields + '</div>' +
        '<div class="list__tools">' +
          '<button class="icon-btn" data-l-up="' + i + '" data-l="' + spec.k + '" aria-label="Выше"' + (i === 0 ? ' disabled' : '') + '>' + ICON.up + '</button>' +
          '<button class="icon-btn" data-l-down="' + i + '" data-l="' + spec.k + '" aria-label="Ниже"' + (i === arr.length - 1 ? ' disabled' : '') + '>' + ICON.down + '</button>' +
          '<button class="icon-btn icon-btn--danger" data-l-del="' + i + '" data-l="' + spec.k + '" aria-label="Удалить">' + ICON.trash + '</button>' +
        '</div></div>';
    }).join('');
    return '<div class="field" data-list-box="' + spec.k + '"><span class="label">' + esc(spec.label) + '</span>' +
      '<div class="list">' + items + '</div>' +
      '<div><button class="btn btn--ghost btn--sm" data-l-add="' + spec.k + '">' + ICON.plus + esc(spec.add) + '</button></div></div>';
  }

  function wordsHTML(k) {
    var arr = getPath(state.site, k) || [];
    return '<div class="tags" data-words="' + k + '">' + arr.map(function (w, i) {
      return '<span class="tag">' + esc(w) + '<button type="button" data-w-del="' + i + '" aria-label="Убрать">' + ICON.x + '</button></span>';
    }).join('') + '<input data-w-input="' + k + '" placeholder="Новое слово, Enter"></div>';
  }

  function findSpec(k) {
    for (var i = 0; i < TEXTS.length; i++) {
      var ls = TEXTS[i].lists || [];
      for (var j = 0; j < ls.length; j++) if (ls[j].k === k) return ls[j];
    }
    return null;
  }

  function pageTexts() {
    freshPage().innerHTML = '<div class="texts">' +
      '<nav class="texts__toc">' + TEXTS.map(function (g) {
        return '<a href="#t-' + g.id + '" data-toc="' + g.id + '">' + esc(g.title) + '</a>';
      }).join('') + '</nav>' +
      '<div>' + TEXTS.map(function (g) {
        return '<section class="card" id="t-' + g.id + '"><h2>' + esc(g.title) + '</h2>' +
          (g.hint ? '<p class="hint">' + esc(g.hint) + '</p>' : '<p class="hint"></p>') +
          '<div class="stack">' +
            (g.fields || []).map(function (f) { return fieldHTML(f[0], f[1], f[2]); }).join('') +
            (g.words ? wordsHTML(g.words) : '') +
            (g.lists || []).map(listHTML).join('') +
          '</div></section>';
      }).join('') + '</div></div>';

    var root = $('#page');
    root.querySelector('.texts__toc').addEventListener('click', function (e) {
      var a = e.target.closest('[data-toc]');
      if (!a) return;
      e.preventDefault();
      $('#t-' + a.dataset.toc).scrollIntoView({ behavior: 'smooth' });
    });

    root.addEventListener('input', function (e) {
      var t = e.target;
      if (t.dataset.k) { setPath(state.site, t.dataset.k, t.value); changed(); return; }
      if (t.dataset.list) {
        var arr = getPath(state.site, t.dataset.list);
        if (t.dataset.key) arr[+t.dataset.i][t.dataset.key] = t.value;
        else arr[+t.dataset.i] = t.value;
        changed();
      }
    });

    function rerenderList(k) {
      var box = root.querySelector('[data-list-box="' + k + '"]');
      var tmp = document.createElement('div');
      tmp.innerHTML = listHTML(findSpec(k));
      box.replaceWith(tmp.firstChild);
    }
    function rerenderWords(k) {
      var box = root.querySelector('[data-words="' + k + '"]');
      var tmp = document.createElement('div');
      tmp.innerHTML = wordsHTML(k);
      box.replaceWith(tmp.firstChild);
      root.querySelector('[data-w-input="' + k + '"]').focus();
    }

    root.addEventListener('click', function (e) {
      var t;
      if ((t = e.target.closest('[data-l-add]'))) {
        var k = t.dataset.lAdd, spec = findSpec(k);
        var arr = getPath(state.site, k);
        if (!Array.isArray(arr)) { arr = []; setPath(state.site, k, arr); }
        var item = spec.type === 'strings' ? '' : {};
        if (spec.type !== 'strings') spec.keys.forEach(function (kk) { item[kk[0]] = ''; });
        arr.push(item);
        rerenderList(k); changed();
        var last = $$('[data-list="' + k + '"][data-i="' + (arr.length - 1) + '"]', root)[0];
        if (last) last.focus();
        return;
      }
      if ((t = e.target.closest('[data-l]'))) {
        var key = t.dataset.l, list = getPath(state.site, key);
        if (t.dataset.lUp != null) move(list, +t.dataset.lUp, +t.dataset.lUp - 1);
        else if (t.dataset.lDown != null) move(list, +t.dataset.lDown, +t.dataset.lDown + 1);
        else if (t.dataset.lDel != null) list.splice(+t.dataset.lDel, 1);
        rerenderList(key); changed();
        return;
      }
      if ((t = e.target.closest('[data-w-del]'))) {
        var wk = t.closest('[data-words]').dataset.words;
        getPath(state.site, wk).splice(+t.dataset.wDel, 1);
        rerenderWords(wk); changed();
        return;
      }
      if ((t = e.target.closest('[data-words]')) && !e.target.closest('button')) {
        t.querySelector('input').focus();
      }
    });

    root.addEventListener('keydown', function (e) {
      var k = e.target.dataset.wInput;
      if (!k) return;
      var arr = getPath(state.site, k);
      if (!Array.isArray(arr)) { arr = []; setPath(state.site, k, arr); }
      if (e.key === 'Enter' && e.target.value.trim()) {
        e.preventDefault();
        arr.push(e.target.value.trim());
        rerenderWords(k); changed();
      } else if (e.key === 'Backspace' && !e.target.value && arr.length) {
        arr.pop();
        rerenderWords(k); changed();
      }
    });
  }

  /* ==========================================================
     СТРАНИЦА: ЛОГОТИП И ФОТО
     ========================================================== */
  var DEFAULTS = { logo: 'assets/logo.svg', photo: 'assets/roman.webp' };

  function pageBrand() {
    var a = state.site.assets;
    var logo = a.logo || DEFAULTS.logo, photo = a.photo || DEFAULTS.photo;
    freshPage().innerHTML = '<div class="brand-grid">' +
      '<section class="card"><h2>Логотип</h2>' +
        '<p class="hint">Стоит в шапке, подвале и на заставке. Лучше SVG или PNG с прозрачным фоном. ' +
        'Сайт тёмный, поэтому светлый или оранжевый знак читается лучше.</p>' +
        '<div class="preview-pair">' +
          '<div class="preview"><img src="' + esc(src(logo)) + '" alt="Логотип на тёмном"></div>' +
          '<div class="preview preview--light"><img src="' + esc(src(logo)) + '" alt="Логотип на светлом"></div>' +
        '</div>' +
        '<div class="btn-row">' +
          '<button class="btn btn--accent" data-brand-up="logo">' + ICON.upload + 'Загрузить логотип</button>' +
          (logo !== DEFAULTS.logo ? '<button class="btn btn--ghost" data-brand-reset="logo">Вернуть исходный</button>' : '') +
        '</div></section>' +
      '<section class="card"><h2>Фото в блоке «Обо мне»</h2>' +
        '<p class="hint">Вертикальное, примерно 4:5. Обрезается по центру, лицо держите в верхней трети.</p>' +
        '<div class="preview preview--light preview--photo"><img src="' + esc(src(photo)) + '" alt="Фото"></div>' +
        '<div class="btn-row">' +
          '<button class="btn btn--accent" data-brand-up="photo">' + ICON.upload + 'Загрузить фото</button>' +
          (photo !== DEFAULTS.photo ? '<button class="btn btn--ghost" data-brand-reset="photo">Вернуть исходное</button>' : '') +
        '</div></section>' +
      '</div>';

    $('#page').addEventListener('click', function (e) {
      var t;
      if ((t = e.target.closest('[data-brand-reset]'))) {
        a[t.dataset.brandReset] = DEFAULTS[t.dataset.brandReset];
        changed(); pageBrand();
        return;
      }
      if ((t = e.target.closest('[data-brand-up]'))) {
        var kind = t.dataset.brandUp;
        pickFiles(kind === 'logo' ? 'image/svg+xml,image/png,image/webp' : 'image/jpeg,image/png,image/webp', false).then(function (files) {
          if (!files.length) return;
          t.disabled = true; t.textContent = 'Загружаю…';
          prepareImage(files[0], kind === 'logo' ? 1200 : 1400).then(function (prep) {
            var ext = (prep.name.match(/\.[a-z0-9]+$/i) || ['.png'])[0].toLowerCase();
            return upload(prep.blob, kind + ext, 'brand');
          }).then(function (path) {
            a[kind] = path;
            changed(); pageBrand();
            toast(kind === 'logo' ? 'Логотип загружен — сохраните, чтобы он появился на сайте' : 'Фото загружено — не забудьте сохранить', 'ok');
          }).catch(function (err) {
            toast('Не загрузилось: ' + err.message, 'error');
            pageBrand();
          });
        });
      }
    });
  }

  /* ==========================================================
     СТРАНИЦА: РЕЗЕРВНЫЕ КОПИИ
     ========================================================== */
  function pageBackups() {
    freshPage().innerHTML = '<section class="card"><h2>Резервные копии</h2>' +
      '<p class="hint">Перед каждым сохранением прежняя версия откладывается сюда. Хранятся последние 30.</p>' +
      '<div class="stack" id="backupList"><p class="hint">Загружаю…</p></div></section>';

    fetch('/api/backups', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (data) {
      var list = data.backups || [];
      var box = $('#backupList');
      if (!box) return;
      box.innerHTML = list.length ? list.map(function (name) {
        var m = name.match(/content-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
        var label = m ? m[3] + '.' + m[2] + '.' + m[1] + ', ' + m[4] + ':' + m[5] + ':' + m[6] : name;
        return '<div class="backup"><span>' + label + '</span>' +
          '<button class="btn btn--ghost btn--sm" data-restore="' + esc(name) + '">Вернуть эту версию</button></div>';
      }).join('') : '<p class="hint">Копий пока нет — они появятся после первого сохранения.</p>';

      box.addEventListener('click', function (e) {
        var b = e.target.closest('[data-restore]');
        if (!b) return;
        confirmBox('Вернуть версию от ' + b.previousSibling.textContent + '?',
          (isDirty() ? 'Несохранённые правки пропадут. ' : '') + 'Текущая версия тоже уйдёт в копии, так что её можно будет вернуть.', 'Вернуть')
          .then(function (ok) {
            if (!ok) return;
            api('/api/restore?name=' + encodeURIComponent(b.dataset.restore), { method: 'POST' })
              .then(load)
              .then(function () { toast('Версия восстановлена', 'ok'); pageBackups(); })
              .catch(function (err) { toast(err.message, 'error'); });
          });
      });
    });
  }

  var PAGES = { works: pageWorks, cats: pageCats, texts: pageTexts, brand: pageBrand, backups: pageBackups };

  /* ==========================================================
     СТАРТ
     ========================================================== */
  function init() {
    load().then(function () {
      $('#app').hidden = false;
      bindDrawer();

      $('#sideNav').addEventListener('click', function (e) {
        var b = e.target.closest('[data-page]');
        if (b) setPage(b.dataset.page);
      });
      $('#saveBtn').addEventListener('click', save);

      document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'ы' || e.code === 'KeyS')) { e.preventDefault(); save(); return; }
        if (e.key === 'Escape' && !$('#drawer').hidden && $('#modal').hidden) { closeCase(); return; }
        var typing = /input|textarea/i.test(document.activeElement.tagName);
        if (e.key === '/' && !typing && page === 'works' && $('#drawer').hidden) { e.preventDefault(); $('#q').focus(); }
      });

      window.addEventListener('beforeunload', function (e) {
        if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
      });

      window.addEventListener('hashchange', function () {
        var p = location.hash.slice(1);
        if (p !== page && TITLES[p]) setPage(p);
      });

      setPage(location.hash.slice(1) || 'works');
    }).catch(function (err) {
      $('#offline').hidden = false;
      $('#offlineHint').textContent = location.protocol === 'file:'
        ? 'Сейчас страница открыта как файл — так сохранять нельзя.'
        : 'Сервер не ответил: ' + err.message;
    });
  }

  init();
})();
