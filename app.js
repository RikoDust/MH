'use strict';

let habits = [];
let filters = { category: 'all', color: 'all', sort: 'date' };
let detailId = null;

/* ── Helpers date ── */
const today = () => new Date().toISOString().split('T')[0];

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function formatDate(str) {
  return parseDate(str).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Retourne toutes les dates d'occurrence depuis la date de début jusqu'à aujourd'hui inclus.
 */
function allOccurrences(habit) {
  const start   = parseDate(habit.startDate);
  const nowDate = parseDate(today());
  const step    = habit.repeat;
  const dates   = [];
  const cur     = new Date(start);
  while (cur <= nowDate) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + step);
  }
  return dates;
}

/**
 * La dernière occurrence passée ou aujourd'hui.
 */
function lastOccurrence(habit) {
  const occ = allOccurrences(habit);
  return occ.length ? occ[occ.length - 1] : null;
}

/**
 * La prochaine occurrence après aujourd'hui.
 */
function nextFutureOccurrence(habit) {
  const start   = parseDate(habit.startDate);
  const nowDate = parseDate(today());
  const step    = habit.repeat;
  const diff    = Math.floor((nowDate - start) / 86400000);
  if (diff < 0) return habit.startDate;
  const passed  = Math.floor(diff / step);
  const next    = new Date(start);
  next.setDate(next.getDate() + (passed + 1) * step);
  return next.toISOString().split('T')[0];
}

/** L'habitude est-elle à faire aujourd'hui (date de départ ≤ aujourd'hui ET dernière occurrence = aujourd'hui) ? */
function isDueToday(habit) {
  if (parseDate(habit.startDate) > parseDate(today())) return false;
  return lastOccurrence(habit) === today();
}

/** L'habitude est-elle en retard ? (au moins une occurrence passée non validée, et sa dernière occurrence n'est PAS aujourd'hui) */
function isLate(habit) {
  if (parseDate(habit.startDate) > parseDate(today())) return false;
  const last = lastOccurrence(habit);
  if (!last || last === today()) return false;
  // En retard si la dernière occurrence passée n'est pas validée
  return !(habit.validations || []).includes(last);
}

