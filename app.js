'use strict';

let habits   = [];
let filters  = { category: 'all', color: 'all', sort: 'date' };
let detailId = null;

/* ════════════════════════════════════════
   UTILITAIRES DATE (local, jamais UTC)
════════════════════════════════════════ */

function localToday() {
  const d = new Date();
  return dateToStr(d);
}

function dateToStr(d) {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocal(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDisplay(str) {
  return parseLocal(str).toLocaleDateString('fr-FR', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
  });
}

function formatShort(str) {
  return parseLocal(str).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short'
  });
}

/* ════════════════════════════════════════
   CALCUL DE LA PROCHAINE OCCURRENCE
   days = tableau de numéros de jour (0=dim … 6=sam)
   fromStr = date YYYY-MM-DD à partir de laquelle chercher (incluse)
════════════════════════════════════════ */

function nextOccurrenceDate(days, fromStr) {
  if (!days || days.length === 0) return null;
  const sorted = [...days].sort((a, b) => a - b);
  const from   = parseLocal(fromStr);

  for (let i = 0; i < 14; i++) {          // on cherche sur 2 semaines max
    const d  = new Date(from);
    d.setDate(d.getDate() + i);
    const wd = d.getDay();                 // 0=dim … 6=sam
    if (sorted.includes(wd)) return dateToStr(d);
  }
  return null;
}

/* ════════════════════════════════════════
   GESTION DES OCCURRENCES
════════════════════════════════════════ */

/**
 * Crée la première occurrence d'une habitude (au moment de sa création).
 * fromStr = date de début choisie par l'utilisateur.
 */
function createFirstOccurrence(habit) {
  const nextDate = nextOccurrenceDate(habit.days, habit.startDate);
  if (nextDate) {
    habit.occurrences = [{ date: nextDate, status: 'pending' }];
  } else {
    habit.occurrences = [];
  }
}

/**
 * Valide l'occurrence active (pending) d'une habitude,
 * génère la suivante à partir du lendemain de la date validée,
 * puis supprime les occurrences 'done'.
 */
function validateOccurrence(habit) {
  const active = habit.occurrences.find(o => o.status === 'pending');
  if (!active) return;

  // Marquer comme faite
  active.status = 'done';

  // Générer la prochaine occurrence à partir du jour suivant
  const validatedDate = parseLocal(active.date);
  const nextFrom      = new Date(validatedDate);
  nextFrom.setDate(nextFrom.getDate() + 1);
  const nextDate = nextOccurrenceDate(habit.days, dateToStr(nextFrom));

  if (nextDate) {
    habit.occurrences.push({ date: nextDate, status: 'pending' });
  }

  // Nettoyer les occurrences 'done' (on ne garde que la pending)
  habit.occurrences = habit.occurrences.filter(o => o.status === 'pending');
}

/**
 * Annule la validation : on revient à l'état précédent.
 * On supprime l'occurrence pending actuelle et on remet
 * la précédente (date validée) en pending.
 */
function unvalidateOccurrence(habit, pendingDate) {
  // Supprimer l'occurrence pending générée après validation
  habit.occurrences = habit.occurrences.filter(o => o.date !== pendingDate);
  // Remettre l'occurrence précédente en pending
  if (!habit.occurrences.find(o => o.status === 'pending')) {
    // Retrouver la date précédente depuis l'historique
    // (stocké dans lastValidated)
    if (habit.lastValidated) {
      habit.occurrences.push({ date: habit.lastValidated, status: 'pending' });
      habit.lastValidated = null;
    }
  }
}

/* ════════════════════════════════════════
   CLASSIFICATION D'UNE OCCURRENCE
════════════════════════════════════════ */

function classifyOccurrence(occ) {
  if (!occ || occ.status !== 'pending') return null;
  const todayStr = localToday();
  if (occ.date === todayStr) return 'today';
  if (occ.date < todayStr)  return 'late';
  return 'upcoming';
}

function getActiveOccurrence(habit) {
  return habit.occurrences.find(o => o.status === 'pending') || null;
}

/* ════════════════════════════════════════
   CALCUL DES SÉRIES
   On compte les occurrences validées consécutives dans l'historique.
════════════════════════════════════════ */

