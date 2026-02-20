/* ================================================
   TASKLY — app.js
   ================================================ */

/* ════════════════════════════════════════
   STATE
════════════════════════════════════════ */
let tasks        = [];
let activeFilter = 'all';
let activeCat    = '';
let searchQ      = '';
let editingId    = null;
let dragSrcId    = null;

/* ════════════════════════════════════════
   CONSTANTS / HELPERS
════════════════════════════════════════ */
const TODAY = () => new Date().toISOString().split('T')[0];

const CAT_COLORS = {
  work:     '#5b8dee',
  personal: '#e07b39',
  health:   '#52c98a',
  shopping: '#a86ee0',
  study:    '#f4c430',
  finance:  '#e05252',
};

const CAT_EMOJIS = {
  work:     '💼',
  personal: '🏠',
  health:   '💪',
  shopping: '🛒',
  study:    '📚',
  finance:  '💰',
};

/** Generate a unique ID */
function uuid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** Escape HTML special characters */
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Human-readable relative time */
function timeAgo(ts) {
  const d = Date.now() - ts;
  if (d < 60_000)     return 'just now';
  if (d < 3_600_000)  return Math.floor(d / 60_000)    + 'm ago';
  if (d < 86_400_000) return Math.floor(d / 3_600_000) + 'h ago';
  return Math.floor(d / 86_400_000) + 'd ago';
}

/** Is the task past its due date? */
function isOverdue(task) {
  return task.dueDate && !task.done && task.dueDate < TODAY();
}

/** Is the task due within the next 2 days? */
function isDueSoon(task) {
  if (!task.dueDate || task.done) return false;
  const diff = (new Date(task.dueDate) - new Date(TODAY())) / 86_400_000;
  return diff >= 0 && diff <= 2;
}

/* ════════════════════════════════════════
   LOCAL STORAGE
════════════════════════════════════════ */
function saveTasks() {
  localStorage.setItem('taskly_tasks', JSON.stringify(tasks));
}

function loadTasks() {
  try {
    tasks = JSON.parse(localStorage.getItem('taskly_tasks')) || [];
  } catch {
    tasks = [];
  }
}

function loadTheme() {
  const theme = localStorage.getItem('taskly_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeToggle').textContent = theme === 'dark' ? '🌙' : '☀️';
}

/* ════════════════════════════════════════
   TOAST NOTIFICATION
════════════════════════════════════════ */
function toast(msg, duration = 2400) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), duration);
}

/* ════════════════════════════════════════
   STATS
════════════════════════════════════════ */
function updateStats() {
  const total   = tasks.length;
  const done    = tasks.filter(t => t.done).length;
  const pending = total - done;
  const overdue = tasks.filter(isOverdue).length;
  const pct     = total ? Math.round((done / total) * 100) : 0;

  document.getElementById('sTotal').textContent   = total;
  document.getElementById('sDone').textContent     = done;
  document.getElementById('sPending').textContent  = pending;
  document.getElementById('sOverdue').textContent  = overdue;
  document.getElementById('progressPct').textContent  = pct + '%';
  document.getElementById('progressFill').style.width = pct + '%';
}

/* ════════════════════════════════════════
   CATEGORY CHIPS
════════════════════════════════════════ */
function renderCategoryChips() {
  const cats = [...new Set(tasks.map(t => t.category).filter(Boolean))];
  const wrap = document.getElementById('categoryChips');
  wrap.innerHTML = '';
  if (!cats.length) return;

  // "All" chip
  const allChip = document.createElement('span');
  allChip.className = 'chip' + (!activeCat ? ' active' : '');
  allChip.textContent = 'All';
  allChip.style.cssText = !activeCat
    ? 'background:#f4c430; border-color:#f4c430; color:#111'
    : 'background:var(--surface); border-color:#f4c430; color:#f4c430';
  allChip.addEventListener('click', () => { activeCat = ''; renderCategoryChips(); renderTasks(); });
  wrap.appendChild(allChip);

  // Per-category chips
  cats.forEach(cat => {
    const col  = CAT_COLORS[cat] || '#888';
    const chip = document.createElement('span');
    chip.className = 'chip' + (activeCat === cat ? ' active' : '');
    chip.textContent = (CAT_EMOJIS[cat] || '') + ' ' + cat.charAt(0).toUpperCase() + cat.slice(1);
    chip.style.cssText = activeCat === cat
      ? `background:${col}; border-color:${col}; color:#fff`
      : `background:var(--surface); border-color:${col}; color:${col}`;
    chip.addEventListener('click', () => {
      activeCat = (activeCat === cat) ? '' : cat;
      renderCategoryChips();
      renderTasks();
    });
    wrap.appendChild(chip);
  });
}

