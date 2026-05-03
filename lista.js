
(function() {
  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap';
  document.head.appendChild(link);

  var style = document.createElement('style');
  style.textContent = '.fc-spinner-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(15,32,68,0.18);z-index:9999;backdrop-filter:blur(2px);opacity:0;pointer-events:none;transition:opacity 0.18s}.fc-spinner-overlay.visible{opacity:1;pointer-events:all}.fc-spinner-box{background:#fff;border:1px solid #E4E9F4;border-radius:14px;padding:28px 36px;display:flex;flex-direction:column;align-items:center;gap:16px}.fc-spinner-ring{width:44px;height:44px;border:3.5px solid #E4E9F4;border-top-color:#2E6BF6;border-radius:50%;animation:fc-spin 0.75s linear infinite}@keyframes fc-spin{to{transform:rotate(360deg)}}.fc-spinner-label{font-family:\'DM Sans\',sans-serif;font-size:13px;font-weight:600;color:#0F2044}';
  document.head.appendChild(style);

  function injectSpinner() {
    if (document.getElementById('fc-spinner')) return;
    var d = document.createElement('div');
    d.className = 'fc-spinner-overlay'; d.id = 'fc-spinner';
    d.innerHTML = '<div class="fc-spinner-box"><div class="fc-spinner-ring"></div><div class="fc-spinner-label" id="fc-spinner-label">Aguarde...</div></div>';
    document.body.appendChild(d);
  }
  if (document.body) injectSpinner();
  else document.addEventListener('DOMContentLoaded', injectSpinner);
})();

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCOxHe0CgD-HMSJPO0jd45IySroRDemnxM",
  authDomain: "financeiro-f879a.firebaseapp.com",
  projectId: "financeiro-f879a",
  storageBucket: "financeiro-f879a.firebasestorage.app",
  appId: "1:247501914666:web:cfe7f319b7dbb3fdc37953",
  messagingSenderId: "247501914666"
};

window.FC = window.FC || {};
window.FC.db      = window.FC.db      || null;
window.FC.storage = window.FC.storage || null;
window.FC.editId  = null;

window.FC.showSpinner = function(label) {
  var el = document.getElementById('fc-spinner');
  var lb = document.getElementById('fc-spinner-label');
  if (lb) lb.textContent = label || 'Aguarde...';
  if (el) el.classList.add('visible');
};
window.FC.hideSpinner = function() {
  var el = document.getElementById('fc-spinner');
  if (el) el.classList.remove('visible');
};

window.FC._activeTabId = function() {
  return typeof window.FC.getActiveTabId === 'function' ? window.FC.getActiveTabId() : 'default';
};

window.FC.init = async function() {
  window.FC.showSpinner('Conectando...');
  try {
    if (!window.FC._skipAuth) {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      window.FC.db      = firebase.firestore();
      window.FC.storage = firebase.storage();
    }
    var tentativas = 0;
    var tryLoad = async function() {
      if (typeof window.fcLoadTabsFromFirestore === 'function') {
        await window.fcLoadTabsFromFirestore();
      } else if (tentativas < 30) {
        tentativas++;
        setTimeout(tryLoad, 100);
      } else {
        await window.FC.loadItems();
      }
    };
    await tryLoad();
  } finally {
    window.FC.hideSpinner();
  }
};

window.FC.loadItems = async function() {
  if (!window.FC.db) return;
  var tabId = window.FC._activeTabId();
  window.FC.showSpinner('Carregando...');
  try {
    var snapshot = await window.FC.db.collection('lancamentos').where('tabId', '==', tabId).get();
    var items = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
    items.sort(function(a, b) {
      if (!a.vencimento) return 1;
      if (!b.vencimento) return -1;
      return new Date(a.vencimento) - new Date(b.vencimento);
    });
    window.dispatchEvent(new CustomEvent('fc:tab:loaded', { detail: { tabId, items } }));
    window.dispatchEvent(new CustomEvent('fc:updated'));
  } finally {
    window.FC.hideSpinner();
  }
};

