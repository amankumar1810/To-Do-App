/* =============================================
   DayFlow — App Logic
   ============================================= */

// ── Inject SVG gradient ──────────────────────
document.body.insertAdjacentHTML('afterbegin', `
  <svg width="0" height="0" style="position:absolute">
    <defs>
      <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#7c5cfc"/>
        <stop offset="100%" stop-color="#14b8a6"/>
      </linearGradient>
    </defs>
  </svg>
`);

// ── Storage helpers ──────────────────────────
const STORAGE_KEY = 'dayflow_data_v2';

function loadData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch { return {}; }
}
function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// dateKey format: YYYY-MM-DD  (uses LOCAL time, not UTC)
function dateKey(d) {
  const yr  = d.getFullYear();
  const mo  = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${day}`;
}
function todayKey() {
  return dateKey(new Date());
}
function getTasksForDay(data, key) {
  return data[key] || [];
}
function setTasksForDay(data, key, tasks) {
  data[key] = tasks;
  if (tasks.length === 0) delete data[key];
}

// ── State ────────────────────────────────────
let data = loadData();
let miniCalDate   = new Date();  // month shown in mini-cal
let calViewDate   = new Date();  // month shown in big calendar
let selectedDay   = null;        // dateKey of selected cal day
let activeTab     = 'today';

// ── Tab switching ────────────────────────────
const tabs = document.querySelectorAll('.nav-tab');
const views = { today: document.getElementById('viewToday'), calendar: document.getElementById('viewCalendar'), review: document.getElementById('viewReview') };

tabs.forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    tabs.forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[tab].classList.add('active');
    activeTab = tab;
    if (tab === 'calendar') renderBigCalendar();
    if (tab === 'review') renderReview();
    closeSidebar();
  });
});

// ── Sidebar mobile toggle ─────────────────────
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
document.addEventListener('click', e => {
  if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) closeSidebar();
});
function closeSidebar() { sidebar.classList.remove('open'); }

// ── Toast ─────────────────────────────────────
const toast = document.getElementById('toast');
let toastTimeout;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2200);
}

// ── TODAY VIEW ───────────────────────────────
const todaySubtitle  = document.getElementById('todaySubtitle');
const todayTaskList  = document.getElementById('todayTaskList');
const todayCompList  = document.getElementById('todayCompletedList');
const todayEmpty     = document.getElementById('todayEmptyState');
const compSection    = document.getElementById('completedSectionLabel');
const newTaskInput   = document.getElementById('newTaskInput');
const addTaskBtn     = document.getElementById('addTaskBtn');
const todayRingFill  = document.getElementById('todayRingFill');
const todayRingLabel = document.getElementById('todayRingLabel');
const sidebarProg    = document.getElementById('sidebarProgressBar');
const sidebarProgVal = document.getElementById('sidebarProgressVal');
const streakCount    = document.getElementById('streakCount');

function formatDateLong(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
function formatDateShort(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Status cycle: pending → done → partial → pending
function cycleStatus(status) {
  if (status === 'pending') return 'done';
  if (status === 'done')    return 'partial';
  return 'pending';
}

function statusIcon(status) {
  if (status === 'done')    return '✓';
  if (status === 'partial') return '◑';
  return '';
}
function statusHint(status) {
  if (status === 'pending') return 'Click: Done';
  if (status === 'done')    return 'Click: Partial';
  return 'Click: Pending';
}

function makeTaskEl(task, onStatusChange, onDelete) {
  const el = document.createElement('div');
  el.className = `task-item ${task.status !== 'pending' ? task.status : ''}`;
  el.dataset.id = task.id;
  el.innerHTML = `
    <button class="task-status-btn ${task.status !== 'pending' ? task.status : ''}" title="${statusHint(task.status)}" aria-label="Change status">
      ${statusIcon(task.status)}
    </button>
    <span class="task-text">${escHtml(task.text)}</span>
    <span class="task-hint">${statusHint(task.status)}</span>
    <button class="task-delete-btn" title="Delete task" aria-label="Delete task">✕</button>
  `;
  el.querySelector('.task-status-btn').addEventListener('click', () => onStatusChange(task.id));
  el.querySelector('.task-delete-btn').addEventListener('click', () => onDelete(task.id));
  return el;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderToday() {
  const key = todayKey();
  const tasks = getTasksForDay(data, key);
  todaySubtitle.textContent = formatDateLong(new Date());

  const pending   = tasks.filter(t => t.status === 'pending');
  const nonPending = tasks.filter(t => t.status !== 'pending');

  todayTaskList.innerHTML = '';
  todayCompList.innerHTML = '';

  if (pending.length === 0 && nonPending.length === 0) {
    todayEmpty.style.display = 'flex';
  } else {
    todayEmpty.style.display = 'none';
    pending.forEach(t => todayTaskList.appendChild(makeTaskEl(t, changeStatusToday, deleteTaskToday)));
    nonPending.forEach(t => todayCompList.appendChild(makeTaskEl(t, changeStatusToday, deleteTaskToday)));
  }

  compSection.style.display = nonPending.length > 0 ? 'block' : 'none';
  updateTodayProgress(tasks);
  updateSidebarStats();
  renderMiniCalendar();
}

function updateTodayProgress(tasks) {
  if (!tasks.length) {
    setRing(todayRingFill, todayRingLabel, 0);
    return;
  }
  const score = tasks.reduce((s, t) => s + (t.status === 'done' ? 1 : t.status === 'partial' ? 0.5 : 0), 0);
  const pct = Math.round((score / tasks.length) * 100);
  setRing(todayRingFill, todayRingLabel, pct);
}

function setRing(el, label, pct) {
  const circ = 213.6;
  el.style.strokeDashoffset = circ - (circ * pct / 100);
  label.textContent = pct + '%';
}

function updateSidebarStats() {
  const key   = todayKey();
  const tasks = getTasksForDay(data, key);
  let pct = 0;
  if (tasks.length) {
    const score = tasks.reduce((s, t) => s + (t.status === 'done' ? 1 : t.status === 'partial' ? 0.5 : 0), 0);
    pct = Math.round((score / tasks.length) * 100);
  }
  sidebarProg.style.width = pct + '%';
  sidebarProgVal.textContent = pct + '%';
  streakCount.textContent = calcStreak() + ' days';
}

function calcStreak() {
  let streak = 0;
  const d = new Date();
  // Check if today has tasks before counting it in streak
  while (true) {
    const key = dateKey(d);
    const tasks = getTasksForDay(data, key);
    if (tasks.length === 0) break;
    const score = tasks.reduce((s, t) => s + (t.status === 'done' ? 1 : t.status === 'partial' ? 0.5 : 0), 0);
    if (score / tasks.length < 0.5) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function addTaskToday() {
  const text = newTaskInput.value.trim();
  if (!text) return;
  const key   = todayKey();
  const tasks = getTasksForDay(data, key);
  tasks.push({ id: Date.now().toString(), text, status: 'pending', created: new Date().toISOString() });
  setTasksForDay(data, key, tasks);
  saveData(data);
  newTaskInput.value = '';
  renderToday();
  showToast('Task added!');
}

function changeStatusToday(id) {
  const key   = todayKey();
  const tasks = getTasksForDay(data, key);
  const task  = tasks.find(t => t.id === id);
  if (!task) return;
  task.status = cycleStatus(task.status);
  setTasksForDay(data, key, tasks);
  saveData(data);
  renderToday();
  const msgs = { done: '✅ Task completed!', partial: '🔶 Marked as partial', pending: '↩ Moved back to pending' };
  showToast(msgs[task.status]);
}

function deleteTaskToday(id) {
  const key   = todayKey();
  const tasks = getTasksForDay(data, key).filter(t => t.id !== id);
  setTasksForDay(data, key, tasks);
  saveData(data);
  renderToday();
  showToast('Task removed');
}

addTaskBtn.addEventListener('click', addTaskToday);
newTaskInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTaskToday(); });

// ── MINI CALENDAR ────────────────────────────
const miniCalGrid  = document.getElementById('miniCalGrid');
const miniCalMonth = document.getElementById('miniCalMonth');
document.getElementById('miniPrevMonth').addEventListener('click', () => { miniCalDate.setMonth(miniCalDate.getMonth() - 1); renderMiniCalendar(); });
document.getElementById('miniNextMonth').addEventListener('click', () => { miniCalDate.setMonth(miniCalDate.getMonth() + 1); renderMiniCalendar(); });

function renderMiniCalendar() {
  const yr = miniCalDate.getFullYear();
  const mo = miniCalDate.getMonth();
  miniCalMonth.textContent = new Date(yr, mo).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const firstDay = new Date(yr, mo, 1).getDay();
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const today = todayKey();

  miniCalGrid.innerHTML = '';

  // Padding days before
  for (let i = 0; i < firstDay; i++) {
    const prev = new Date(yr, mo, -firstDay + i + 1);
    const cell = document.createElement('div');
    cell.className = 'mini-cal-day other-month';
    cell.textContent = prev.getDate();
    miniCalGrid.appendChild(cell);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(new Date(yr, mo, d));
    const cell = document.createElement('div');
    cell.className = 'mini-cal-day';
    cell.textContent = d;
    if (key === today) cell.classList.add('today');
    if (key === selectedDay) cell.classList.add('selected');
    if (getTasksForDay(data, key).length > 0) cell.classList.add('has-tasks');
    cell.addEventListener('click', () => {
      selectedDay = key;
      // Navigate to calendar view for non-today days
      if (key !== today) {
        tabs.forEach(t => t.classList.remove('active'));
        document.getElementById('tabCalendar').classList.add('active');
        Object.values(views).forEach(v => v.classList.remove('active'));
        views.calendar.classList.add('active');
        calViewDate = new Date(yr, mo);
        renderBigCalendar();
        selectCalDay(key);
      }
      renderMiniCalendar();
    });
    miniCalGrid.appendChild(cell);
  }

  // Padding after
  const total = firstDay + daysInMonth;
  const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 1; i <= remaining; i++) {
    const cell = document.createElement('div');
    cell.className = 'mini-cal-day other-month';
    cell.textContent = i;
    miniCalGrid.appendChild(cell);
  }
}

// ── BIG CALENDAR ─────────────────────────────
const calGrid       = document.getElementById('calGrid');
const calMonthLabel = document.getElementById('calMonthLabel');
const calDayTitle   = document.getElementById('calDayTitle');
const calDayProgress= document.getElementById('calDayProgressText');
const calDayTaskList= document.getElementById('calDayTaskList');
const calEmpty      = document.getElementById('calEmptyState');
const calNewTaskInput = document.getElementById('calNewTaskInput');
const calAddTaskBtn = document.getElementById('calAddTaskBtn');

document.getElementById('calPrevMonth').addEventListener('click', () => { calViewDate.setMonth(calViewDate.getMonth() - 1); renderBigCalendar(); });
document.getElementById('calNextMonth').addEventListener('click', () => { calViewDate.setMonth(calViewDate.getMonth() + 1); renderBigCalendar(); });

function renderBigCalendar() {
  const yr = calViewDate.getFullYear();
  const mo = calViewDate.getMonth();
  calMonthLabel.textContent = new Date(yr, mo).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const firstDay   = new Date(yr, mo, 1).getDay();
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const today = todayKey();

  calGrid.innerHTML = '';

  for (let i = 0; i < firstDay; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-day other-month';
    const prev = new Date(yr, mo, -firstDay + i + 1);
    cell.innerHTML = `<span class="cal-day-number">${prev.getDate()}</span>`;
    calGrid.appendChild(cell);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key   = dateKey(new Date(yr, mo, d));
    const tasks = getTasksForDay(data, key);
    const cell  = document.createElement('div');
    cell.className = 'cal-day';
    if (key === today) cell.classList.add('today');
    if (key === selectedDay) cell.classList.add('selected');

    let dotsHtml = '<div class="cal-day-dots">';
    if (tasks.length) {
      const done   = tasks.filter(t => t.status === 'done').length;
      const part   = tasks.filter(t => t.status === 'partial').length;
      const pend   = tasks.filter(t => t.status === 'pending').length;
      if (done)  dotsHtml += `<span class="cal-dot done"></span>`;
      if (part)  dotsHtml += `<span class="cal-dot partial"></span>`;
      if (pend)  dotsHtml += `<span class="cal-dot pending"></span>`;
    }
    dotsHtml += '</div>';

    cell.innerHTML = `<span class="cal-day-number">${d}</span>${dotsHtml}`;
    cell.addEventListener('click', () => selectCalDay(key));
    calGrid.appendChild(cell);
  }

  const total = firstDay + daysInMonth;
  const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 1; i <= remaining; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-day other-month';
    cell.innerHTML = `<span class="cal-day-number">${i}</span>`;
    calGrid.appendChild(cell);
  }
}

function selectCalDay(key) {
  selectedDay = key;
  renderBigCalendar();
  renderMiniCalendar();
  renderCalDayPanel(key);
}

function renderCalDayPanel(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dayDate = new Date(y, m - 1, d);
  calDayTitle.textContent = dayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const tasks = getTasksForDay(data, key);
  calDayTaskList.innerHTML = '';

  if (tasks.length === 0) {
    calEmpty.style.display = 'flex';
    calDayProgress.textContent = '—';
  } else {
    calEmpty.style.display = 'none';
    tasks.forEach(t => calDayTaskList.appendChild(makeTaskEl(t,
      (id) => changeStatusCal(key, id),
      (id) => deleteTaskCal(key, id)
    )));
    const score = tasks.reduce((s, t) => s + (t.status === 'done' ? 1 : t.status === 'partial' ? 0.5 : 0), 0);
    const pct = Math.round((score / tasks.length) * 100);
    calDayProgress.textContent = pct + '% done';
  }
}

function addTaskCal() {
  if (!selectedDay) { showToast('Select a day first!'); return; }
  const text = calNewTaskInput.value.trim();
  if (!text) return;
  const tasks = getTasksForDay(data, selectedDay);
  tasks.push({ id: Date.now().toString(), text, status: 'pending', created: new Date().toISOString() });
  setTasksForDay(data, selectedDay, tasks);
  saveData(data);
  calNewTaskInput.value = '';
  renderCalDayPanel(selectedDay);
  renderBigCalendar();
  renderMiniCalendar();
  // Also re-render today if it's today
  if (selectedDay === todayKey()) renderToday();
  showToast('Task added!');
}

function changeStatusCal(key, id) {
  const tasks = getTasksForDay(data, key);
  const task  = tasks.find(t => t.id === id);
  if (!task) return;
  task.status = cycleStatus(task.status);
  setTasksForDay(data, key, tasks);
  saveData(data);
  renderCalDayPanel(key);
  renderBigCalendar();
  if (key === todayKey()) renderToday();
  const msgs = { done: '✅ Done!', partial: '🔶 Partial', pending: '↩ Pending' };
  showToast(msgs[task.status]);
}

function deleteTaskCal(key, id) {
  const tasks = getTasksForDay(data, key).filter(t => t.id !== id);
  setTasksForDay(data, key, tasks);
  saveData(data);
  renderCalDayPanel(key);
  renderBigCalendar();
  renderMiniCalendar();
  if (key === todayKey()) renderToday();
  showToast('Task removed');
}

calAddTaskBtn.addEventListener('click', addTaskCal);
calNewTaskInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTaskCal(); });

// ── REVIEW VIEW ──────────────────────────────
const reviewGrid      = document.getElementById('reviewGrid');
const reviewEmpty     = document.getElementById('reviewEmptyState');
const reviewSummary   = document.getElementById('reviewSummaryCards');
const reviewFilter    = document.getElementById('reviewFilter');

reviewFilter.addEventListener('change', renderReview);

function getScoreInfo(tasks) {
  if (!tasks.length) return { pct: 0, label: 'none', cls: 'none' };
  const score = tasks.reduce((s, t) => s + (t.status === 'done' ? 1 : t.status === 'partial' ? 0.5 : 0), 0);
  const pct = Math.round((score / tasks.length) * 100);
  let label, cls;
  if (pct === 100)    { label = '🌟 Perfect';    cls = 'excellent'; }
  else if (pct >= 75) { label = '✅ Great';      cls = 'good'; }
  else if (pct >= 50) { label = '🔶 Partial';   cls = 'partial'; }
  else if (pct > 0)   { label = '⚡ Low';        cls = 'low'; }
  else                { label = '—';              cls = 'none'; }
  return { pct, label, cls };
}

function renderReview() {
  const filter = reviewFilter.value;
  const today  = todayKey();
  const allKeys = Object.keys(data).sort().reverse();

  let keys = allKeys;
  if (filter === 'past') {
    keys = allKeys.filter(k => k < today);
  } else if (filter === 'week') {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const wKey = dateKey(weekAgo);
    keys = allKeys.filter(k => k >= wKey);
  } else if (filter === 'month') {
    const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
    const mKey = dateKey(monthAgo);
    keys = allKeys.filter(k => k >= mKey);
  }

  // Summary cards
  const totalDays   = keys.length;
  const totalTasks  = keys.reduce((s, k) => s + getTasksForDay(data, k).length, 0);
  const doneTasks   = keys.reduce((s, k) => s + getTasksForDay(data, k).filter(t => t.status === 'done').length, 0);
  const perfectDays = keys.filter(k => {
    const t = getTasksForDay(data, k);
    return t.length > 0 && t.every(t2 => t2.status === 'done');
  }).length;
  const avgPct = totalDays
    ? Math.round(keys.reduce((s, k) => {
        const t = getTasksForDay(data, k);
        if (!t.length) return s;
        const sc = t.reduce((a, t2) => a + (t2.status === 'done' ? 1 : t2.status === 'partial' ? 0.5 : 0), 0);
        return s + sc / t.length * 100;
      }, 0) / totalDays)
    : 0;

  reviewSummary.innerHTML = `
    <div class="summary-card">
      <span class="summary-card-label">Days Tracked</span>
      <span class="summary-card-val purple">${totalDays}</span>
      <span class="summary-card-sub">days with tasks</span>
    </div>
    <div class="summary-card">
      <span class="summary-card-label">Tasks Done</span>
      <span class="summary-card-val green">${doneTasks}</span>
      <span class="summary-card-sub">of ${totalTasks} total</span>
    </div>
    <div class="summary-card">
      <span class="summary-card-label">Avg Completion</span>
      <span class="summary-card-val amber">${avgPct}%</span>
      <span class="summary-card-sub">per day average</span>
    </div>
    <div class="summary-card">
      <span class="summary-card-label">Perfect Days</span>
      <span class="summary-card-val purple">${perfectDays}</span>
      <span class="summary-card-sub">100% completed</span>
    </div>
  `;

  reviewGrid.innerHTML = '';

  if (keys.length === 0) {
    reviewEmpty.style.display = 'flex';
    reviewGrid.appendChild(reviewEmpty);
    return;
  }
  reviewEmpty.style.display = 'none';

  keys.forEach(key => {
    const tasks = getTasksForDay(data, key);
    const done    = tasks.filter(t => t.status === 'done').length;
    const partial = tasks.filter(t => t.status === 'partial').length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const { pct, label, cls } = getScoreInfo(tasks);

    const card = document.createElement('div');
    card.className = 'review-card';
    card.innerHTML = `
      <div class="review-card-header">
        <span class="review-card-date">${formatDateShort(key)}${key === today ? ' · Today' : ''}</span>
        <span class="review-card-badge badge-${cls}">${label}</span>
      </div>
      <div class="review-progress-bar">
        <div class="review-progress-fill fill-${cls}" style="width:${pct}%"></div>
      </div>
      <div class="review-card-stats">
        <div class="review-stat">
          <span class="review-stat-num">${done}</span>
          <span class="review-stat-lbl">Done</span>
        </div>
        <div class="review-stat">
          <span class="review-stat-num">${partial}</span>
          <span class="review-stat-lbl">Partial</span>
        </div>
        <div class="review-stat">
          <span class="review-stat-num">${pending}</span>
          <span class="review-stat-lbl">Pending</span>
        </div>
        <div class="review-stat">
          <span class="review-stat-num">${tasks.length}</span>
          <span class="review-stat-lbl">Total</span>
        </div>
      </div>
    `;
    reviewGrid.appendChild(card);
  });
}

// ── Init ─────────────────────────────────────
function init() {
  // Select today in calendar state
  selectedDay = todayKey();
  renderToday();
  renderMiniCalendar();
  // Initialize calendar view month to current
  calViewDate = new Date();
}

// ── MY GOALS ─────────────────────────────────
const GOALS_KEY = 'dayflow_goals_v1';

const GOAL_CONFIG = {
  goals: {
    inputId:   'goalInputGoals',
    addBtnId:  'goalAddGoals',
    listId:    'goalListGoals',
    emptyId:   'goalEmptyGoals',
    countId:   'goalCountGoals',
    headerId:  'goalHeaderGoals',
    panelId:   'goalPanelGoals',
    bullet:    '⭐',
    toastAdd:  '⭐ Goal added!',
    toastDel:  'Goal removed',
  },
  do: {
    inputId:   'goalInputDo',
    addBtnId:  'goalAddDo',
    listId:    'goalListDo',
    emptyId:   'goalEmptyDo',
    countId:   'goalCountDo',
    headerId:  'goalHeaderDo',
    panelId:   'goalPanelDo',
    bullet:    '✅',
    toastAdd:  '✅ Habit added!',
    toastDel:  'Habit removed',
  },
  avoid: {
    inputId:   'goalInputAvoid',
    addBtnId:  'goalAddAvoid',
    listId:    'goalListAvoid',
    emptyId:   'goalEmptyAvoid',
    countId:   'goalCountAvoid',
    headerId:  'goalHeaderAvoid',
    panelId:   'goalPanelAvoid',
    bullet:    '🚫',
    toastAdd:  '🚫 Added to avoid list!',
    toastDel:  'Removed from avoid list',
  },
};

function loadGoals() {
  try { return JSON.parse(localStorage.getItem(GOALS_KEY)) || { goals: [], do: [], avoid: [] }; }
  catch { return { goals: [], do: [], avoid: [] }; }
}
function saveGoals(g) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(g));
}

function renderGoals(type) {
  const cfg   = GOAL_CONFIG[type];
  const goals = loadGoals();
  const items = goals[type] || [];
  const list  = document.getElementById(cfg.listId);
  const empty = document.getElementById(cfg.emptyId);
  const count = document.getElementById(cfg.countId);

  list.innerHTML = '';
  count.textContent = items.length;

  if (items.length === 0) {
    empty.style.display = 'block';
    list.appendChild(empty);
    return;
  }
  empty.style.display = 'none';

  items.forEach(item => {
    const el = document.createElement('div');
    el.className = `goal-item type-${type}`;
    el.innerHTML = `
      <span class="goal-bullet">${cfg.bullet}</span>
      <span class="goal-item-text">${escHtml(item.text)}</span>
      <button class="goal-del-btn" title="Remove" aria-label="Remove">✕</button>
    `;
    el.querySelector('.goal-del-btn').addEventListener('click', () => deleteGoal(type, item.id));
    list.appendChild(el);
  });
}

function addGoal(type) {
  const cfg   = GOAL_CONFIG[type];
  const input = document.getElementById(cfg.inputId);
  const text  = input.value.trim();
  if (!text) return;

  const goals = loadGoals();
  goals[type].push({ id: Date.now().toString(), text, created: new Date().toISOString() });
  saveGoals(goals);
  input.value = '';
  renderGoals(type);
  showToast(cfg.toastAdd);
}

function deleteGoal(type, id) {
  const cfg   = GOAL_CONFIG[type];
  const goals = loadGoals();
  goals[type] = goals[type].filter(i => i.id !== id);
  saveGoals(goals);
  renderGoals(type);
  showToast(cfg.toastDel);
}

// Wire up buttons + double-click expand per panel
Object.keys(GOAL_CONFIG).forEach(type => {
  const cfg = GOAL_CONFIG[type];

  // Add button + Enter key
  document.getElementById(cfg.addBtnId).addEventListener('click', () => addGoal(type));
  document.getElementById(cfg.inputId).addEventListener('keydown', e => {
    if (e.key === 'Enter') addGoal(type);
  });

  // Double-click header → toggle expanded
  const header = document.getElementById(cfg.headerId);
  const panel  = document.getElementById(cfg.panelId);
  if (header && panel) {
    header.addEventListener('dblclick', () => {
      panel.classList.toggle('expanded');
    });
  }
});

// ── Bootstrap ────────────────────────────────
// Called here (after ALL code above is defined) so GOAL_CONFIG is never
// in the temporal dead zone when init() or renderGoals() runs.
init();
renderGoals('goals');
renderGoals('do');
renderGoals('avoid');