/* ════════════════════════════════════════
   FILTER & SORT
════════════════════════════════════════ */
function getFilteredTasks() {
  let list = [...tasks];

  // Category filter
  if (activeCat) list = list.filter(t => t.category === activeCat);

  // Search filter
  if (searchQ) {
    const q = searchQ.toLowerCase();
    list = list.filter(t =>
      t.text.toLowerCase().includes(q)        ||
      (t.note || '').toLowerCase().includes(q)||
      (t.category || '').toLowerCase().includes(q)
    );
  }

  // Status filter
  if (activeFilter === 'active') list = list.filter(t => !t.done);
  if (activeFilter === 'done')   list = list.filter(t => t.done);
  if (activeFilter === 'overdue') list = list.filter(isOverdue);
  if (activeFilter === 'pinned')  list = list.filter(t => t.pinned);

  // Sort
  const sortVal = document.getElementById('sortSelect').value;

  if (sortVal !== 'manual') {
    list.sort((a, b) => {
      // Pinned always first
      if (a.pinned !== b.pinned) return b.pinned - a.pinned;

      switch (sortVal) {
        case 'date-desc': return b.createdAt - a.createdAt;
        case 'date-asc':  return a.createdAt - b.createdAt;
        case 'alpha':     return a.text.localeCompare(b.text);
        case 'due':
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.localeCompare(b.dueDate);
        case 'priority': {
          const order = { high: 0, medium: 1, low: 2 };
          return order[a.priority] - order[b.priority];
        }
        default: return 0;
      }
    });
  }

  return list;
}

/* ════════════════════════════════════════
   BUILD TASK CARD HTML
════════════════════════════════════════ */
function buildTaskCard(task) {
  // Priority badge
  const priorityBadge =
    task.priority === 'high' ? '<span class="badge badge-high">High</span>'  :
    task.priority === 'low'  ? '<span class="badge badge-low">Low</span>'    :
                               '<span class="badge badge-medium">Med</span>';

  // Category badge
  const catCol   = CAT_COLORS[task.category] || '#888';
  const catBadge = task.category
    ? `<span class="badge badge-cat" style="background:${catCol}">${CAT_EMOJIS[task.category] || ''} ${task.category}</span>`
    : '';

  // Pin indicator
  const pinIcon = task.pinned ? '<span class="pin-icon">📌</span>' : '';

  // Due-date string
  let dueStr = '';
  if (task.dueDate) {
    dueStr = isOverdue(task)
      ? `<span class="due-overdue">⚠ ${task.dueDate}</span>`
      : isDueSoon(task)
        ? `<span class="due-soon">⏰ Due ${task.dueDate}</span>`
        : `📅 ${task.dueDate}`;
  }

  // Subtask progress
  const subs    = task.subtasks || [];
  const subDone = subs.filter(s => s.done).length;
  const subStr  = subs.length ? `<span>📎 ${subDone}/${subs.length} subtasks</span>` : '';

  // Note
  const noteHtml = task.note ? `<div class="todo-note">📝 ${escHtml(task.note)}</div>` : '';

  // Colour dot
  const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${task.color || 'transparent'};vertical-align:middle;margin-right:4px;"></span>`;

  // Subtasks list
  const subtaskRows = subs.map(s => `
    <div class="subtask-row">
      <div class="subtask-check ${s.done ? 'done' : ''}" data-tid="${task.id}" data-sid="${s.id}"></div>
      <span class="subtask-text ${s.done ? 'done' : ''}">${escHtml(s.text)}</span>
      <span class="subtask-del"  data-tid="${task.id}" data-sid="${s.id}">✕</span>
    </div>
  `).join('');

  const subtasksHtml = `
    <div class="subtasks-wrap">
      ${subtaskRows}
      <div class="add-subtask-row">
        <input class="subtask-input" placeholder="Add subtask…" data-tid="${task.id}" maxlength="100"/>
        <button class="subtask-add-btn" data-tid="${task.id}">+ Add</button>
      </div>
    </div>
  `;

  return `
    <div class="todo-check" data-id="${task.id}">
      <span class="todo-check-tick">✓</span>
    </div>

    <div class="todo-body">
      <div class="todo-header">
        ${colorDot}${pinIcon}
        <span class="todo-text">${escHtml(task.text)}</span>
        ${priorityBadge} ${catBadge}
      </div>
      <div class="todo-meta">
        ${dueStr ? `<span>${dueStr}</span>` : ''}
        ${subStr}
        <span style="opacity:.5;font-size:.73rem">Added ${timeAgo(task.createdAt)}</span>
      </div>
      ${noteHtml}
      ${subtasksHtml}
    </div>

    <div class="todo-actions">
      <div class="act-btn pin"  data-id="${task.id}" title="Pin">📌</div>
      <div class="act-btn edit" data-id="${task.id}" title="Edit">✏️</div>
      <div class="act-btn del"  data-id="${task.id}" title="Delete">🗑️</div>
    </div>
  `;
}

