'use strict';

let habits = [];
let filters  = { category: 'all', color: 'all', sort: 'date' };
let detailId = null;

/* ════════════════════════════════════════
   UTILITAIRES DATE  (jamais d'UTC)
════════════════════════════════════════ */

function localToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocal(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dateToStr(d) {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplay(str) {
  return parseLocal(str).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

/* ════════════════════════════════════════
   CALCUL DES OCCURRENCES
════════════════════════════════════════ */

function allPastOccurrences(habit) {
  const todayStr = localToday();
  const start    = parseLocal(habit.startDate);
  const todayD   = parseLocal(todayStr);

  if (start > todayD) return [];

  const step  = habit.repeat;
  const dates = [];
  const cur   = new Date(start);

  while (cur <= todayD) {
    dates.push(dateToStr(cur));
    cur.setDate(cur.getDate() + step);
  }
  return dates;
}

function nextFutureOccurrence(habit) {
  const todayStr = localToday();
  const start    = parseLocal(habit.startDate);
  const todayD   = parseLocal(todayStr);
  const step     = habit.repeat;

  if (start > todayD) return habit.startDate;

  const diffDays = Math.round((todayD - start) / 86400000);
  const passed   = Math.floor(diffDays / step);
  const next     = new Date(start);
  next.setDate(next.getDate() + (passed + 1) * step);
  return dateToStr(next);
}

/* ════════════════════════════════════════
   CLASSIFICATION
════════════════════════════════════════ */

function classify(habit) {
  const todayStr = localToday();
  const past     = allPastOccurrences(habit);

  if (past.length === 0) return 'upcoming';

  const last      = past[past.length - 1];
  const validated = new Set(habit.validations || []);

  if (last === todayStr) {
    // Occurrence aujourd'hui : validée → à venir, sinon → aujourd'hui
    return validated.has(todayStr) ? 'upcoming' : 'today';
  }

  // last < today
  if (!validated.has(last)) return 'late';

  // Validée mais date passée → on attend la prochaine
  return 'upcoming';
}

/* ════════════════════════════════════════
   CALCUL DES SÉRIES
════════════════════════════════════════ */

function computeStreaks(habit) {
  const past      = allPastOccurrences(habit);
  const validated = new Set(habit.validations || []);

  let maxStreak  = 0;
  let tempStreak = 0;
  for (const d of past) {
    if (validated.has(d)) { tempStreak++; maxStreak = Math.max(maxStreak, tempStreak); }
    else tempStreak = 0;
  }

  let currentStreak = 0;
  if (classify(habit) !== 'late') {
    for (let i = past.length - 1; i >= 0; i--) {
      if (validated.has(past[i])) currentStreak++;
      else break;
    }
    if (currentStreak < 2) currentStreak = 0;
  }

  return { current: currentStreak, max: maxStreak };
}

/* ════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════ */

function updateDashboard() {
  let countToday  = 0;
  let countLate   = 0;
  let countActive = 0;
  const total     = habits.length;

  habits.forEach(h => {
    const cl = classify(h);
    if (cl === 'today') countToday++;
    if (cl === 'late')  countLate++;
    const { current } = computeStreaks(h);
    if (current >= 2)   countActive++;
  });

  document.getElementById('dashToday').textContent  = countToday;
  document.getElementById('dashLate').textContent   = countLate;
  document.getElementById('dashActive').textContent = countActive;
  document.getElementById('dashTotal').textContent  = total;
}

/* ════════════════════════════════════════
   FILTRES & TRI
════════════════════════════════════════ */

function applyFiltersAndSort(list) {
  let out = [...list];
  if (filters.category !== 'all') out = out.filter(h => h.category === filters.category);
  if (filters.color    !== 'all') out = out.filter(h => h.color    === filters.color);

  if (filters.sort === 'date') {
    out.sort((a, b) => a.startDate.localeCompare(b.startDate));
  } else if (filters.sort === 'mostDone') {
    out.sort((a, b) => (b.validations || []).length - (a.validations || []).length);
  } else if (filters.sort === 'name') {
    out.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }
  return out;
}

function updateFilterBar() {
  const bar   = document.getElementById('activeFilterBar');
  const text  = document.getElementById('activeFilterText');
  const parts = [];
  if (filters.category !== 'all') parts.push(`Catégorie : ${filters.category}`);
  if (filters.color    !== 'all') parts.push(`Couleur : ${filters.color}`);
  if (filters.sort     !== 'date') parts.push(`Tri : ${filters.sort === 'mostDone' ? 'Plus réalisées' : 'Nom A→Z'}`);
  bar.style.display = parts.length ? 'flex' : 'none';
  text.textContent  = parts.join(' · ');
}

/* ════════════════════════════════════════
   RENDU
════════════════════════════════════════ */

function render() {
  updateDashboard();
  updateFilterBar();

  const lateH     = habits.filter(h => classify(h) === 'late');
  const todayH    = habits.filter(h => classify(h) === 'today');
  const upcomingH = habits.filter(h => classify(h) === 'upcoming');

  const lateList     = document.getElementById('lateList');
  const todayList    = document.getElementById('todayList');
  const upcomingList = document.getElementById('upcomingList');
  const lateSection  = document.getElementById('lateSection');

  lateList.innerHTML     = '';
  todayList.innerHTML    = '';
  upcomingList.innerHTML = '';

  /* — En retard — */
  const filteredLate = applyFiltersAndSort(lateH)
    .sort((a, b) => {
      const pa = allPastOccurrences(a); const pb = allPastOccurrences(b);
      const da = pa[pa.length - 1] || ''; const db = pb[pb.length - 1] || '';
      return da.localeCompare(db);
    });

  lateSection.style.display = filteredLate.length ? 'flex' : 'none';
  filteredLate.forEach(h => lateList.appendChild(buildLateCard(h)));

  /* — Aujourd'hui — */
  const filteredToday = applyFiltersAndSort(todayH);
  if (filteredToday.length === 0) {
    todayList.innerHTML = '<div class="empty-state"><span>Aucune habitude pour aujourd\'hui 🎉</span></div>';
  } else {
    filteredToday.forEach(h => todayList.appendChild(buildTodayCard(h)));
  }

  /* — À venir — */
  const filteredUpcoming = applyFiltersAndSort(upcomingH).sort((a, b) => {
    const todayStr = localToday();
    const na = parseLocal(a.startDate) > parseLocal(todayStr) ? a.startDate : nextFutureOccurrence(a);
    const nb = parseLocal(b.startDate) > parseLocal(todayStr) ? b.startDate : nextFutureOccurrence(b);
    return na.localeCompare(nb);
  });
  if (filteredUpcoming.length === 0) {
    upcomingList.innerHTML = '<div class="empty-state"><span>Aucune habitude à venir</span></div>';
  } else {
    filteredUpcoming.forEach(h => upcomingList.appendChild(buildUpcomingCard(h)));
  }
}

/* ════════════════════════════════════════
   CONSTRUCTION DES CARTES
════════════════════════════════════════ */

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildTodayCard(habit) {
  const todayStr  = localToday();
  const validated = (habit.validations || []).includes(todayStr);
  const card      = document.createElement('div');
  card.className  = 'habit-card';
  card.dataset.id = habit.id;
  card.innerHTML  = `
    <div class="habit-color-bar ${habit.color}"></div>
    <div class="habit-info">
      <div class="habit-name">${escHtml(habit.name)}</div>
      <div class="habit-meta">
        <span class="habit-tag">${escHtml(habit.category)}</span>
        Tous les ${habit.repeat} j.
      </div>
    </div>
    <div class="habit-actions">
      <button class="btn-validate ${validated ? 'validated' : ''}" data-id="${habit.id}">
        ${validated ? '✓ Fait' : 'Valider'}
      </button>
    </div>`;
  card.addEventListener('click', e => { if (!e.target.closest('.btn-validate')) openDetail(habit.id); });
  card.querySelector('.btn-validate').addEventListener('click', e => {
    e.stopPropagation(); toggleValidation(habit.id);
  });
  return card;
}

function buildLateCard(habit) {
  const past      = allPastOccurrences(habit);
  const last      = past[past.length - 1];
  const validated = (habit.validations || []).includes(last);
  const card      = document.createElement('div');
  card.className  = 'habit-card habit-card--late';
  card.dataset.id = habit.id;
  card.innerHTML  = `
    <div class="habit-color-bar ${habit.color}"></div>
    <div class="habit-info">
      <div class="habit-name">${escHtml(habit.name)}</div>
      <div class="habit-meta">
        <span class="habit-tag">${escHtml(habit.category)}</span>
        Tous les ${habit.repeat} j.
      </div>
      <div class="habit-late-date">Attendu le ${formatDisplay(last)}</div>
    </div>
    <div class="habit-actions">
      <button class="btn-validate ${validated ? 'validated' : 'btn-validate--late'}" data-id="${habit.id}">
        ${validated ? '✓ Fait' : 'Valider'}
      </button>
    </div>`;
  card.addEventListener('click', e => { if (!e.target.closest('.btn-validate')) openDetail(habit.id); });
  card.querySelector('.btn-validate').addEventListener('click', e => {
    e.stopPropagation(); toggleValidationLate(habit.id);
  });
  return card;
}

function buildUpcomingCard(habit) {
  const todayStr = localToday();
  const nextDate = parseLocal(habit.startDate) > parseLocal(todayStr)
    ? habit.startDate
    : nextFutureOccurrence(habit);
  const card      = document.createElement('div');
  card.className  = 'habit-card';
  card.dataset.id = habit.id;
  card.innerHTML  = `
    <div class="habit-color-bar ${habit.color}"></div>
    <div class="habit-info">
      <div class="habit-name">${escHtml(habit.name)}</div>
      <div class="habit-meta">
        <span class="habit-tag">${escHtml(habit.category)}</span>
        Tous les ${habit.repeat} j.
      </div>
    </div>
    <div class="habit-next-date">${formatDisplay(nextDate)}</div>`;
  card.addEventListener('click', () => openDetail(habit.id));
  return card;
}

/* ════════════════════════════════════════
   VALIDATION
════════════════════════════════════════ */

function toggleValidation(id) {
  const habit    = habits.find(h => h.id === id);
  if (!habit) return;
  const todayStr = localToday();
  habit.validations = habit.validations || [];
  const idx = habit.validations.indexOf(todayStr);
  if (idx === -1) habit.validations.push(todayStr);
  else            habit.validations.splice(idx, 1);
  save();
  render();
}

function toggleValidationLate(id) {
  const habit = habits.find(h => h.id === id);
  if (!habit) return;
  const past  = allPastOccurrences(habit);
  const last  = past[past.length - 1];
  if (!last)  return;
  habit.validations = habit.validations || [];
  const idx = habit.validations.indexOf(last);
  if (idx === -1) habit.validations.push(last);
  else            habit.validations.splice(idx, 1);
  save();
  render();
}

/* ════════════════════════════════════════
   PERSISTANCE
════════════════════════════════════════ */

function save() { localStorage.setItem('myhabits_v1', JSON.stringify(habits)); }
function load() {
  try { habits = JSON.parse(localStorage.getItem('myhabits_v1')) || []; }
  catch { habits = []; }
}
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

/* ════════════════════════════════════════
   MODALS
════════════════════════════════════════ */

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function openAddModal() {
  document.getElementById('modalTitle').textContent = 'Nouvelle habitude';
  document.getElementById('habitForm').reset();
  document.getElementById('habitStart').value = localToday();
  selectColor('bleu');
  openModal('modalOverlay');
}

/* — Couleur — */
let selectedColor = 'bleu';
function selectColor(color) {
  selectedColor = color;
  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.classList.toggle('selected', dot.dataset.color === color);
  });
}
document.querySelectorAll('.color-dot').forEach(dot => {
  dot.addEventListener('click', () => selectColor(dot.dataset.color));
});

/* — Formulaire — */
document.getElementById('habitForm').addEventListener('submit', e => {
  e.preventDefault();
  const name     = document.getElementById('habitName').value.trim();
  const category = document.getElementById('habitCategory').value;
  const start    = document.getElementById('habitStart').value;
  const repeat   = parseInt(document.getElementById('habitRepeat').value, 10) || 1;
  if (!name || !start) return;
  habits.push({ id: genId(), name, color: selectedColor, category, startDate: start, repeat, validations: [] });
  save();
  closeModal('modalOverlay');
  render();
});

document.getElementById('btnAdd').addEventListener('click', openAddModal);
document.getElementById('cancelBtn').addEventListener('click', () => closeModal('modalOverlay'));
document.getElementById('modalClose').addEventListener('click', () => closeModal('modalOverlay'));
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal('modalOverlay');
});

