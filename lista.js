let tabs = [];
let activeTabId = null;
let ctxTargetId = null;
let tabCounter = 0;
let _tabsLoaded = false;
function fcGetTab(id) { return tabs.find(t => t.id === id); }
function fcActiveTab() { return fcGetTab(activeTabId); }
async function fcAddTab(label, id) {
tabCounter++;
const tabId = id || ('tab_' + Date.now() + '_' + tabCounter);
if (!label) label = 'Grupo ' + tabCounter;
tabs.push({ id: tabId, label, items: [], selected: new Set(), sortField: null, sortDir: 'asc' });
fcSwitchTab(tabId);
if (window.FC && window.FC.db && !id) {
await window.FC.db.collection('abas').doc(tabId).set({
label,
ordem: tabs.length,
criadoEm: firebase.firestore.FieldValue.serverTimestamp()
});
}
requestAnimationFrame(() => {
const inp = document.querySelector(`.tab-item[data-id="${tabId}"] .tab-label-input`);
if (inp) inp.select();
});
}
function fcSwitchTab(id) {
if (!fcGetTab(id)) return;
const wrap = document.getElementById('table-wrap');
wrap.classList.add('tab-switching');
setTimeout(() => {
activeTabId = id;
fcRenderTabBar();
fcUpdateSortHeaders();
fcRenderTable();
wrap.classList.remove('tab-switching');
if (window.FC && window.FC.db) {
window.dispatchEvent(new CustomEvent('fc:tab:switched'));
}
}, 180);
}
async function fcRenameTab(id, newLabel) {
const t = fcGetTab(id); if (!t) return;
t.label = newLabel || t.label;
if (window.FC && window.FC.db) {
try {
await window.FC.db.collection('abas').doc(id).update({ label: t.label });
} catch(e) { console.warn('Erro ao renomear aba:', e); }
}
}
async function fcDeleteTab(id) {
if (tabs.length === 1) { alert('Deve haver ao menos uma aba.'); return; }
const t = fcGetTab(id);
const nome = t ? `"${t.label}"` : 'esta aba';
if (!confirm(`Excluir ${nome}?\n\nOs lançamentos desta aba não serão excluídos, apenas a aba.`)) return;
const idx = tabs.findIndex(t => t.id === id);
tabs.splice(idx, 1);
if (activeTabId === id) activeTabId = tabs[Math.max(0, idx - 1)].id;
fcRenderTabBar();
fcRenderTable();
if (window.FC && window.FC.db) {
try {
await window.FC.db.collection('abas').doc(id).delete();
} catch(e) { console.warn('Erro ao excluir aba:', e); }
}
}
window.fcLoadTabsFromFirestore = async function() {
if (!window.FC || !window.FC.db) return;
if (_tabsLoaded) return;
_tabsLoaded = true;
try {
const snap = await window.FC.db.collection('abas').orderBy('ordem').get();
if (snap.empty) {
const defaultId = 'tab_default';
await window.FC.db.collection('abas').doc(defaultId).set({
label: 'Lançamentos', ordem: 1,
criadoEm: firebase.firestore.FieldValue.serverTimestamp()
});
tabs = [{ id: defaultId, label: 'Lançamentos', items: [], selected: new Set(), sortField: null, sortDir: 'asc' }];
activeTabId = defaultId;
} else {
tabs = snap.docs.map(doc => ({
id: doc.id,
label: doc.data().label || 'Aba',
items: [], selected: new Set(), sortField: null, sortDir: 'asc'
}));
activeTabId = tabs[0].id;
}
fcRenderTabBar(); fcRenderTable();
await window.FC.loadItems();
} catch(e) {
console.error('Erro ao carregar abas:', e);
if (tabs.length === 0 || (tabs.length === 1 && tabs[0].id === 'tab_init')) {
if (tabs.length === 0) {
tabs = [{ id: 'tab_fallback', label: 'Lançamentos', items: [], selected: new Set(), sortField: null, sortDir: 'asc' }];
activeTabId = 'tab_fallback';
}
fcRenderTabBar(); fcRenderTable();
}
}
};
const tabDrag = {
draggingId: null,
ghost: null,
offsetX: 0,
offsetY: 0,
dropIndex: -1,
DRAG_THRESHOLD: 5,
startX: 0, startY: 0,
isDragging: false,
pendingTabId: null,
_pendingEl: null,
_draggingEl: null,
start(tabId, clientX, clientY, el) {
this.pendingTabId = tabId;
this.startX = clientX;
this.startY = clientY;
this.isDragging = false;
const rect = el.getBoundingClientRect();
this.offsetX = clientX - rect.left;
this.offsetY = clientY - rect.top;
this._pendingEl = el;
},
checkThreshold(clientX, clientY) {
if (this.isDragging) return true;
const dx = clientX - this.startX;
const dy = clientY - this.startY;
if (Math.sqrt(dx*dx + dy*dy) > this.DRAG_THRESHOLD) {
this.beginDrag(this.pendingTabId, this._pendingEl);
return true;
}
return false;
},
beginDrag(tabId, el) {
this.draggingId = tabId;
this.isDragging = true;
document.body.style.userSelect = 'none';
const ghost = document.createElement('div');
ghost.className = 'tab-drag-ghost';
ghost.textContent = fcGetTab(tabId)?.label || '';
document.body.appendChild(ghost);
this.ghost = ghost;
this._positionGhost(this.startX, this.startY);
el.classList.add('dragging');
this._draggingEl = el;
},
move(clientX, clientY) {
if (!this.checkThreshold(clientX, clientY)) return;
if (!this.draggingId) return;
this._positionGhost(clientX, clientY);
this._updateDropTarget(clientX, clientY);
},
_positionGhost(x, y) {
if (!this.ghost) return;
this.ghost.style.transform = `translate(${x - this.offsetX}px, ${y - this.offsetY}px) scale(1.06) rotate(-1.5deg)`;
},
_updateDropTarget(clientX, clientY) {
const bar = document.getElementById('tab-bar');
const items = [...bar.querySelectorAll('.tab-item:not(.dragging)')];
const indicator = document.getElementById('tab-drop-indicator');
const barRect = bar.getBoundingClientRect();
let newIndex = tabs.findIndex(t => t.id === this.draggingId);
let indicatorLeft = null;
if (items.length === 0) {
newIndex = 0;
indicatorLeft = 3;
} else {
const firstRect = items[0].getBoundingClientRect();
if (clientX < firstRect.left + firstRect.width / 2) {
newIndex = 0;
indicatorLeft = firstRect.left - barRect.left + bar.scrollLeft - 2;
} else {
let found = false;
for (let i = 0; i < items.length - 1; i++) {
const curRect = items[i].getBoundingClientRect();
const nextRect = items[i+1].getBoundingClientRect();
const mid = curRect.right + (nextRect.left - curRect.right) / 2;
if (clientX < mid) {
const curTabId = items[i].dataset.id;
newIndex = tabs.findIndex(t => t.id === curTabId) + 1;
indicatorLeft = curRect.right - barRect.left + bar.scrollLeft - 2;
found = true; break;
}
}
if (!found) {
const lastRect = items[items.length-1].getBoundingClientRect();
const lastTabId = items[items.length-1].dataset.id;
newIndex = tabs.findIndex(t => t.id === lastTabId) + 1;
indicatorLeft = lastRect.right - barRect.left + bar.scrollLeft - 2;
}
}
}
this.dropIndex = newIndex;
if (indicatorLeft !== null) {
indicator.style.left = indicatorLeft + 'px';
indicator.classList.add('visible');
} else {
indicator.classList.remove('visible');
}
},
end() {
if (!this.draggingId) { this._cleanup(); return; }
const indicator = document.getElementById('tab-drop-indicator');
indicator.classList.remove('visible');
if (this.isDragging && this.dropIndex !== -1) {
const fromIndex = tabs.findIndex(t => t.id === this.draggingId);
let toIndex = this.dropIndex;
if (toIndex !== fromIndex && toIndex !== fromIndex + 1) {
const [moved] = tabs.splice(fromIndex, 1);
if (toIndex > fromIndex) toIndex--;
tabs.splice(toIndex, 0, moved);
fcRenderTabBar();
fcRenderTable();
this._persistOrder();
}
}
this._cleanup();
},
_cleanup() {
if (this.ghost) { this.ghost.remove(); this.ghost = null; }
if (this._draggingEl) { this._draggingEl.classList.remove('dragging'); this._draggingEl = null; }
document.body.style.userSelect = '';
this.draggingId = null;
this.pendingTabId = null;
this._pendingEl = null;
this.isDragging = false;
this.dropIndex = -1;
},
async _persistOrder() {
if (!window.FC || !window.FC.db) return;
try {
const batch = window.FC.db.batch();
tabs.forEach((t, i) => {
const ref = window.FC.db.collection('abas').doc(t.id);
batch.update(ref, { ordem: i + 1 });
});
await batch.commit();
} catch(e) { console.warn('Erro ao salvar ordem das abas:', e); }
}
};
document.addEventListener('mousemove', e => {
if (tabDrag.pendingTabId || tabDrag.draggingId) tabDrag.move(e.clientX, e.clientY);
});
document.addEventListener('mouseup', e => {
if (tabDrag.pendingTabId || tabDrag.draggingId) tabDrag.end();
});
document.addEventListener('touchmove', e => {
if (tabDrag.pendingTabId || tabDrag.draggingId) {
if (tabDrag.isDragging) e.preventDefault();
const t = e.touches[0];
tabDrag.move(t.clientX, t.clientY);
}
}, { passive: false });
document.addEventListener('touchend', e => {
if (tabDrag.pendingTabId || tabDrag.draggingId) tabDrag.end();
});
document.addEventListener('touchcancel', () => {
if (tabDrag.pendingTabId || tabDrag.draggingId) tabDrag._cleanup();
});
function fcRenderTabBar() {
const bar = document.getElementById('tab-bar');
const indicator = document.getElementById('tab-drop-indicator');
bar.innerHTML = '';
bar.appendChild(indicator);
tabs.forEach(t => {
const el = document.createElement('div');
el.className = 'tab-item' + (t.id === activeTabId ? ' active' : '');
el.dataset.id = t.id;
el.addEventListener('mousedown', e => {
if (e.button !== 0) return;
if (e.target.classList.contains('tab-close')) return;
tabDrag.start(t.id, e.clientX, e.clientY, el);
});
el.addEventListener('touchstart', e => {
if (e.touches.length > 1) return;
if (e.target.classList.contains('tab-close')) return;
const touch = e.touches[0];
tabDrag.start(t.id, touch.clientX, touch.clientY, el);
}, { passive: true });
el.addEventListener('click', e => {
if (tabDrag.isDragging) return;
if (e.target.classList.contains('tab-close')) return;
if (e.target.classList.contains('tab-label-input') && t.id === activeTabId) return;
fcSwitchTab(t.id);
});
el.addEventListener('contextmenu', e => {
e.preventDefault();
openCtxMenu(t.id, e.clientX, e.clientY);
});
const inp = document.createElement('input');
inp.type = 'text';
inp.className = 'tab-label-input';
inp.value = t.label;
inp.readOnly = true;
inp.style.width = Math.max(40, t.label.length * 8.5 + 8) + 'px';
inp.addEventListener('dblclick', () => {
if (t.id !== activeTabId) { fcSwitchTab(t.id); return; }
inp.readOnly = false; inp.select();
});
inp.addEventListener('input', () => {
inp.style.width = Math.max(40, inp.value.length * 8.5 + 8) + 'px';
});
inp.addEventListener('blur', () => {
inp.readOnly = true;
const newLabel = inp.value.trim() || t.label;
t.label = newLabel;
fcRenameTab(t.id, newLabel);
inp.style.width = Math.max(40, newLabel.length * 8.5 + 8) + 'px';
});
inp.addEventListener('keydown', e => {
if (e.key === 'Enter') inp.blur();
if (e.key === 'Escape') { inp.value = t.label; inp.blur(); }
});
el.appendChild(inp);
if (t.id === activeTabId) {
const close = document.createElement('button');
close.className = 'tab-close';
close.title = 'Excluir aba';
close.textContent = '×';
close.addEventListener('click', e => { e.stopPropagation(); fcDeleteTab(t.id); });
el.appendChild(close);
}
bar.appendChild(el);
});
requestAnimationFrame(fcUpdateTabScrollBtns);
}
function openCtxMenu(tabId, x, y) {
ctxTargetId = tabId;
const menu = document.getElementById('tab-ctx-menu');
menu.style.left = x + 'px';
menu.style.top = y + 'px';
menu.classList.add('open');
document.getElementById('ctx-delete').style.display = tabs.length === 1 ? 'none' : 'flex';
}
function closeCtxMenu() {
document.getElementById('tab-ctx-menu').classList.remove('open');
ctxTargetId = null;
}
function ctxRename() {
const id = ctxTargetId; closeCtxMenu();
if (!id) return;
fcSwitchTab(id);
requestAnimationFrame(() => {
const inp = document.querySelector(`.tab-item[data-id="${id}"] .tab-label-input`);
if (inp) { inp.readOnly = false; inp.select(); }
});
}
function ctxDelete() {
const id = ctxTargetId; closeCtxMenu(); fcDeleteTab(id);
}
document.addEventListener('click', e => {
if (!e.target.closest('#tab-ctx-menu')) closeCtxMenu();
});
(function () {
const MIN_W = 60, HANDLE_W = 18, STORAGE_KEY = 'fc_col_widths_v2';
const COLS = [
{ colId: 'col-descricao', thId: 'th-descricao' },
{ colId: 'col-valor', thId: 'th-valor' },
{ colId: 'col-vencimento', thId: 'th-vencimento' },
{ colId: 'col-status', thId: 'th-status' },
];
const wrap = document.getElementById('table-wrap');
const resizeLine = document.getElementById('col-resize-line');
let active = null, handles = [];
function loadWidths() {
try {
const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
COLS.forEach(({ colId }) => {
if (s[colId]) { const el = document.getElementById(colId); if (el) el.style.width = s[colId] + 'px'; }
});
} catch (_) {}
}
function saveWidth(colId, w) {
try {
const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
s[colId] = w; localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
} catch (_) {}
}
function createHandles() {
handles.forEach(h => h.remove()); handles = [];
COLS.forEach(({ colId, thId }) => {
const h = document.createElement('div');
h.className = 'col-rz-handle'; h.dataset.col = colId; h.dataset.th = thId;
wrap.appendChild(h); handles.push(h);
h.addEventListener('mousedown', onMouseDown);
h.addEventListener('click', e => e.stopPropagation());
h.addEventListener('touchstart', onTouchStart, { passive: false });
});
positionHandles();
}
function positionHandles() {
const wr = wrap.getBoundingClientRect();
handles.forEach(h => {
const th = document.getElementById(h.dataset.th); if (!th) return;
const r = th.getBoundingClientRect();
h.style.left = (r.right - wr.left + wrap.scrollLeft - HANDLE_W / 2) + 'px';
h.style.top = (r.top - wr.top + wrap.scrollTop) + 'px';
h.style.height = r.height + 'px';
h.style.width = HANDLE_W + 'px';
});
}
function onMouseDown(e) {
e.stopPropagation(); e.preventDefault();
const colEl = document.getElementById(e.currentTarget.dataset.col);
active = { handle: e.currentTarget, colEl, colId: e.currentTarget.dataset.col, startX: e.clientX, startW: colEl.offsetWidth };
active.handle.classList.add('active');
document.body.classList.add('col-resizing');
resizeLine.style.display = 'block'; resizeLine.style.left = e.clientX + 'px';
document.addEventListener('mousemove', onMouseMove);
document.addEventListener('mouseup', onMouseUp);
}
function onMouseMove(e) {
if (!active) return;
active.colEl.style.width = Math.max(MIN_W, active.startW + (e.clientX - active.startX)) + 'px';
resizeLine.style.left = e.clientX + 'px'; positionHandles();
}
function onMouseUp() {
if (!active) return;
saveWidth(active.colId, active.colEl.offsetWidth);
active.handle.classList.remove('active');
document.body.classList.remove('col-resizing');
resizeLine.style.display = 'none'; active = null;
document.removeEventListener('mousemove', onMouseMove);
document.removeEventListener('mouseup', onMouseUp);
positionHandles();
}
function onTouchStart(e) {
if (e.touches.length > 1) return;
e.preventDefault();
const touch = e.touches[0];
const colEl = document.getElementById(e.currentTarget.dataset.col);
active = { handle: e.currentTarget, colEl, colId: e.currentTarget.dataset.col, startX: touch.clientX, startW: colEl.offsetWidth };
active.handle.classList.add('active');
document.addEventListener('touchmove', onTouchMove, { passive: false });
document.addEventListener('touchend', onTouchEnd);
document.addEventListener('touchcancel', onTouchEnd);
}
function onTouchMove(e) {
if (!active || e.touches.length > 1) return;
e.preventDefault();
const touch = e.touches[0];
active.colEl.style.width = Math.max(MIN_W, active.startW + (touch.clientX - active.startX)) + 'px';
positionHandles();
}
function onTouchEnd() {
if (!active) return;
saveWidth(active.colId, active.colEl.offsetWidth);
active.handle.classList.remove('active'); active = null;
document.removeEventListener('touchmove', onTouchMove);
document.removeEventListener('touchend', onTouchEnd);
document.removeEventListener('touchcancel', onTouchEnd);
positionHandles();
}
window.addEventListener('resize', positionHandles);
wrap.addEventListener('scroll', positionHandles);
loadWidths();
requestAnimationFrame(createHandles);
})();
function fcSort(field) {
const t = fcActiveTab(); if (!t) return;
t.sortDir = (t.sortField === field && t.sortDir === 'asc') ? 'desc' : 'asc';
t.sortField = field;
fcUpdateSortHeaders(); fcRenderTable();
}
function fcUpdateSortHeaders() {
const t = fcActiveTab();
['descricao','valor','vencimento'].forEach(f => {
const th = document.getElementById('th-' + f); if (!th) return;
th.classList.remove('sort-asc','sort-desc');
if (t && t.sortField === f) th.classList.add(t.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
});
}
function fcSortedItems() {
const t = fcActiveTab(); if (!t) return [];
const items = [...t.items];
if (!t.sortField) return items;
items.sort((a, b) => {
if (t.sortField === 'descricao') {
const va = (a.descricao||'').toLowerCase(), vb = (b.descricao||'').toLowerCase();
return t.sortDir === 'asc' ? va.localeCompare(vb,'pt-BR') : vb.localeCompare(va,'pt-BR');
}
if (t.sortField === 'valor') {
return t.sortDir === 'asc' ? (parseFloat(a.valor)||0)-(parseFloat(b.valor)||0) : (parseFloat(b.valor)||0)-(parseFloat(a.valor)||0);
}
if (t.sortField === 'vencimento') {
return t.sortDir === 'asc' ? fcParseDate(a.vencimento)-fcParseDate(b.vencimento) : fcParseDate(b.vencimento)-fcParseDate(a.vencimento);
}
return 0;
});
return items;
}
function fcParseDate(str) {
if (!str) return 0;
if (/^\d{4}-\d{2}-\d{2}/.test(str)) return new Date(str).getTime();
const [d,m,y] = str.split('/'); return new Date(`${y}-${m}-${d}`).getTime();
}
function fcToggleAll(checked) {
const t = fcActiveTab(); if (!t) return;
t.selected.clear();
document.querySelectorAll('#fc-tbody [data-id], #fc-cards [data-id]').forEach(cb => { cb.checked = checked; if (checked) t.selected.add(cb.dataset.id); });
fcUpdateBulkBar();
}
function fcToggleSelect(id, checked) {
const t = fcActiveTab(); if (!t) return;
if (checked) t.selected.add(id); else t.selected.delete(id);
document.querySelectorAll(`[data-id="${id}"]`).forEach(cb => { cb.checked = checked; });
fcSyncSelectAll(); fcUpdateBulkBar();
}
function fcSyncSelectAll() {
const t = fcActiveTab();
const sa = document.querySelector('.select-all');
if (!sa || !t) return;
sa.checked = t.items.length > 0 && t.selected.size === t.items.length;
}
function fcUpdateBulkBar() {
const t = fcActiveTab(), n = t ? t.selected.size : 0;
const bar = document.getElementById('bulk-bar');
const btn = document.getElementById('btn-edit');
if (bar) bar.classList.toggle('visible', n > 0);
const countEl = document.getElementById('bulk-count');
if (countEl) countEl.textContent = `${n} selecionado${n !== 1 ? 's' : ''}`;
if (btn) btn.style.display = n === 1 ? 'inline-flex' : 'none';
}
function fcEditSelected() {
const t = fcActiveTab(); if (!t || t.selected.size !== 1) return;
const id = [...t.selected][0];
const item = t.items.find(i => i.id === id); if (!item) return;
window.dispatchEvent(new CustomEvent('fc:edit', { detail: item }));
}
const _pagoConfirm = {
pendingId: null,
pop: null,
init() {
this.pop = document.getElementById('pago-confirm-pop');
document.body.appendChild(this.pop);
document.getElementById('pago-pop-sim').addEventListener('click', () => this.confirm());
document.getElementById('pago-pop-nao').addEventListener('click', () => this.close());
document.addEventListener('click', e => {
if (this.pop && !this.pop.contains(e.target) && !e.target.closest('.btn-pago')) this.close();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
},
open(id, btnEl, marking) {
this.pendingId = id;
this.marking = marking;
const title = this.pop.querySelector('.pago-confirm-title');
if (marking) {
title.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#1A7A55" stroke-width="1.5"/><path d="M4 7l2 2 4-4" stroke="#1A7A55" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Confirmar pagamento?`;
} else {
title.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#D84040" stroke-width="1.5"/><path d="M4.5 4.5l5 5M9.5 4.5l-5 5" stroke="#D84040" stroke-width="1.5" stroke-linecap="round"/></svg> Desmarcar como pago?`;
}
this.pop.classList.add('open');
},
async confirm() {
const id = this.pendingId; const marking = this.marking; this.close();
if (!id) return;
const t = fcActiveTab(); if (!t) return;
const item = t.items.find(i => i.id === id); if (!item) return;
item.pago = marking;
fcRenderTable();
if (window.FC && window.FC.db) {
try { await window.FC.db.collection('lancamentos').doc(id).update({ pago: item.pago }); }
catch(e) { console.warn('Erro ao salvar pago:', e); }
}
},
close() {
if (this.pop) this.pop.classList.remove('open');
this.pendingId = null;
}
};
function fcTogglePago(id, btnEl) {
const t = fcActiveTab(); if (!t) return;
const item = t.items.find(i => i.id === id); if (!item) return;
_pagoConfirm.open(id, btnEl, !item.pago);
}
document.addEventListener('DOMContentLoaded', () => {
_pagoConfirm.init();
const bar = document.getElementById('tab-bar');
if (bar) bar.addEventListener('scroll', fcUpdateTabScrollBtns);
window.addEventListener('resize', fcUpdateTabScrollBtns);
});
function fcIsOverdue(v) { if (!v) return false; return fcParseDate(v) < Date.now(); }
function fcFormatMoney(v) { const n = parseFloat(v); if (isNaN(n)) return v; return n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fcFormatDate(str) {
if (!str) return '—';
if (/^\d{4}-\d{2}-\d{2}/.test(str)) { const [y,m,d]=str.split('-'); return `${d}/${m}/${y}`; }
return str;
}
function fcEscape(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fcTruncName(s) { return s.length > 20 ? s.slice(0,20) + '…' : s; }
function fcRenderTable() {
const t = fcActiveTab();
const tbody = document.getElementById('fc-tbody');
const empty = document.getElementById('fc-empty');
const badge = document.getElementById('count-badge');
if (!t) { tbody.innerHTML=''; if(empty) empty.style.display='block'; if(badge) badge.textContent='0 registros'; return; }
if (!t.items) t.items = [];
if (badge) badge.textContent = `${t.items.length} registro${t.items.length!==1?'s':''}`;
const items = fcSortedItems();
if (!items.length) { tbody.innerHTML=''; if(empty) empty.style.display='block'; return; }
if (empty) empty.style.display = 'none';
tbody.innerHTML = items.map(item => {
const over = fcIsOverdue(item.vencimento) && !item.pago;
const rowClass = item.pago ? 'pago' : (over ? 'overdue' : '');
return `
<tr class="${rowClass}"><td><input type="checkbox" data-id="${item.id}" onchange="fcToggleSelect(this.dataset.id,this.checked)" ${t.selected.has(item.id)?'checked':''}></td><td class="td-desc">
${over?'<span class="overdue-badge">!</span>':''}
<span class="td-desc-text">${fcEscape(item.descricao)}</span></td><td class="td-value">R$ ${fcFormatMoney(item.valor)}</td><td><span class="td-date ${over?'date-overdue':'date-ok'}">${fcFormatDate(item.vencimento)}</span></td><td style="text-align:center"><button class="btn-pago ${item.pago?'pago':''}" onclick="fcTogglePago('${item.id}',this)" title="${item.pago?'Clique para desmarcar':'Marcar como pago'}"><svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></td><td class="td-actions">
${(item.anexos||[]).map(f=>`
<span class="attach-chip"><a href="${f.url}" target="_blank" style="display:inline-flex;align-items:center;gap:5px;color:inherit;text-decoration:none;"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M4 1h5a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V4l2-3z" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/><path d="M4 1v3H2" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>
${fcEscape(fcTruncName(f.name))}
</a><button class="btn-icon" title="Excluir anexo"
onclick="window.FC.deleteFile('${item.id}','${encodeURIComponent(f.url)}','${encodeURIComponent(f.name)}')"
style="margin-left:2px;padding:2px;color:#C0C8DC;background:none;border:none;cursor:pointer;line-height:1;flex-shrink:0;"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></span>
`).join('')}
</td></tr>`;
}).join('');
fcSyncSelectAll(); fcUpdateBulkBar();
fcRenderCards();
}
function fcSetMobileSort(field) {
const t = fcActiveTab(); if (!t) return;
t.mobileSortField = (t.mobileSortField === field) ? null : field;
fcRenderCards();
}
function fcMobileSortedItems(t) {
const items = [...t.items];
if (!t.mobileSortField) return items;
if (t.mobileSortField === 'aberto') {
return [...items.filter(i => !i.pago), ...items.filter(i => i.pago)];
}
items.sort((a, b) => {
if (t.mobileSortField === 'descricao') {
return (a.descricao||'').toLowerCase().localeCompare((b.descricao||'').toLowerCase(), 'pt-BR');
}
if (t.mobileSortField === 'valor') {
return (parseFloat(a.valor)||0) - (parseFloat(b.valor)||0);
}
if (t.mobileSortField === 'vencimento') {
return fcParseDate(a.vencimento) - fcParseDate(b.vencimento);
}
return 0;
});
return items;
}
function fcUpdateMobileFilterUI(t) {
const f = t ? (t.mobileSortField || null) : null;
const map = { 'mf-nome': 'descricao', 'mf-data': 'vencimento', 'mf-valor': 'valor', 'mf-aberto': 'aberto' };
Object.entries(map).forEach(([btnId, field]) => {
const btn = document.getElementById(btnId);
if (btn) btn.classList.toggle('active', f === field);
});
}
function fcScrollTabs(dir) {
const bar = document.getElementById('tab-bar');
if (!bar) return;
bar.scrollBy({ left: dir * 120, behavior: 'smooth' });
setTimeout(fcUpdateTabScrollBtns, 300);
}
function fcUpdateTabScrollBtns() {
const bar = document.getElementById('tab-bar');
const btnL = document.getElementById('tab-scroll-left');
const btnR = document.getElementById('tab-scroll-right');
if (!bar || !btnL || !btnR) return;
btnL.classList.toggle('hidden', bar.scrollLeft <= 2);
btnR.classList.toggle('hidden', bar.scrollLeft + bar.clientWidth >= bar.scrollWidth - 2);
}
function fcRenderCards() {
const container = document.getElementById('fc-cards');
if (!container) return;
const t = fcActiveTab();
fcUpdateMobileFilterUI(t);
const items = t ? fcMobileSortedItems(t) : [];
if (!items.length) { container.innerHTML = ''; return; }
container.innerHTML = items.map(item => {
const over = fcIsOverdue(item.vencimento) && !item.pago;
const cardClass = item.pago ? 'pago' : (over ? 'overdue' : '');
const attachHtml = (item.anexos || []).map(f => `
<span class="attach-chip"><a href="${f.url}" target="_blank" style="display:inline-flex;align-items:center;gap:5px;color:inherit;text-decoration:none;"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M4 1h5a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V4l2-3z" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/><path d="M4 1v3H2" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>
${fcEscape(fcTruncName(f.name))}
</a><button class="btn-icon" title="Excluir anexo"
onclick="window.FC.deleteFile('${item.id}','${encodeURIComponent(f.url)}','${encodeURIComponent(f.name)}')"
style="margin-left:2px;padding:2px;color:#C0C8DC;background:none;border:none;cursor:pointer;line-height:1;flex-shrink:0;"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></span>`).join('');
return `
<div class="fc-card ${cardClass}"><div class="fc-card-header"><input type="checkbox" data-id="${item.id}" onchange="fcToggleSelect(this.dataset.id,this.checked)" ${t.selected.has(item.id)?'checked':''}><div class="fc-card-title">
${over ? '<span class="overdue-badge">!</span>' : ''}
<span class="fc-card-title-text">${fcEscape(item.descricao)}</span></div><button class="btn-pago ${item.pago?'pago':''}" onclick="fcTogglePago('${item.id}',this)" title="${item.pago?'Clique para desmarcar':'Marcar como pago'}"><svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div><div class="fc-card-meta"><span class="fc-card-value">R$ ${fcFormatMoney(item.valor)}</span><span class="td-date ${over?'date-overdue':'date-ok'}">${fcFormatDate(item.vencimento)}</span></div>
${attachHtml ? `<div class="fc-card-attachments">${attachHtml}</div>` : ''}
</div>`;
}).join('');
}
window.FC = window.FC || {};
Object.defineProperty(window.FC, 'items', {
get() { const t = fcActiveTab(); return t ? t.items : []; },
set(v) { const t = fcActiveTab(); if (t) t.items = v; },
configurable: true,
});
Object.defineProperty(window.FC, 'selected', {
get() { const t = fcActiveTab(); return t ? t.selected : new Set(); },
configurable: true,
});
window.FC.isOverdue = window.FC.isOverdue || fcIsOverdue;
window.FC.fFormatMoney = window.FC.fFormatMoney || fcFormatMoney;
window.FC.fFormatDate = window.FC.fFormatDate || fcFormatDate;
window.FC.fEscape = window.FC.fEscape || fcEscape;
window.FC.getTabs = () => tabs;
window.FC.getActiveTabId = () => activeTabId;
window.FC._setItemsForTab = function(tabId, items) {
const t = fcGetTab(tabId);
if (t) { t.items = items; fcRenderTable(); }
};
window.addEventListener('fc:updated', fcRenderTable);
window.addEventListener('fc:tab:loaded', function(e) {
const { tabId, items } = e.detail || {};
if (tabId && items) window.FC._setItemsForTab(tabId, items);
});
(function fcTableInit() {
if (_tabsLoaded) return;
tabs = [{ id: 'tab_init', label: 'Lançamentos', items: [], selected: new Set(), sortField: null, sortDir: 'asc' }];
activeTabId = 'tab_init';
fcRenderTabBar();
fcRenderTable();
})();