/* ════════════════════════════════════════
   RENDER TASKS
════════════════════════════════════════ */
function renderTasks() {
  updateStats();
  renderCategoryChips();

  const filteredList = getFilteredTasks();
  const container    = document.getElementById('todoList');
  const emptyState   = document.getElementById('emptyState');

  container.innerHTML = '';

  if (!filteredList.length) {
    emptyState.style.display = '';
    return;
  }
  emptyState.style.display = 'none';

  filteredList.forEach(task => {
    const item = document.createElement('div');
    item.className = [
      'todo-item',
      task.done   ? 'done'   : '',
      task.pinned ? 'pinned' : '',
    ].filter(Boolean).join(' ');

    item.dataset.id       = task.id;
    item.dataset.priority = task.priority || 'medium';
    item.setAttribute('draggable', 'true');
    item.innerHTML = buildTaskCard(task);

    // ── Drag & Drop ──
    item.addEventListener('dragstart', () => {
      dragSrcId = task.id;
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => item.classList.remove('dragging'));
    item.addEventListener('dragover', e => { e.preventDefault(); item.classList.add('drag-over'); });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', e => {
      e.preventDefault();
      item.classList.remove('drag-over');
      if (dragSrcId && dragSrcId !== task.id) {
        const srcIdx  = tasks.findIndex(t => t.id === dragSrcId);
        const destIdx = tasks.findIndex(t => t.id === task.id);
        if (srcIdx > -1 && destIdx > -1) {
          const [moved] = tasks.splice(srcIdx, 1);
          tasks.splice(destIdx, 0, moved);
          document.getElementById('sortSelect').value = 'manual';
          saveTasks();
          renderTasks();
        }
      }
    });

    container.appendChild(item);
  });

  // ── Bind events after DOM insertion ──
  bindTaskEvents(container);
}

/** Attach all delegated events on the list container */
function bindTaskEvents(container) {
  // Toggle complete
  container.querySelectorAll('.todo-check').forEach(el =>
    el.addEventListener('click', () => toggleDone(el.dataset.id))
  );

  // Action buttons
  container.querySelectorAll('.act-btn.pin').forEach(el =>
    el.addEventListener('click', () => togglePin(el.dataset.id))
  );
  container.querySelectorAll('.act-btn.edit').forEach(el =>
    el.addEventListener('click', () => openEditModal(el.dataset.id))
  );
  container.querySelectorAll('.act-btn.del').forEach(el =>
    el.addEventListener('click', () => deleteTask(el.dataset.id))
  );

  // Subtask toggle
  container.querySelectorAll('.subtask-check').forEach(el =>
    el.addEventListener('click', () => toggleSubtask(el.dataset.tid, el.dataset.sid))
  );

  // Subtask delete
  container.querySelectorAll('.subtask-del').forEach(el =>
    el.addEventListener('click', () => deleteSubtask(el.dataset.tid, el.dataset.sid))
  );

  // Subtask add — button
  container.querySelectorAll('.subtask-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = container.querySelector(`.subtask-input[data-tid="${btn.dataset.tid}"]`);
      if (inp && inp.value.trim()) {
        addSubtask(btn.dataset.tid, inp.value.trim());
        inp.value = '';
      }
    });
  });

  // Subtask add — Enter key
  container.querySelectorAll('.subtask-input').forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && inp.value.trim()) {
        addSubtask(inp.dataset.tid, inp.value.trim());
        inp.value = '';
      }
    });
  });
}