function computeStreaks(habit) {
  const history = (habit.history || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const active  = getActiveOccurrence(habit);

  let maxStreak     = 0;
  let tempStreak    = 0;
  let currentStreak = 0;

  // Série max sur tout l'historique (validations consécutives sans retard)
  // On considère un break si le statut 'missed' est enregistré
  for (const entry of history) {
    if (entry.status === 'done') {
      tempStreak++;
      if (tempStreak > maxStreak) maxStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  }

  // Série en cours : on remonte depuis la fin
  // Pas de série si l'occurrence active est en retard
  const activeIsLate = active && classifyOccurrence(active) === 'late';
  if (!activeIsLate) {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].status === 'done') currentStreak++;
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
    const occ = getActiveOccurrence(h);
    const cl  = classifyOccurrence(occ);
    if (cl === 'today') countToday++;
    if (cl === 'late')  countLate++;
    const { current } = computeStreaks(h);
    if (current >= 2) countActive++;
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
    out.sort((a, b) => {
      const oa = getActiveOccurrence(a);
      const ob = getActiveOccurrence(b);
      const da = oa ? oa.date : '9999';
      const db = ob ? ob.date : '9999';
      return da.localeCompare(db);
    });
  } else if (filters.sort === 'mostDone') {
    out.sort((a, b) => (b.history || []).length - (a.history || []).length);
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

  const lateH     = habits.filter(h => classifyOccurrence(getActiveOccurrence(h)) === 'late');
  const todayH    = habits.filter(h => classifyOccurrence(getActiveOccurrence(h)) === 'today');
  const upcomingH = habits.filter(h => classifyOccurrence(getActiveOccurrence(h)) === 'upcoming');

  const lateList     = document.getElementById('lateList');
  const todayList    = document.getElementById('todayList');
  const upcomingList = document.getElementById('upcomingList');
  const lateSection  = document.getElementById('lateSection');

  lateList.innerHTML     = '';
  todayList.innerHTML    = '';
  upcomingList.innerHTML = '';

  /* — En retard — */
  const filteredLate = applyFiltersAndSort(lateH);
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
  const filteredUpcoming = applyFiltersAndSort(upcomingH);
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

function daysLabel(days) {
  const LABELS = ['D','L','M','M','J','V','S'];
  return (days || []).map(d => LABELS[d]).join(' · ');
}

function buildTodayCard(habit) {
  const card = document.createElement('div');
  card.className  = 'habit-card';
  card.dataset.id = habit.id;
  card.innerHTML  = `
    <div class="habit-color-bar ${habit.color}"></div>
    <div class="habit-info">
      <div class="habit-name">${escHtml(habit.name)}</div>
      <div class="habit-meta">
        <span class="habit-tag">${escHtml(habit.category)}</span>
        <span class="habit-days">${daysLabel(habit.days)}</span>
      </div>
    </div>
    <div class="habit-actions">
      <button class="btn-validate" data-id="${habit.id}">Valider</button>
    </div>`;
  card.addEventListener('click', e => { if (!e.target.closest('.btn-validate')) openDetail(habit.id); });
  card.querySelector('.btn-validate').addEventListener('click', e => {
    e.stopPropagation();
    doValidate(habit.id);
  });
  return card;
}

function buildLateCard(habit) {
  const occ  = getActiveOccurrence(habit);
  const card = document.createElement('div');
  card.className  = 'habit-card habit-card--late';
  card.dataset.id = habit.id;
  card.innerHTML  = `
    <div class="habit-color-bar ${habit.color}"></div>
    <div class="habit-info">
      <div class="habit-name">${escHtml(habit.name)}</div>
      <div class="habit-meta">
        <span class="habit-tag">${escHtml(habit.category)}</span>
        <span class="habit-days">${daysLabel(habit.days)}</span>
      </div>
      <div class="habit-late-date">Attendu le ${formatDisplay(occ.date)}</div>
    </div>
    <div class="habit-actions">
      <button class="btn-validate btn-validate--late" data-id="${habit.id}">Valider</button>
    </div>`;
  card.addEventListener('click', e => { if (!e.target.closest('.btn-validate')) openDetail(habit.id); });
  card.querySelector('.btn-validate').addEventListener('click', e => {
    e.stopPropagation();
    doValidate(habit.id);
  });
  return card;
}

function buildUpcomingCard(habit) {
  const occ  = getActiveOccurrence(habit);
  const card = document.createElement('div');
  card.className  = 'habit-card';
  card.dataset.id = habit.id;
  card.innerHTML  = `
    <div class="habit-color-bar ${habit.color}"></div>
    <div class="habit-info">
      <div class="habit-name">${escHtml(habit.name)}</div>
      <div class="habit-meta">
        <span class="habit-tag">${escHtml(habit.category)}</span>
        <span class="habit-days">${daysLabel(habit.days)}</span>
      </div>
    </div>
    <div class="habit-next-date">${occ ? formatShort(occ.date) : '—'}</div>`;
  card.addEventListener('click', () => openDetail(habit.id));
  return card;
}

/* ════════════════════════════════════════
   VALIDATION
════════════════════════════════════════ */

function doValidate(id) {
  const habit  = habits.find(h => h.id === id);
  if (!habit) return;
  const active = getActiveOccurrence(habit);
  if (!active) return;

  // Archiver dans l'historique
  habit.history = habit.history || [];
  habit.history.push({ date: active.date, status: 'done' });

  // Valider et générer la suivante
  validateOccurrence(habit);

  save();
  render();
}

/* ════════════════════════════════════════
   PERSISTANCE
════════════════════════════════════════ */

function save() { localStorage.setItem('myhabits_v2', JSON.stringify(habits)); }
function load() {
  try { habits = JSON.parse(localStorage.getItem('myhabits_v2')) || []; }
  catch { habits = []; }
}
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

/* ════════════════════════════════════════
   MODALS
════════════════════════════════════════ */

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

/* — Ajout — */
function openAddModal() {
  document.getElementById('modalTitle').textContent = 'Nouvelle habitude';
  document.getElementById('habitForm').reset();
  document.getElementById('habitStart').value = localToday();
  selectColor('bleu');
  // Décocher tous les jours
  document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
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

/* — Jours de la semaine — */
document.querySelectorAll('.day-btn').forEach(btn => {
  btn.addEventListener('click', () => btn.classList.toggle('active'));
});

function getSelectedDays() {
  return [...document.querySelectorAll('.day-btn.active')]
    .map(b => parseInt(b.dataset.day, 10));
}

/* — Formulaire — */
document.getElementById('habitForm').addEventListener('submit', e => {
  e.preventDefault();
  const name     = document.getElementById('habitName').value.trim();
  const category = document.getElementById('habitCategory').value;
  const start    = document.getElementById('habitStart').value;
  const days     = getSelectedDays();

  if (!name || !start || days.length === 0) {
    alert('Merci de renseigner un nom, une date de début et au moins un jour de répétition.');
    return;
  }

  const habit = {
    id: genId(),
    name,
    color:     selectedColor,
    category,
    startDate: start,
    days,
    occurrences: [],
    history:     [],
  };

  createFirstOccurrence(habit);
  habits.push(habit);
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
  const occ     = getActiveOccurrence(habit);
  const cl      = classifyOccurrence(occ);

  const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const daysStr   = (habit.days || []).map(d => DAY_NAMES[d]).join(', ');

  document.getElementById('detailName').textContent          = habit.name;
  document.getElementById('detailCategory').textContent      = habit.category;
  document.getElementById('detailStart').textContent         = formatDisplay(habit.startDate);
  document.getElementById('detailRepeat').textContent        = daysStr;
  document.getElementById('detailCount').textContent         = (habit.history || []).filter(h => h.status === 'done').length;
  document.getElementById('detailStreakCurrent').textContent = streaks.current >= 2 ? `${streaks.current} répétitions` : '—';
  document.getElementById('detailStreakMax').textContent     = streaks.max >= 2     ? `${streaks.max} répétitions`     : '—';

  // Prochaine occurrence
  const nextEl = document.getElementById('detailNext');
  if (nextEl) {
    if (occ && cl === 'upcoming') nextEl.textContent = formatDisplay(occ.date);
    else if (occ && cl === 'today') nextEl.textContent = 'Aujourd\'hui';
    else if (occ && cl === 'late') nextEl.textContent  = `En retard — ${formatDisplay(occ.date)}`;
    else nextEl.textContent = '—';
  }

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
