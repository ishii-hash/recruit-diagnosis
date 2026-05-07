/* admin-gacha.js — prize management dashboard */

const SESSION_KEY = 'gacha_admin_pass';
const RARITY_LABEL = { normal: 'ノーマル', rare: 'レア', super_rare: 'スーパーレア' };

let adminPassword = '';
let prizes = [];
let editingId = null;

/* ---- Boot ---- */
const saved = sessionStorage.getItem(SESSION_KEY);
if (saved) {
  adminPassword = saved;
  tryLogin(saved, true);
} else {
  document.getElementById('loginScreen').style.display = 'flex';
}

/* ---- Login ---- */
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const pass = document.getElementById('adminPass').value.trim();
  document.getElementById('loginBtnText').innerHTML = '<span class="spinner" style="border-top-color:#fff"></span>';
  await tryLogin(pass, false);
});

async function tryLogin(pass, silent) {
  try {
    const res = await apiFetch('GET', '/api/prizes', null, pass);
    if (res.status === 401) {
      if (!silent) showLoginError();
      else document.getElementById('loginScreen').style.display = 'flex';
      document.getElementById('loginBtnText').textContent = 'ログイン';
      return;
    }
    const data = await res.json();
    adminPassword = pass;
    sessionStorage.setItem(SESSION_KEY, pass);
    showDashboard(data);
  } catch {
    if (!silent) showLoginError();
    document.getElementById('loginBtnText').textContent = 'ログイン';
  }
}

function showLoginError() {
  const err = document.getElementById('loginError');
  err.style.display = 'block';
  document.getElementById('adminPass').value = '';
  document.getElementById('adminPass').focus();
  document.getElementById('loginBtnText').textContent = 'ログイン';
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
}

/* ---- Dashboard ---- */
function showDashboard(data) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminDashboard').style.display = 'block';
  prizes = data.prizes || [];
  renderStats(data.stats, prizes);
  renderTable(prizes);
}

function renderStats(stats, prizes) {
  const active = prizes.filter(p => p.is_active).length;
  document.getElementById('statTotal').textContent  = prizes.length;
  document.getElementById('statActive').textContent = active;
  document.getElementById('statPulls').textContent  = stats?.total ?? '—';
  document.getElementById('statToday').textContent  = stats?.today ?? '—';
}