/* ════════════════════════════════════════
   TASK CRUD
════════════════════════════════════════ */
function addTask() {
  const text = document.getElementById('taskInput').value.trim();
  if (!text) { toast('⚠️ Please enter a task'); return; }

  const task = {
    id:         uuid(),
    text,
    done:       false,
    pinned:     false,
    priority:   document.getElementById('prioritySelect').value,
    category:   document.getElementById('categorySelect').value,
    dueDate:    document.getElementById('dueDateInput').value,
    color:      document.getElementById('colorPicker').value,
    note:       '',
    subtasks:   [],
    createdAt:  Date.now(),
  };

  tasks.unshift(task);
  saveTasks();

  document.getElementById('taskInput').value  = '';
  document.getElementById('dueDateInput').value = '';

  renderTasks();
  toast('✅ Task added!');

  // Pop animation on the first card
  document.getElementById('todoList').firstElementChild?.classList.add('pop');
}

function toggleDone(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.done = !task.done;
  saveTasks();
  renderTasks();
  toast(task.done ? '🎉 Completed!' : '↩️ Marked active');
}

function togglePin(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.pinned = !task.pinned;
  saveTasks();
  renderTasks();
  toast(task.pinned ? '📌 Pinned!' : 'Unpinned');
}

function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  renderTasks();
  toast('🗑️ Task deleted');
}

/* ════════════════════════════════════════
   SUBTASKS
════════════════════════════════════════ */
function addSubtask(tid, text) {
  const task = tasks.find(t => t.id === tid);
  if (!task) return;
  if (!task.subtasks) task.subtasks = [];
  task.subtasks.push({ id: uuid(), text, done: false });
  saveTasks();
  renderTasks();
}

function toggleSubtask(tid, sid) {
  const task = tasks.find(t => t.id === tid);
  if (!task) return;
  const sub = task.subtasks?.find(s => s.id === sid);
  if (sub) { sub.done = !sub.done; saveTasks(); renderTasks(); }
}

function deleteSubtask(tid, sid) {
  const task = tasks.find(t => t.id === tid);
  if (!task) return;
  task.subtasks = task.subtasks.filter(s => s.id !== sid);
  saveTasks();
  renderTasks();
}

/* ════════════════════════════════════════
   EDIT MODAL
════════════════════════════════════════ */
function openEditModal(id) {
  editingId = id;
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  document.getElementById('editText').value     = task.text;
  document.getElementById('editNote').value     = task.note     || '';
  document.getElementById('editPriority').value = task.priority || 'medium';
  document.getElementById('editCategory').value = task.category || '';
  document.getElementById('editDueDate').value  = task.dueDate  || '';
  document.getElementById('editColor').value    = task.color    || '#5b8dee';

  document.getElementById('editModal').classList.add('open');
  setTimeout(() => document.getElementById('editText').focus(), 100);
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('open');
  editingId = null;
}

function saveEditModal() {
  const task = tasks.find(t => t.id === editingId);
  if (!task) return;

  const newText = document.getElementById('editText').value.trim();
  if (!newText) { toast('⚠️ Task cannot be empty'); return; }

  task.text     = newText;
  task.note     = document.getElementById('editNote').value.trim();
  task.priority = document.getElementById('editPriority').value;
  task.category = document.getElementById('editCategory').value;
  task.dueDate  = document.getElementById('editDueDate').value;
  task.color    = document.getElementById('editColor').value;

  saveTasks();
  renderTasks();
  closeEditModal();
  toast('✏️ Task updated!');
}