/* ── Calcul des séries ── */
function computeStreaks(habit) {
  const occ       = allOccurrences(habit);
  const validated = new Set(habit.validations || []);

  let maxStreak     = 0;
  let currentStreak = 0;
  let tempStreak    = 0;

  for (let i = 0; i < occ.length; i++) {
    if (validated.has(occ[i])) {
      tempStreak++;
      if (tempStreak > maxStreak) maxStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  }

  // Série en cours : on remonte depuis la dernière occurrence
  for (let i = occ.length - 1; i >= 0; i--) {
    if (validated.has(occ[i])) currentStreak++;
    else break;
  }

  return { current: currentStreak, max: maxStreak };
}

/* ── Persistance ── */
function save() { localStorage.setItem('myhabits_v1', JSON.stringify(habits)); }
function load() {
  try { habits = JSON.parse(localStorage.getItem('myhabits_v1')) || []; }
  catch { habits = []; }
}
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

/* ── Dashboard ── */
function updateDashboard() {
  let done = 0, late = 0;
  habits.forEach(h => {
    if (parseDate(h.startDate) > parseDate(today())) return;
    const last = lastOccurrence(h);
    if (!last) return;
    if ((h.validations || []).includes(last)) done++;
    else late++;
  });
  document.getElementById('dashDone').textContent  = done;
  document.getElementById('dashLate').textContent  = late;
  document.getElementById('dashTotal').textContent = habits.length;
}

/* ── Filtres ── */
function applyFiltersAndSort(list) {
  let out = [...list];
  if (filters.category !== 'all') out = out.filter(h => h.category === filters.category);
  if (filters.color !== 'all')    out = out.filter(h => h.color === filters.color);
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
  if (filters.color !== 'all')    parts.push(`Couleur : ${filters.color}`);
  if (filters.sort !== 'date')    parts.push(`Tri : ${filters.sort === 'mostDone' ? 'Plus réalisées' : 'Nom A→Z'}`);
  bar.style.display = parts.length ? 'flex' : 'none';
  text.textContent  = parts.join(' · ');
}

/* ── Rendu ── */
function render() {
  updateDashboard();
  updateFilterBar();

  const todayStr  = today();
  const lateH     = habits.filter(h => isLate(h));
  const todayH    = habits.filter(h => isDueToday(h));
  const upcomingH = habits.filter(h =>
    parseDate(h.startDate) > parseDate(todayStr) ||
    (!isDueToday(h) && !isLate(h) && nextFutureOccurrence(h) > todayStr)
  );

  const lateList     = document.getElementById('lateList');
  const todayList    = document.getElementById('todayList');
  const upcomingList = document.getElementById('upcomingList');
  const lateSection  = document.getElementById('lateSection');

  lateList.innerHTML     = '';
  todayList.innerHTML    = '';
  upcomingList.innerHTML = '';

  // Zone En retard
  const filteredLate = applyFiltersAndSort(lateH)
    .sort((a, b) => lastOccurrence(a).localeCompare(lastOccurrence(b)));
  if (filteredLate.length === 0) {
    lateSection.style.display = 'none';
  } else {
    lateSection.style.display = 'flex';
    filteredLate.forEach(h => lateList.appendChild(buildLateCard(h)));
  }

  // Zone Aujourd'hui
  const filteredToday = applyFiltersAndSort(todayH);
  if (filteredToday.length === 0) {
    todayList.innerHTML = '<div class="empty-state"><span>Aucune habitude pour aujourd\'hui 🎉</span></div>';
  } else {
    filteredToday.forEach(h => todayList.appendChild(buildTodayCard(h)));
  }

  // Zone À venir
  const filteredUpcoming = applyFiltersAndSort(upcomingH)
    .sort((a, b) => {
      const na = parseDate(a.startDate) > parseDate(todayStr) ? a.startDate : nextFutureOccurrence(a);
      const nb = parseDate(b.startDate) > parseDate(todayStr) ? b.startDate : nextFutureOccurrence(b);
      return na.localeCompare(nb);
    });
  if (filteredUpcoming.length === 0) {
    upcomingList.innerHTML = '<div class="empty-state"><span>Aucune habitude à venir</span></div>';
  } else {
    filteredUpcoming.forEach(h => upcomingList.appendChild(buildUpcomingCard(h)));
  }
}

/* ── Construction des cartes ── */
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildTodayCard(habit) {
  const last      = lastOccurrence(habit) || today();
  const validated = (habit.validations || []).includes(last);
  const card = document.createElement('div');
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
  card.querySelector('.btn-validate').addEventListener('click', e => { e.stopPropagation(); toggleValidation(habit.id); });
  return card;
}

function buildLateCard(habit) {
  const last      = lastOccurrence(habit);
  const validated = (habit.validations || []).includes(last);
  const card = document.createElement('div');
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
      <div class="habit-late-date">Attendu le ${formatDate(last)}</div>
    </div>
    <div class="habit-actions">
      <button class="btn-validate ${validated ? 'validated' : 'btn-validate--late'}" data-id="${habit.id}">
        ${validated ? '✓ Fait' : 'Valider'}
      </button>
    </div>`;
  card.addEventListener('click', e => { if (!e.target.closest('.btn-validate')) openDetail(habit.id); });
  card.querySelector('.btn-validate').addEventListener('click', e => { e.stopPropagation(); toggleValidation(habit.id); });
  return card;
}

function buildUpcomingCard(habit) {
  const todayStr = today();
  const nextDate = parseDate(habit.startDate) > parseDate(todayStr)
    ? habit.startDate
    : nextFutureOccurrence(habit);
  const card = document.createElement('div');
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
    <div class="habit-next-date">${formatDate(nextDate)}</div>`;
  card.addEventListener('click', () => openDetail(habit.id));
  return card;
}

/* ── Validation ── */
function toggleValidation(id) {
  const habit = habits.find(h => h.id === id);
  if (!habit) return;
  const last = lastOccurrence(habit) || today();
  habit.validations = habit.validations || [];
  const idx = habit.validations.indexOf(last);
  if (idx === -1) habit.validations.push(last);
  else habit.validations.splice(idx, 1);
  save();
  render();
}

/* ── Modal ajout ── */
function openAddModal() {
  document.getElementById('modalTitle').textContent = 'Nouvelle habitude';
  document.getElementById('habitForm').reset();
  document.getElementById('habitStart').value = today();
  selectColor('bleu');
  openModal('modalOverlay');
}
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

/* ── Couleur ── */
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

/* ── Formulaire ── */
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

/* ── Détail ── */
function openDetail(id) {
  const habit = habits.find(h => h.id === id);
  if (!habit) return;
  detailId = id;
  const streaks = computeStreaks(habit);
  document.getElementById('detailName').textContent          = habit.name;
  document.getElementById('detailCategory').textContent      = habit.category;
  document.getElementById('detailStart').textContent         = formatDate(habit.startDate);
  document.getElementById('detailRepeat').textContent        = `Tous les ${habit.repeat} jour${habit.repeat > 1 ? 's' : ''}`;
  document.getElementById('detailCount').textContent         = (habit.validations || []).length;
  document.getElementById('detailStreakCurrent').textContent = streaks.current;
  document.getElementById('detailStreakMax').textContent     = streaks.max;
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

/* ── Sidebar ── */
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

document.getElementById('resetFilters').addEventListener('click', () => {
  filters = { category: 'all', color: 'all', sort: 'date' };
  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('active',
      (c.dataset.filter !== 'sort' && c.dataset.value === 'all') ||
      (c.dataset.filter === 'sort' && c.dataset.value === 'date')
    );
  });
  render();
  closeSidebar();
});

document.getElementById('clearFilter').addEventListener('click', () => {
  filters = { category: 'all', color: 'all', sort: 'date' };
  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('active',
      (c.dataset.filter !== 'sort' && c.dataset.value === 'all') ||
      (c.dataset.filter === 'sort' && c.dataset.value === 'date')
    );
  });
  render();
});

/* ── Init ── */
load();
render();