/* — Détail — */
function openDetail(id) {
  const habit = habits.find(h => h.id === id);
  if (!habit) return;
  detailId = id;
  const streaks = computeStreaks(habit);
  document.getElementById('detailName').textContent          = habit.name;
  document.getElementById('detailCategory').textContent      = habit.category;
  document.getElementById('detailStart').textContent         = formatDisplay(habit.startDate);
  document.getElementById('detailRepeat').textContent        = `Tous les ${habit.repeat} jour${habit.repeat > 1 ? 's' : ''}`;
  document.getElementById('detailCount').textContent         = (habit.validations || []).length;
  document.getElementById('detailStreakCurrent').textContent = streaks.current >= 2 ? `${streaks.current} répétitions` : '—';
  document.getElementById('detailStreakMax').textContent     = streaks.max >= 2     ? `${streaks.max} répétitions`     : '—';
  openModal('detailOverlay');
}

document.getElementById('detailClose').addEventListener('click', () => closeModal('detailOverlay'));
document.getElementById('detailOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal('detailOverlay');
});
document.getElementById('detailDelete').addEventListener('click', () => {
  if (!detailId) return;
  if (!confirm('Supprimer cette habitude ?')) return;
  habits = habits.filter(h => h.id !== detailId);
  save();
  closeModal('detailOverlay');
  render();
});

/* ════════════════════════════════════════
   SIDEBAR & FILTRES
════════════════════════════════════════ */

const sidebar        = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
function openSidebar()  { sidebar.classList.add('open'); sidebarOverlay.classList.add('open'); }
function closeSidebar() { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('open'); }

document.getElementById('btnMenu').addEventListener('click', openSidebar);
document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const type  = chip.dataset.filter;
    const value = chip.dataset.value;
    if (!type) return;
    document.querySelectorAll(`.filter-chip[data-filter="${type}"]`).forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    filters[type] = value;
    render();
  });
});

function resetFiltersUI() {
  filters = { category: 'all', color: 'all', sort: 'date' };
  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('active',
      (c.dataset.filter !== 'sort' && c.dataset.value === 'all') ||
      (c.dataset.filter === 'sort' && c.dataset.value === 'date')
    );
  });
  render();
}

document.getElementById('resetFilters').addEventListener('click', () => { resetFiltersUI(); closeSidebar(); });
document.getElementById('clearFilter').addEventListener('click', resetFiltersUI);

/* ════════════════════════════════════════
   INIT
════════════════════════════════════════ */
load();
render();
