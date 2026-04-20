/* =========================================================
   result.js — 結果画面レンダリング
   データソース優先順位:
     1. sessionStorage.analysis_result（実分析の結果）
     2. window.DUMMY_ANALYSIS（ダミー / ローカル確認用）
   ========================================================= */
(function () {
  let data = null;

  // 1) sessionStorage（実分析）
  try {
    const raw = sessionStorage.getItem('analysis_result');
    if (raw) {
      data = JSON.parse(raw);
      sessionStorage.removeItem('analysis_result'); // 1回使ったらクリア
    }
  } catch (e) { /* noop */ }

  // 2) ダミーフォールバック
  if (!data && window.DUMMY_ANALYSIS) data = window.DUMMY_ANALYSIS;
  if (!data) return;

  // URLパラメータ優先で表示
  const params = new URLSearchParams(window.location.search);
  const targetUrl = decodeURIComponent(params.get('url') || data.url || '');

  // ---- メタ情報 ----
  document.getElementById('target-url').textContent = targetUrl;
  document.getElementById('analyzed-at').textContent = '診断日時: ' + (data.analyzedAt || '-');

  // ---- 総合スコア ----
  document.getElementById('total-score').textContent = data.totalScore ?? '-';
  document.getElementById('total-grade').textContent = 'Grade ' + (data.grade || '-');
  document.getElementById('hero-title').textContent = data.heroTitle || '';
  document.getElementById('hero-desc').textContent  = data.heroDesc  || '';

  // ---- 各セクション ----
  if (data.radar)     { renderRadar(data.radar); renderRadarLegend(data.radar); }
  if (data.structure) renderStructure(data.structure);
  if (data.actions)   renderActions(data.actions);

  /* ================ レンダラ ================ */

  function renderRadar(radar) {
    const ctx = document.getElementById('radar-chart');
    if (!ctx || typeof Chart === 'undefined') return;
    new Chart(ctx, {
      type: 'radar',
      data: {
        labels: radar.map(r => r.name),
        datasets: [{
          label: 'レベル (L1〜L5)',
          data: radar.map(r => r.level),
          fill: false,
          backgroundColor: 'transparent',
          borderColor: 'rgba(7, 0, 88, 1)',
          borderWidth: 2.5,
          pointBackgroundColor: 'rgba(230, 0, 18, 1)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => 'レベル ' + ctx.parsed.r + ' / 5' } }
        },
        scales: {
          r: {
            min: 0, max: 5,
            ticks: { stepSize: 1, display: false },
            pointLabels: {
              font: { size: 13, weight: '700', family: "'Noto Serif JP', serif" },
              color: '#070058'
            },
            grid:       { color: 'rgba(7, 0, 88, 0.08)' },
            angleLines: { color: 'rgba(7, 0, 88, 0.08)' }
          }
        }
      }
    });
  }

  function renderRadarLegend(radar) {
    const el = document.getElementById('radar-legend');
    if (!el) return;
    el.innerHTML = radar.map(r => `
      <li class="radar-legend-item">
        <div>
          <div class="radar-legend-name">${escape(r.name)}</div>
          <div style="font-size:12px;color:#5a5a5a;line-height:1.6;margin-top:4px">${escape(r.description)}</div>
        </div>
        <span class="radar-legend-level lv-${r.level}">L${r.level}</span>
      </li>
    `).join('');
  }

  function renderStructure(structure) {
    const el = document.getElementById('structure-grid');
    if (!el) return;
    el.innerHTML = structure.map(cat => `
      <div class="structure-category">
        <div class="structure-category-head">
          <h3 class="structure-category-title">${escape(cat.title)}</h3>
          <span class="structure-category-score">${escape(cat.score)}</span>
        </div>
        <ul class="structure-items">
          ${(cat.items || []).map(item => `
            <li class="structure-item">
              <span class="structure-item-mark mark-${item.status}">${statusIcon(item.status)}</span>
              <span class="structure-item-label">
                ${escape(item.label)}
                ${item.note ? `<small class="structure-item-note">${escape(item.note)}</small>` : ''}
              </span>
            </li>
          `).join('')}
        </ul>
      </div>
    `).join('');
  }

  function renderActions(actions) {
    const el = document.getElementById('actions-list');
    if (!el) return;
    el.innerHTML = actions.map((a, i) => `
      <li class="action-item">
        <span class="action-num">${String(i + 1).padStart(2, '0')}</span>
        <div class="action-body">
          <h3>${escape(a.title)}</h3>
          <p>${escape(a.body)}</p>
        </div>
        <div class="action-meta">
          <span class="action-tag tag-impact">${escape(a.impact)}</span>
          <span class="action-tag tag-ease">${escape(a.ease)}</span>
        </div>
      </li>
    `).join('');
  }

  /* ================ utils ================ */
  function statusIcon(s) { return s === 'ok' ? '✓' : s === 'warn' ? '!' : '×'; }
  function escape(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
})();