/* ════════════════════════════════════════
   BULK ACTIONS
════════════════════════════════════════ */
function markAll() {
  const allDone = tasks.every(t => t.done);
  tasks.forEach(t => { t.done = !allDone; });
  saveTasks();
  renderTasks();
  toast(allDone ? '↩️ All marked active' : '🎉 All completed!');
}

function clearDone() {
  const count = tasks.filter(t => t.done).length;
  if (!count) { toast('No completed tasks'); return; }
  if (!confirm(`Remove ${count} completed task(s)?`)) return;
  tasks = tasks.filter(t => !t.done);
  saveTasks();
  renderTasks();
  toast(`🗑️ ${count} task(s) cleared`);
}

function clearAll() {
  if (!tasks.length) { toast('Nothing to clear'); return; }
  if (!confirm('Delete ALL tasks? This cannot be undone.')) return;
  tasks = [];
  saveTasks();
  renderTasks();
  toast('🗑️ All tasks cleared');
}

/* ════════════════════════════════════════
   EXPORT / IMPORT
════════════════════════════════════════ */
function exportTasks() {
  const data = JSON.stringify({ tasks, exportedAt: new Date().toISOString() }, null, 2);
  const a    = document.createElement('a');
  a.href     = 'data:application/json;charset=utf-8,' + encodeURIComponent(data);
  a.download = 'taskly-backup.json';
  a.click();
  toast('📤 Exported!');
}

function importTasks(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const obj      = JSON.parse(e.target.result);
      const imported = Array.isArray(obj) ? obj : (obj.tasks || []);
      if (!imported.length) { toast('⚠️ No tasks found'); return; }
      if (!confirm(`Import ${imported.length} task(s)? Existing tasks will be kept.`)) return;
      tasks = [...imported, ...tasks];
      saveTasks();
      renderTasks();
      toast(`📥 Imported ${imported.length} task(s)!`);
    } catch {
      toast('⚠️ Invalid JSON file');
    }
  };
  reader.readAsText(file);
}

/* ════════════════════════════════════════
   THEME TOGGLE
════════════════════════════════════════ */
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next    = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('taskly_theme', next);
  document.getElementById('themeToggle').textContent = next === 'dark' ? '🌙' : '☀️';
  toast(next === 'dark' ? '🌙 Dark mode' : '☀️ Light mode');
}

/* ════════════════════════════════════════
   EVENT LISTENERS
════════════════════════════════════════ */

// Add task
document.getElementById('addBtn').addEventListener('click', addTask);
document.getElementById('taskInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') addTask();
});

// Search
document.getElementById('searchInput').addEventListener('input', e => {
  searchQ = e.target.value;
  renderTasks();
});

// Sort
document.getElementById('sortSelect').addEventListener('change', renderTasks);

// Header buttons
document.getElementById('themeToggle').addEventListener('click', toggleTheme);
document.getElementById('exportBtn').addEventListener('click', exportTasks);
document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', e => {
  if (e.target.files[0]) importTasks(e.target.files[0]);
  e.target.value = '';
});
document.getElementById('clearAllBtn').addEventListener('click', clearAll);

// Bulk actions
document.getElementById('markAllBtn').addEventListener('click', markAll);
document.getElementById('clearDoneBtn').addEventListener('click', clearDone);

// Filter tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeFilter = tab.dataset.filter;
    renderTasks();
  });
});

// Edit modal
document.getElementById('editCancel').addEventListener('click', closeEditModal);
document.getElementById('editSave').addEventListener('click', saveEditModal);
document.getElementById('editText').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveEditModal();
});
document.getElementById('editModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeEditModal(); // close on backdrop click
});

// Global keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeEditModal();
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('taskInput').focus();
  }
});

/* ════════════════════════════════════════
   INIT
════════════════════════════════════════ */
loadTheme();
loadTasks();
renderTasks();
toast('👋 Welcome to Taskly! Press Ctrl+K to focus input.', 3000);