function renderTable(list) {
  const tbody = document.getElementById('prizesTableBody');
  if (!list.length) {
    tbody.innerHTML = `
      <tr><td colspan="6">
        <div class="empty-state">
          <div class="empty-state__icon">🎁</div>
          <p class="empty-state__text">特典がまだ登録されていません。<br>「新しい特典を追加」から登録してください。</p>
        </div>
      </td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(p => `
    <tr data-id="${p.id}">
      <td class="td-name">${esc(p.name)}</td>
      <td class="td-desc">${esc(p.description || '—')}</td>
      <td><span class="pill ${p.rarity}">${RARITY_LABEL[p.rarity] || p.rarity}</span></td>
      <td class="td-weight" style="text-align:center">${p.weight}</td>
      <td style="text-align:center">
        <label class="toggle">
          <input type="checkbox" ${p.is_active ? 'checked' : ''}
            onchange="toggleActive(${p.id}, this.checked)">
          <span class="toggle__slider"></span>
        </label>
      </td>
      <td class="td-actions">
        <button class="btn btn-ghost btn-sm" onclick="openEditModal(${p.id})">編集</button>
        <button class="btn btn-danger btn-sm" onclick="deletePrize(${p.id})">削除</button>
      </td>
    </tr>`).join('');
}

/* ---- Add modal ---- */
function openAddModal() {
  editingId = null;
  document.getElementById('modalTitle').textContent = '特典を追加';
  document.getElementById('prizeForm').reset();
  document.getElementById('editId').value = '';
  document.getElementById('prizeWeight').value = 100;
  document.getElementById('saveBtnText').textContent = '追加する';
  document.getElementById('prizeModal').style.display = 'flex';
}

function openEditModal(id) {
  const p = prizes.find(x => x.id === id);
  if (!p) return;
  editingId = id;
  document.getElementById('modalTitle').textContent = '特典を編集';
  document.getElementById('editId').value = id;
  document.getElementById('prizeName').value   = p.name;
  document.getElementById('prizeDesc').value   = p.description || '';
  document.getElementById('prizeRarity').value = p.rarity;
  document.getElementById('prizeWeight').value = p.weight;
  document.getElementById('saveBtnText').textContent = '更新する';
  document.getElementById('prizeModal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('prizeModal').style.display = 'none';
}

/* ---- Form submit ---- */
document.getElementById('prizeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const saveBtn = document.getElementById('saveBtnText');
  saveBtn.innerHTML = '<span class="spinner" style="border-top-color:#fff"></span>';

  const body = {
    name:        document.getElementById('prizeName').value.trim(),
    description: document.getElementById('prizeDesc').value.trim(),
    rarity:      document.getElementById('prizeRarity').value,
    weight:      Number(document.getElementById('prizeWeight').value),
  };

  try {
    let res;
    if (editingId) {
      res = await apiFetch('PUT', `/api/prizes/${editingId}`, body);
    } else {
      res = await apiFetch('POST', '/api/prizes', body);
    }

    if (!res.ok) throw new Error(await res.text());

    closeModal();
    await refreshPrizes();
    toast(editingId ? '特典を更新しました' : '特典を追加しました', 'success');
  } catch (err) {
    toast('保存に失敗しました: ' + err.message, 'error');
  } finally {
    saveBtn.textContent = editingId ? '更新する' : '追加する';
  }
});

/* ---- Toggle active ---- */
async function toggleActive(id, checked) {
  try {
    const res = await apiFetch('PUT', `/api/prizes/${id}`, { is_active: checked ? 1 : 0 });
    if (!res.ok) throw new Error();
    prizes = prizes.map(p => p.id === id ? { ...p, is_active: checked ? 1 : 0 } : p);
    renderStats(null, prizes);
    toast(checked ? '有効にしました' : '無効にしました', 'success');
  } catch {
    toast('更新に失敗しました', 'error');
    await refreshPrizes();
  }
}

/* ---- Delete ---- */
async function deletePrize(id) {
  const p = prizes.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`「${p.name}」を削除しますか？この操作は元に戻せません。`)) return;

  try {
    const res = await apiFetch('DELETE', `/api/prizes/${id}`, null);
    if (!res.ok) throw new Error();
    await refreshPrizes();
    toast('特典を削除しました', 'success');
  } catch {
    toast('削除に失敗しました', 'error');
  }
}

/* ---- Helpers ---- */
async function refreshPrizes() {
  const res  = await apiFetch('GET', '/api/prizes');
  const data = await res.json();
  prizes = data.prizes || [];
  renderStats(data.stats, prizes);
  renderTable(prizes);
}

function apiFetch(method, url, body = null, pass = null) {
  const headers = { 'Content-Type': 'application/json', 'X-Admin-Password': pass ?? adminPassword };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  return fetch(url, opts);
}

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ---- Tabs ---- */
function switchTab(tab) {
  document.getElementById('tabPrizes').classList.toggle('active', tab === 'prizes');
  document.getElementById('tabClaims').classList.toggle('active', tab === 'claims');
  document.getElementById('panelPrizes').style.display = tab === 'prizes' ? 'block' : 'none';
  document.getElementById('panelClaims').style.display = tab === 'claims' ? 'block' : 'none';
  if (tab === 'claims') loadClaims();
}

/* ---- Claims ---- */
async function loadClaims() {
  const tbody = document.getElementById('claimsTableBody');
  tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-state__icon">⏳</div><p class="empty-state__text">読み込み中...</p></div></td></tr>`;
  try {
    const res  = await apiFetch('GET', '/api/claims');
    if (!res.ok) { tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-state__icon">⚠️</div><p class="empty-state__text">データの取得に失敗しました</p></div></td></tr>`; return; }
    const data = await res.json();
    renderClaims(data.claims || []);
  } catch {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-state__icon">⚠️</div><p class="empty-state__text">通信エラー</p></div></td></tr>`;
  }
}

function renderClaims(claims) {
  const tbody = document.getElementById('claimsTableBody');
  if (!claims.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-state__icon">📭</div><p class="empty-state__text">応募者がまだいません</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = claims.map(c => {
    const d = new Date(c.claimed_at).toLocaleString('ja-JP', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
    return `<tr>
      <td class="td-date">${d}</td>
      <td class="td-name">${esc(c.name)}</td>
      <td>${esc(c.company || '—')}</td>
      <td class="td-email"><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></td>
      <td>${esc(c.prize_name || '—')}</td>
      <td><span class="pill ${c.prize_rarity || 'normal'}">${RARITY_LABEL[c.prize_rarity] || '—'}</span></td>
    </tr>`;
  }).join('');
}

/* Expose to inline handlers */
window.openAddModal   = openAddModal;
window.openEditModal  = openEditModal;
window.closeModal     = closeModal;
window.toggleActive   = toggleActive;
window.deletePrize    = deletePrize;
window.logout         = logout;
window.switchTab      = switchTab;
window.loadClaims     = loadClaims;
