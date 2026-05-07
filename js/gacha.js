/* gacha.js — public gacha page */

const RARITY_LABEL = { normal: 'ノーマル', rare: 'レア', super_rare: 'スーパーレア' };

/* DOM refs */
const machine    = document.getElementById('machine');
const btnPull    = document.getElementById('btnPull');
const btnText    = document.getElementById('btnText');
const tray       = document.getElementById('machineTray');
const modal      = document.getElementById('prizeModal');
const overlay    = document.getElementById('modalOverlay');
const sparkles   = document.getElementById('sparkles');
const confettiC  = document.getElementById('confettiContainer');
const rarityStrip = document.getElementById('rarityStrip');
const gachaHint  = document.getElementById('gachaHint');

/* Step elements */
const stepReveal  = document.getElementById('stepReveal');
const stepForm    = document.getElementById('stepForm');
const stepSuccess = document.getElementById('stepSuccess');

let pulling    = false;
let lastResult = null; /* { prize, result_id } */

/* ---- Init ---- */
window.addEventListener('load', () => {
  setTimeout(() => {
    rarityStrip.style.opacity = '1';
    rarityStrip.style.transition = 'opacity .6s';
  }, 400);
  loadPrizeList();
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
btnPull.addEventListener('click', pullGacha);
document.getElementById('btnClaim').addEventListener('click', goToForm);
document.getElementById('btnClose').addEventListener('click', closeModal);
overlay.addEventListener('click', closeModal);
document.getElementById('claimForm').addEventListener('submit', submitClaim);

/* ---- Pull ---- */
async function pullGacha() {
  if (pulling) return;
  pulling = true;
  btnPull.disabled = true;
  btnText.innerHTML = '<span class="spinner"></span>';

  machine.classList.add('pulling');

  setTimeout(() => {
    const cap = document.createElement('span');
    cap.className = 'tray-capsule';
    cap.style.background = 'linear-gradient(160deg,#d0d0d8,#9a9aac)';
    tray.innerHTML = '';
    tray.appendChild(cap);
  }, 600);

  try {
    const res  = await fetch('/api/gacha', { method: 'POST' });
    const data = await res.json();

    if (!res.ok || !data.prize) { handleError(data.error); return; }

    lastResult = { prize: data.prize, result_id: data.result_id ?? null };
    setTimeout(() => showPrize(data.prize), 1200);

  } catch {
    handleError('通信エラーが発生しました。しばらくしてからお試しください。');
  }
}

/* ---- Show prize (step 1) ---- */
function showPrize(prize) {
  const r = prize.rarity || 'normal';

  const cap = tray.querySelector('.tray-capsule');
  if (cap) cap.style.background = capsuleGradient(r);

  document.getElementById('modalCapsuleIcon').className = `modal-capsule-icon ${r}`;
  document.getElementById('modalRarity').className  = `modal-rarity ${r}`;
  document.getElementById('modalRarity').textContent = RARITY_LABEL[r] || r;
  document.getElementById('modalPrizeName').textContent = prize.name;
  document.getElementById('modalPrizeDesc').textContent  = prize.description || '';

  showStep('reveal');
  openModal();

  if (r === 'rare' || r === 'super_rare') launchConfetti(r === 'super_rare' ? 80 : 40);
  addSparkles(r);

  btnText.textContent = 'もう一度引く！';
  btnPull.disabled = false;
  machine.classList.remove('pulling');
  pulling = false;
}

/* ---- Step navigation ---- */
function goToForm() {
  sparkles.innerHTML = '';
  showStep('form');
}

window.goBackToReveal = function () {
  window.closeModal();
};

function showStep(step) {
  stepReveal.style.display  = step === 'reveal'  ? 'block' : 'none';
  stepForm.style.display    = step === 'form'    ? 'block' : 'none';
  stepSuccess.style.display = step === 'success' ? 'block' : 'none';
}

/* ---- Claim form (step 2 → 3) ---- */
async function submitClaim(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtnText');
  btn.innerHTML = '<span class="spinner" style="border-top-color:#fff;width:16px;height:16px;border-width:2px"></span>';

  const body = {
    result_id: lastResult?.result_id ?? null,
    prize_id:  lastResult?.prize?.id  ?? null,
    name:    document.getElementById('claimName').value.trim(),
    company: document.getElementById('claimCompany').value.trim(),
    email:   document.getElementById('claimEmail').value.trim(),
  };

  try {
    const res = await fetch('/api/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'エラー');

    /* Success */
    const prize = lastResult?.prize;
    const r     = prize?.rarity || 'normal';
    document.getElementById('successRarity').className  = `modal-rarity ${r}`;
    document.getElementById('successRarity').textContent = RARITY_LABEL[r] || r;
    document.getElementById('successPrizeName').textContent = prize?.name || '';

    showStep('success');
    launchConfetti(60);

  } catch (err) {
    btn.textContent = '特典を受け取る →';
    alert('送信に失敗しました: ' + err.message);
  }
}

/* ---- Modal open/close ---- */
function openModal() {
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

window.closeModal = function () {
  modal.style.display = 'none';
  document.body.style.overflow = '';
  sparkles.innerHTML = '';
  tray.innerHTML = '';
  document.getElementById('claimForm').reset();
  document.getElementById('submitBtnText').textContent = '特典を受け取る →';
  showStep('reveal');
};

function handleError(msg) {
  machine.classList.remove('pulling');
  btnText.textContent = 'ガチャを引く！';
  btnPull.disabled = false;
  pulling = false;
  gachaHint.textContent = msg || 'エラーが発生しました';
  gachaHint.style.color = 'var(--c-accent)';
  setTimeout(() => { gachaHint.textContent = '特典はランダムに決まります'; gachaHint.style.color = ''; }, 4000);
}

/* ---- Prize list ---- */
async function loadPrizeList() {
  try {
    const res  = await fetch('/api/prizes');
    const data = await res.json();
    renderPrizeList(data.prizes || []);
  } catch { /* silently skip */ }
}

function renderPrizeList(prizes) {
  const grid = document.getElementById('prizesGrid');
  if (!prizes.length) { document.getElementById('prizesSection').style.display = 'none'; return; }

  grid.innerHTML = prizes.map(p => `
    <div class="prize-card">
      <div class="prize-card__capsule ${p.rarity}"></div>
      <div class="prize-card__body">
        <div class="prize-card__rarity">
          <span class="pill ${p.rarity}">${RARITY_LABEL[p.rarity] || p.rarity}</span>
        </div>
        <div class="prize-card__name">${esc(p.name)}</div>
        <div class="prize-card__desc">${esc(p.description || '')}</div>
      </div>
    </div>
  `).join('');
}

/* ---- Helpers ---- */
function capsuleGradient(r) {
  if (r === 'super_rare') return 'linear-gradient(160deg,#ffeaa7,#cda500)';
  if (r === 'rare')       return 'linear-gradient(160deg,#74b9ff,#0984e3)';
  return 'linear-gradient(160deg,#d0d0d8,#9a9aac)';
}

function addSparkles(rarity) {
  sparkles.innerHTML = '';
  const colors = rarity === 'super_rare'
    ? ['#ffd700','#ffb700','#fff176','#ffe57f']
    : rarity === 'rare'
    ? ['#74b9ff','#a29bfe','#fff','#dfe6e9']
    : ['#b2bec3','#dfe6e9','#fff'];

  for (let i = 0; i < 18; i++) {
    const s   = document.createElement('span');
    s.className = 'sparkle';
    const tx  = (Math.random() - .5) * 240;
    const ty  = (Math.random() - .5) * 220;
    s.style.cssText = `
      background:${colors[i % colors.length]};
      left:${40 + Math.random()*20}%;top:${15+Math.random()*30}%;
      --tx:${tx}px;--ty:${ty}px;
      animation-delay:${Math.random()*.3}s;
      animation-duration:${.6+Math.random()*.4}s;
      width:${4+Math.random()*5}px;height:${4+Math.random()*5}px;
    `;
    sparkles.appendChild(s);
  }
}

function launchConfetti(count) {
  const colors = ['#E60012','#FFE34F','#005095','#2ecc71','#a29bfe','#fd79a8','#ffeaa7'];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.cssText = `
      left:${Math.random()*100}vw;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      width:${6+Math.random()*8}px;height:${6+Math.random()*8}px;
      border-radius:${Math.random()>.5?'50%':'2px'};
      animation-duration:${1.5+Math.random()*2}s;
      animation-delay:${Math.random()*.8}s;
    `;
    confettiC.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