window.FC.handleSave = async function() {
  var desc      = document.querySelector('.f-desc')?.value.trim();
  var valorRaw  = document.querySelector('.f-value')?.value || '0';
  var valor     = parseFloat(valorRaw.replace(/\./g, '').replace(',', '.'));
  var date      = document.querySelector('.f-date')?.value;
  var fileInput = document.querySelector('.f-file');
  var files     = fileInput ? fileInput.files : [];
  if (!desc || isNaN(valor) || !date) { alert('Preencha todos os campos.'); return; }
  window.FC.showSpinner(window.FC.editId ? 'Atualizando...' : 'Salvando...');
  try {
    var novosAnexos = [];
    for (var file of Array.from(files)) {
      var ref    = window.FC.storage.ref('documentos/' + Date.now() + '_' + file.name);
      var upload = await ref.put(file);
      var url    = await upload.ref.getDownloadURL();
      novosAnexos.push({ name: file.name, url });
    }
    var tabId = window.FC._activeTabId();
    var data = { descricao: desc, valor, vencimento: date, tabId, ultimaAlteracao: firebase.firestore.FieldValue.serverTimestamp() };
    if (window.FC.editId) {
      delete data.tabId;
      if (novosAnexos.length > 0) data.anexos = firebase.firestore.FieldValue.arrayUnion(...novosAnexos);
      await window.FC.db.collection('lancamentos').doc(window.FC.editId).update(data);
      window.FC.editId = null;
      var btn = document.querySelector('.btn-add');
      if (btn) btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="white" stroke-width="2" stroke-linecap="round"/></svg> Add';
      var cancelBtn = document.getElementById('btn-cancel');
      if (cancelBtn) cancelBtn.style.display = 'none';
    } else {
      data.anexos = novosAnexos;
      data.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
      await window.FC.db.collection('lancamentos').add(data);
    }
    if (document.querySelector('.f-desc'))  document.querySelector('.f-desc').value  = '';
    if (document.querySelector('.f-value')) document.querySelector('.f-value').value = '';
    if (document.querySelector('.f-date'))  document.querySelector('.f-date').value  = '';
    if (typeof window.fcResetFileLabel === 'function') window.fcResetFileLabel();
    if (window.FC.selected) window.FC.selected.clear();
    await window.FC.loadItems();
  } catch(err) {
    console.error(err); alert('Erro ao salvar. Verifique o console.');
  } finally {
    window.FC.hideSpinner();
  }
};

