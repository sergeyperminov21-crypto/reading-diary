(() => {
  'use strict';

  const STORAGE_KEY = 'reading-diary-v1';
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const STATUS = {
    want:    { label: 'Хочу прочитать' },
    reading: { label: 'Читаю' },
    read:    { label: 'Прочитано' }
  };

  let books = [];
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(raw)) books = raw;
  } catch (e) { books = []; }

  const filters = { search: '', status: 'all', sort: 'recent' };
  let editingId = null;
  let formRating = 0;

  /* ---------- Утилиты ---------- */
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
  const uid  = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const esc = (s = '') => String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  const fmtDate = iso => {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? '' : d.toLocaleDateString('ru-RU', { day:'numeric', month:'short', year:'numeric' });
  };

  const plural = (n, forms) => {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5)   return forms[1];
    if (b === 1)          return forms[0];
    return forms[2];
  };

  /* ---------- Рендер ---------- */
  function visibleBooks() {
    const q = filters.search.trim().toLowerCase();
    const list = books.filter(b => {
      const matchQ = !q || [b.title, b.author, b.genre, b.review, b.quote]
        .some(v => (v || '').toLowerCase().includes(q));
      const matchS = filters.status === 'all' || b.status === filters.status;
      return matchQ && matchS;
    });

    const sorters = {
      recent: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
      title:  (a, b) => (a.title  || '').localeCompare(b.title  || '', 'ru'),
      author: (a, b) => (a.author || '').localeCompare(b.author || '', 'ru'),
      rating: (a, b) => (b.rating || 0) - (a.rating || 0),
      pages:  (a, b) => (b.pages  || 0) - (a.pages  || 0)
    };
    return list.sort(sorters[filters.sort] || sorters.recent);
  }

  function starsHTML(r) {
    let out = '';
    for (let i = 1; i <= 5; i++) out += `<span class="${i <= r ? '' : 'off'}">★</span>`;
    return out;
  }

  function cardHTML(b) {
    const st = STATUS[b.status] || STATUS.want;
    const meta = [];
    if (b.genre) meta.push(esc(b.genre));
    if (b.pages) meta.push(b.pages + ' ' + plural(b.pages, ['стр.', 'стр.', 'стр.']));
    if (b.date)  meta.push('✓ ' + fmtDate(b.date));

    return `
      <article class="card" data-id="${b.id}">
        <div class="card-top">
          <span class="badge ${esc(b.status)}">${st.label}</span>
          <div class="card-actions">
            <button class="icon-btn" data-action="edit" title="Редактировать">✎</button>
            <button class="icon-btn" data-action="delete" title="Удалить">✕</button>
          </div>
        </div>
        <h3>${esc(b.title)}</h3>
        ${b.author ? `<p class="author">${esc(b.author)}</p>` : ''}
        ${b.rating ? `<div class="stars">${starsHTML(b.rating)}</div>` : ''}
        ${b.review ? `<p class="review">${esc(b.review)}</p>` : ''}
        ${b.quote ? `<blockquote>«${esc(b.quote)}»</blockquote>` : ''}
        ${meta.length ? `<footer>${meta.map(m => `<span>${m}</span>`).join('')}</footer>` : ''}
      </article>`;
  }

  function render() {
    const grid = $('#grid');
    const list = visibleBooks();

    grid.innerHTML = list.length
      ? list.map(cardHTML).join('')
      : `<div class="empty" style="grid-column:1/-1">
           <div class="big">📖</div>
           <p>${books.length ? 'Ничего не найдено' : 'Дневник пока пуст'}</p>
           <p style="font-size:14px">${books.length ? 'Попробуй изменить фильтры или запрос' : 'Нажми «Добавить книгу», чтобы начать'}</p>
         </div>`;

    updateStats();
  }

  function updateStats() {
    const read  = books.filter(b => b.status === 'read');
    const pages = read.reduce((a, b) => a + (Number(b.pages) || 0), 0);
    const rated = books.filter(b => b.rating > 0);
    const avg = rated.length
      ? (rated.reduce((a, b) => a + b.rating, 0) / rated.length).toFixed(1)
      : '—';

    $('#statTotal').textContent  = books.length;
    $('#statRead').textContent   = read.length;
    $('#statPages').textContent  = pages.toLocaleString('ru-RU');
    $('#statRating').textContent = avg;
  }

  /* ---------- Звёзды в форме ---------- */
  function paintStars(v) {
    $$('#ratingInput button').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.star) <= v);
    });
  }

  $('#ratingInput').addEventListener('click', e => {
    const btn = e.target.closest('button[data-star]');
    if (!btn) return;
    const v = Number(btn.dataset.star);
    formRating = (formRating === v) ? 0 : v;
    paintStars(formRating);
  });
  $('#ratingInput').addEventListener('mouseover', e => {
    const btn = e.target.closest('button[data-star]');
    if (btn) paintStars(Number(btn.dataset.star));
  });
  $('#ratingInput').addEventListener('mouseleave', () => paintStars(formRating));

  /* ---------- Диалог ---------- */
  const dialog = $('#bookDialog');

  function openDialog(book = null) {
    editingId = book ? book.id : null;
    $('#dialogTitle').textContent = book ? 'Редактировать запись' : 'Новая книга';

    $('#f-title').value  = book?.title  || '';
    $('#f-author').value = book?.author || '';
    $('#f-genre').value  = book?.genre  || '';
    $('#f-pages').value  = book?.pages  || '';
    $('#f-status').value = book?.status || 'read';
    $('#f-date').value   = book?.date   || '';
    $('#f-review').value = book?.review || '';
    $('#f-quote').value  = book?.quote  || '';

    formRating = book?.rating || 0;
    paintStars(formRating);

    dialog.showModal();
    setTimeout(() => $('#f-title').focus(), 60);
  }

  $('#addBtn').addEventListener('click', () => openDialog());
  $('#cancelBtn').addEventListener('click', () => dialog.close());

  $('#bookForm').addEventListener('submit', e => {
    e.preventDefault();
    const title = $('#f-title').value.trim();
    if (!title) return;

    const data = {
      title,
      author: $('#f-author').value.trim(),
      genre:  $('#f-genre').value.trim(),
      pages:  Number($('#f-pages').value) || 0,
      status: $('#f-status').value,
      rating: formRating,
      date:   $('#f-date').value,
      review: $('#f-review').value.trim(),
      quote:  $('#f-quote').value.trim()
    };

    if (editingId) {
      const i = books.findIndex(b => b.id === editingId);
      if (i > -1) books[i] = { ...books[i], ...data };
    } else {
      books.push({ id: uid(), createdAt: Date.now(), ...data });
      filters.status = 'all';
      $$('#chips .chip').forEach(c => c.classList.toggle('active', c.dataset.status === 'all'));
    }

    save();
    render();
    dialog.close();
  });

  /* ---------- Действия с карточками ---------- */
  $('#grid').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.closest('.card').dataset.id;
    const book = books.find(b => b.id === id);
    if (!book) return;

    if (btn.dataset.action === 'edit') openDialog(book);

    if (btn.dataset.action === 'delete' &&
        confirm(`Удалить запись о книге «${book.title}»?`)) {
      books = books.filter(b => b.id !== id);
      save();
      render();
    }
  });

  /* ---------- Фильтры ---------- */
  $('#searchInput').addEventListener('input', e => {
    filters.search = e.target.value;
    render();
  });

  $('#chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    filters.status = chip.dataset.status;
    $$('#chips .chip').forEach(c => c.classList.toggle('active', c === chip));
    render();
  });

  $('#sortSelect').addEventListener('change', e => {
    filters.sort = e.target.value;
    render();
  });

  /* ---------- Экспорт / импорт ---------- */
  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(books, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `reading-diary-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#importInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error('bad format');
        if (!confirm(`Импортировать ${data.length} ${plural(data.length, ['запись','записи','записей'])}? Текущие данные будут заменены.`)) return;
        books = data.map(b => ({ ...b, id: b.id || uid(), createdAt: b.createdAt || Date.now() }));
        save();
        render();
      } catch (err) {
        alert('Не удалось прочитать файл. Нужен JSON, сохранённый этим дневником.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  /* ---------- Старт ---------- */
  render();
})();