window.FC.prepareEdit = function(id) {
  var items = window.FC.items || [];
  var item  = items.find(function(i) { return i.id === id; });
  if (!item) return;
  window.FC.editId = id;
  if (document.querySelector('.f-desc'))  document.querySelector('.f-desc').value  = item.descricao  || '';
  if (document.querySelector('.f-value')) document.querySelector('.f-value').value = item.valor      || '';
  if (document.querySelector('.f-date'))  document.querySelector('.f-date').value  = item.vencimento || '';
  var btn = document.querySelector('.btn-add');
  if (btn) btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 10l2 2 8-8" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Salvar edicao';
  var cancelBtn = document.getElementById('btn-cancel');
  if (cancelBtn) cancelBtn.style.display = 'inline-flex';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.FC.editSelected = function() {
  if (!window.FC.selected || window.FC.selected.size !== 1) { alert('Selecione apenas um item para editar.'); return; }
  window.FC.prepareEdit([...window.FC.selected][0]);
};

window.FC.deleteSelected = async function() {
  if (!window.FC.selected?.size || !confirm('Excluir ' + window.FC.selected.size + ' lancamento(s)?')) return;
  window.FC.showSpinner('Excluindo...');
  try {
    var items = window.FC.items || [];
    for (var item of items.filter(function(i) { return window.FC.selected.has(i.id); })) {
      for (var file of (item.anexos || [])) {
        try { await window.FC.storage.refFromURL(file.url).delete(); } catch(e) {}
      }
      await window.FC.db.collection('lancamentos').doc(item.id).delete();
    }
    window.FC.selected.clear();
    await window.FC.loadItems();
  } catch(err) {
    console.error(err); alert('Erro ao excluir. Verifique o console.');
  } finally {
    window.FC.hideSpinner();
  }
};

window.FC.deleteFile = async function(itemId, urlEnc, nameEnc) {
  var url  = decodeURIComponent(urlEnc);
  var name = decodeURIComponent(nameEnc);
  if (!confirm('Excluir "' + name + '"?')) return;
  window.FC.showSpinner('Removendo arquivo...');
  try {
    await window.FC.storage.refFromURL(url).delete();
    var items = window.FC.items || [];
    var item  = items.find(function(i) { return i.id === itemId; });
    var novos = item.anexos.filter(function(f) { return f.url !== url; });
    await window.FC.db.collection('lancamentos').doc(itemId).update({ anexos: novos });
    await window.FC.loadItems();
  } catch(err) {
    console.error(err); alert('Erro ao remover arquivo.');
  } finally {
    window.FC.hideSpinner();
  }
};

window.FC.downloadSelected = async function() {
  if (!window.FC.selected?.size) return alert('Nenhum item selecionado.');
  var items        = window.FC.items || [];
  var selecionados = items.filter(function(i) { return window.FC.selected.has(i.id); });
  if (!selecionados.some(function(i) { return (i.anexos || []).length > 0; })) return alert('Os itens selecionados nao possuem anexos.');
  window.FC.showSpinner('Gerando ZIP...');
  try {
    var zip    = new JSZip();
    var folder = zip.folder('documentos');
    for (var item of selecionados) {
      for (var file of (item.anexos || [])) {
        var blob = await fetch(file.url).then(function(r) { return r.blob(); });
        folder.file(item.descricao + '_' + file.name, blob);
      }
    }
    var content = await zip.generateAsync({ type: 'blob' });
    var link2   = document.createElement('a');
    link2.href  = URL.createObjectURL(content);
    link2.download = 'documentos.zip';
    link2.click();
  } catch(err) {
    console.error(err); alert('Erro ao gerar o ZIP.');
  } finally {
    window.FC.hideSpinner();
  }
};

window.FC.calcMetrics = function() {
  var hoje = new Date();
  var m = hoje.getMonth(), y = hoje.getFullYear();
  var pm = (m + 1) % 12, py = m === 11 ? y + 1 : y;
  var atual = 0, proximo = 0;
  var items = window.FC.items || [];
  items.forEach(function(it) {
    if (!it.vencimento) return;
    var parts  = it.vencimento.split('-').map(Number);
    var dMonth = parts[1] - 1;
    if (dMonth === m  && parts[0] === y)  atual   += Number(it.valor || 0);
    if (dMonth === pm && parts[0] === py) proximo += Number(it.valor || 0);
  });
  return { atual, proximo, total: items.length };
};

window.addEventListener('fc:tab:switched', async function() {
  await window.FC.loadItems();
});

window.toggleSelect     = function() { return window.FC.toggleSelect?.apply(window.FC, arguments); };
window.toggleSelectAll  = function() { return window.FC.toggleSelectAll?.apply(window.FC, arguments); };
window.editSelected     = function() { return window.FC.editSelected(); };
window.deleteSelected   = function() { return window.FC.deleteSelected(); };
window.downloadSelected = function() { return window.FC.downloadSelected(); };
window.deleteFile       = function() { return window.FC.deleteFile.apply(window.FC, arguments); };

function fcCoreInit() {
  if (typeof firebase === 'undefined') { return setTimeout(fcCoreInit, 100); }
  if (window.FC._authReady) return;
  if (document.getElementById('fc-auth-overlay')) return;
  window.FC.init();
}
document.addEventListener('DOMContentLoaded', fcCoreInit);

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

// ─── MÓDULO TELEFONIA ─────────────────────────────────────────────
window.TEL = window.TEL || {};
window.TEL._loaded = false;
window.TEL.editId  = null;

window.TEL.loadItems = async function() {
  if (!window.FC.db) { console.warn('[TEL] db não disponível'); return; }
  console.log('[TEL] carregando chips...');
  window.FC.showSpinner('Carregando chips...');
  try {
    const snap = await window.FC.db.collection('chips').get();
    console.log('[TEL] chips carregados:', snap.size);
    window.telItems = snap.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
    window.telItems.sort(function(a,b){ return String(a.numero||'').localeCompare(String(b.numero||''),'pt-BR'); });
    window.TEL._loaded = true;
    if (typeof telRender === 'function') telRender();
  } catch(e) {
    console.error('[TEL] erro ao carregar chips:', e.code, e.message);
    alert('Erro ao carregar chips: ' + e.message);
  } finally {
    window.FC.hideSpinner();
  }
};

window.TEL.saveItem = async function(data, id) {
  if (!window.FC.db) { alert('[TEL] db não disponível. Tente recarregar.'); return; }
  console.log('[TEL] salvando chip:', data, 'id:', id);
  window.FC.showSpinner(id ? 'Atualizando...' : 'Salvando...');
  try {
    if (id) {
      await window.FC.db.collection('chips').doc(id).update(
        Object.assign({}, data, { ultimaAlteracao: firebase.firestore.FieldValue.serverTimestamp() })
      );
    } else {
      await window.FC.db.collection('chips').add(
        Object.assign({}, data, { criadoEm: firebase.firestore.FieldValue.serverTimestamp() })
      );
    }
    console.log('[TEL] chip salvo com sucesso');
    window.TEL.editId = null;
    await window.TEL.loadItems();
  } catch(e) {
    console.error('[TEL] erro ao salvar chip:', e.code, e.message);
    alert('Erro ao salvar: ' + e.message);
  } finally {
    window.FC.hideSpinner();
  }
};

window.TEL.deleteItems = async function(ids) {
  if (!window.FC.db || !ids.length) return;
  window.FC.showSpinner('Excluindo...');
  try {
    const batch = window.FC.db.batch();
    ids.forEach(function(id) { batch.delete(window.FC.db.collection('chips').doc(id)); });
    await batch.commit();
    window.telSelected.clear();
    await window.TEL.loadItems();
  } catch(e) {
    console.error('Erro ao excluir chips:', e);
    alert('Erro ao excluir. Verifique o console.');
  } finally {
    window.FC.hideSpinner();
  }
};

window.TEL.toggleAtivo = async function(id) {
  if (!window.FC.db) return;
  const item = (window.telItems || []).find(function(i) { return i.id === id; });
  if (!item) return;
  const novo = !item.ativo;
  item.ativo = novo;
  if (typeof telRender === 'function') telRender();
  try {
    await window.FC.db.collection('chips').doc(id).update({ ativo: novo });
  } catch(e) {
    item.ativo = !novo;
    if (typeof telRender === 'function') telRender();
    console.error('Erro ao atualizar status:', e);
  }
};

// Eventos disparados pelo HTML
window.addEventListener('tel:delete', async function(e) {
  var ids = (e.detail && e.detail.ids) || [];
  await window.TEL.deleteItems(ids);
});

window.addEventListener('tel:edit', function(e) {
  var id = e.detail && e.detail.id;
  var item = (window.telItems || []).find(function(i) { return i.id === id; });
  if (item) {
    window.TEL.editId = id;
    window.dispatchEvent(new CustomEvent('tel:edit:open', { detail: item }));
  }
});

// Carrega chips após autenticação (evento)
window.addEventListener('fc:auth:granted', function() {
  window.TEL.loadItems();
});

// Polling como fallback — caso fc:auth:granted já tenha disparado antes deste listener
function _telPollAndLoad() {
  if (window.TEL._loaded) return;
  if (window.FC && window.FC.db && window.FC._authReady) {
    window.TEL.loadItems();
  } else {
    setTimeout(_telPollAndLoad, 300);
  }
}
document.addEventListener('DOMContentLoaded', function() { setTimeout(_telPollAndLoad, 500); });

// Carrega chips ao navegar para a seção (garante carregar mesmo se polling falhou)
var _origFcNavSwitch = window.fcNavSwitch;
window.fcNavSwitch = function(section, btn) {
  if (typeof _origFcNavSwitch === 'function') _origFcNavSwitch(section, btn);
  if (section === 'telefonia' && window.FC && window.FC.db) {
    window.TEL.loadItems();
  }
};