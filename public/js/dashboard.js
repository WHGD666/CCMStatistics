/* ============================================
   政企数据大屏 — 数据加载与图表
   ============================================ */

const API = '';
let refreshTimer = null;
const chartInstances = {};

// ============================================
// 初始化
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  startClock();
  await loadDashboard();
  // 每 30 秒自动刷新
  refreshTimer = setInterval(loadDashboard, 30000);
});

async function loadDashboard() {
  const loadingBar = document.getElementById('loading-bar');
  if (loadingBar) loadingBar.classList.remove('done');

  try {
    const [statsRes, convRes] = await Promise.all([
      fetch(`${API}/api/stats`),
      fetch(`${API}/api/conversations`),
    ]);
    const stats = await statsRes.json();
    const conversations = (await convRes.json()).conversations || [];

    renderKPI(stats);
    renderTrendChart(stats);
    renderModelChart(stats);
    renderTaskChart(stats);
    renderCostBar(stats);
    renderHeatmap(stats);
    renderTopList(conversations);
    renderOverview(stats, conversations);
  } catch (err) {
    console.error('Dashboard load error:', err);
  } finally {
    if (loadingBar) loadingBar.classList.add('done');
  }
}

// ============================================
// 时钟
// ============================================
function startClock() {
  const clockEl = document.getElementById('dash-clock');
  const dateEl = document.getElementById('dash-date');
  if (!clockEl) return;

  function tick() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    clockEl.textContent = `${h}:${m}:${s}`;

    if (dateEl) {
      const y = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const days = ['日', '一', '二', '三', '四', '五', '六'];
      dateEl.textContent = `${y}-${mo}-${d} 星期${days[now.getDay()]}`;
    }
  }
  tick();
  setInterval(tick, 1000);
}

// ============================================
// KPI 卡片
// ============================================
function renderKPI(stats) {
  const el = (id) => document.getElementById(id);
  if (el('kpi-cost')) el('kpi-cost').textContent = '$' + (stats.totalCost || 0).toFixed(4);
  if (el('kpi-tokens')) el('kpi-tokens').textContent = formatNum(stats.totalTokens || 0);
  if (el('kpi-convos')) el('kpi-convos').textContent = stats.totalConversations || 0;
  if (el('kpi-projects')) el('kpi-projects').textContent = stats.totalProjects || 0;
  if (el('kpi-score')) el('kpi-score').textContent = stats.averageValueScore || 0;
  if (el('kpi-recent-cost')) el('kpi-recent-cost').textContent = '$' + (stats.recentCost || 0).toFixed(4);

  // 7日趋势
  if (el('kpi-recent-sub')) {
    const recentPct = stats.totalConversations > 0
      ? Math.round((stats.recentCount || 0) / stats.totalConversations * 100)
      : 0;
    el('kpi-recent-sub').innerHTML = `<span class="up">↑ ${recentPct}%</span> 近7天占比`;
  }
}

// ============================================
// Chart.js 工具
// ============================================
function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

function getCtx(id) {
  return document.getElementById(id);
}

function getColors() {
  return {
    blue: '#00d4ff',
    blueLight: 'rgba(0,212,255,0.08)',
    cyan: '#00ffd5',
    cyanLight: 'rgba(0,255,213,0.08)',
    gold: '#ffd700',
    green: '#00ff88',
    red: '#ff4757',
    purple: '#a855f7',
    orange: '#ff9f43',
    text: '#8892b0',
    textDim: '#4a5578',
    grid: 'rgba(0,212,255,0.06)',
    bg: '#0e1434',
    palette: ['#00d4ff', '#00ffd5', '#ffd700', '#00ff88', '#a855f7', '#ff9f43', '#ff4757', '#5b9cf6'],
  };
}

// ============================================
// Token 趋势图
// ============================================
function renderTrendChart(stats) {
  destroyChart('trend');
  const ctx = getCtx('chart-trend');
  if (!ctx) return;
  const c = getColors();

  const usage = stats?.hourlyUsage?.length ? stats.hourlyUsage : stats?.dailyUsage || [];
  if (usage.length === 0) {
    emptyCanvas(ctx, '暂无数据');
    return;
  }

  const labels = usage.map(d => {
    if (stats?.hourlyUsage?.length) {
      const parts = d.date.split(' ');
      return parts[1] || d.date;
    }
    const p = d.date.split('-');
    return p[1] + '/' + p[2];
  });

  const g1 = ctx.getContext('2d');
  const grad1 = g1.createLinearGradient(0, 0, 0, ctx.parentElement.clientHeight || 200);
  grad1.addColorStop(0, 'rgba(0,212,255,0.2)');
  grad1.addColorStop(1, 'rgba(0,212,255,0)');

  const grad2 = g1.createLinearGradient(0, 0, 0, ctx.parentElement.clientHeight || 200);
  grad2.addColorStop(0, 'rgba(0,255,213,0.15)');
  grad2.addColorStop(1, 'rgba(0,255,213,0)');

  chartInstances['trend'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '输入 Token',
          data: usage.map(d => d.inputTokens || 0),
          borderColor: c.blue,
          backgroundColor: grad1,
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: c.blue,
        },
        {
          label: '输出 Token',
          data: usage.map(d => d.outputTokens || 0),
          borderColor: c.cyan,
          backgroundColor: grad2,
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: c.cyan,
        },
      ],
    },
    options: chartOptions(c, 'stacked'),
  });
}

// ============================================
// 模型分布
// ============================================
function renderModelChart(stats) {
  destroyChart('model');
  const ctx = getCtx('chart-model');
  if (!ctx) return;
  const c = getColors();

  const dist = stats?.modelDistribution || {};
  const labels = Object.keys(dist);
  const data = Object.values(dist);

  if (labels.length === 0) {
    emptyCanvas(ctx, '暂无数据');
    return;
  }

  chartInstances['model'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: c.palette.slice(0, labels.length),
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'right',
          labels: { color: c.text, padding: 10, usePointStyle: true, pointStyleWidth: 6, font: { size: 10 } },
        },
        tooltip: tooltipOpts(c),
      },
    },
  });
}

// ============================================
// 任务分布
// ============================================
function renderTaskChart(stats) {
  destroyChart('task');
  const ctx = getCtx('chart-task');
  if (!ctx) return;
  const c = getColors();

  const dist = stats?.taskDistribution || {};
  const labels = Object.keys(dist);
  const data = Object.values(dist);

  if (labels.length === 0) {
    emptyCanvas(ctx, '暂无数据');
    return;
  }

  chartInstances['task'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: c.palette.slice(0, labels.length).map(col => col + 'aa'),
        hoverBackgroundColor: c.palette.slice(0, labels.length),
        borderWidth: 0,
        borderRadius: 4,
        barPercentage: 0.5,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: tooltipOpts(c),
      },
      scales: {
        x: { grid: { color: c.grid }, ticks: { color: c.textDim, font: { size: 10 }, stepSize: 1 }, border: { display: false } },
        y: { grid: { display: false }, ticks: { color: c.text, font: { size: 11 } }, border: { display: false } },
      },
    },
  });
}

// ============================================
// 项目费用排行
// ============================================
function renderCostBar(stats) {
  const container = document.getElementById('cost-bar-list');
  if (!container) return;

  const dist = stats?.projectDistribution || {};
  const costDist = stats?.modelCostDistribution || {};

  // 用项目分布数据（没有单独的项目费用，用对话数代替排序）
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = entries.length > 0 ? entries[0][1] : 1;

  if (entries.length === 0) {
    container.innerHTML = '<div class="dash-empty"><div class="dash-empty-icon">--</div>暂无项目数据</div>';
    return;
  }

  container.innerHTML = entries.map(([name, count]) => {
    const pct = Math.round(count / max * 100);
    return `<div class="cost-bar-item">
      <div class="cost-bar-name" title="${esc(name)}">${esc(name)}</div>
      <div class="cost-bar-track"><div class="cost-bar-fill" style="width:${pct}%"></div></div>
      <div class="cost-bar-value">${count} 次</div>
    </div>`;
  }).join('');
}

// ============================================
// 热力图
// ============================================
function renderHeatmap(stats) {
  const container = document.getElementById('heatmap-container');
  if (!container) return;

  const daily = stats?.dailyUsage || [];
  if (daily.length === 0) {
    container.innerHTML = '<div class="dash-empty"><div class="dash-empty-icon">--</div>暂无活动数据</div>';
    return;
  }

  const maxTokens = Math.max(...daily.map(d => d.tokens), 1);
  const dateMap = {};
  daily.forEach(d => { dateMap[d.date] = d.tokens; });

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (16 * 7 - 1) - startDate.getDay());

  const colors = [
    'rgba(0,212,255,0.04)',
    'rgba(0,212,255,0.15)',
    'rgba(0,212,255,0.3)',
    'rgba(0,212,255,0.5)',
    '#00d4ff',
  ];

  const dayLabels = ['', '一', '', '三', '', '五', ''];
  let html = '<div style="display:flex;gap:3px;">';
  html += '<div style="display:flex;flex-direction:column;gap:3px;margin-right:4px;">';
  dayLabels.forEach(d => {
    html += `<div class="heatmap-label">${d}</div>`;
  });
  html += '</div><div class="heatmap-grid">';

  const current = new Date(startDate);
  while (current <= today) {
    const dateStr = current.toISOString().split('T')[0];
    const tokens = dateMap[dateStr] || 0;
    let level = 0;
    if (tokens > 0) {
      const ratio = tokens / maxTokens;
      if (ratio > 0.75) level = 4;
      else if (ratio > 0.5) level = 3;
      else if (ratio > 0.25) level = 2;
      else level = 1;
    }
    html += `<div class="heatmap-cell" title="${dateStr}: ${tokens.toLocaleString()} tokens" style="background:${colors[level]}"></div>`;
    current.setDate(current.getDate() + 1);
  }
  html += '</div></div>';

  html += '<div class="heatmap-legend"><span>少</span>';
  colors.forEach(c => { html += `<div class="heatmap-legend-cell" style="background:${c}"></div>`; });
  html += '<span>多</span></div>';

  container.innerHTML = html;
}

// ============================================
// TOP 5
// ============================================
function renderTopList(conversations) {
  const container = document.getElementById('top-list');
  if (!container) return;

  const sorted = [...conversations]
    .filter(c => c.valueScore > 0)
    .sort((a, b) => b.valueScore - a.valueScore)
    .slice(0, 5);

  if (sorted.length === 0) {
    container.innerHTML = '<div class="dash-empty"><div class="dash-empty-icon">--</div>暂无评分数据</div>';
    return;
  }

  const medals = ['#1', '#2', '#3'];
  container.innerHTML = sorted.map((c, i) => `
    <div class="top-item">
      <div class="top-rank">${medals[i] || (i + 1)}</div>
      <div class="top-info">
        <div class="top-title">${esc(c.title || '')}</div>
        <div class="top-meta">${c.modelDisplay || c.model || ''} · ${c.taskType || ''}</div>
      </div>
      <div class="top-score">${c.valueScore}</div>
    </div>
  `).join('');
}

// ============================================
// 概览
// ============================================
function renderOverview(stats, conversations) {
  const container = document.getElementById('overview-list');
  if (!container) return;

  const avgMsgs = conversations.length > 0
    ? Math.round(conversations.reduce((s, c) => s + (c.messageCount || 0), 0) / conversations.length)
    : 0;

  const models = stats?.modelDistribution || {};
  const topModel = Object.entries(models).sort((a, b) => b[1] - a[1])[0];

  const items = [
    { label: '平均消息数', value: `${avgMsgs} msg` },
    { label: '最常用模型', value: topModel ? topModel[0] : '-' },
    { label: '7日费用', value: `$${(stats?.recentCost || 0).toFixed(4)}` },
    { label: '7日 Token', value: formatNum(stats?.recentTokens || 0) },
    { label: '7日对话', value: `${stats?.recentCount || 0} 次` },
    { label: 'Token 置信度', value: getConfidenceLabel(conversations) },
  ];

  container.innerHTML = items.map(item => `
    <div class="overview-item">
      <span class="overview-label">${item.label}</span>
      <span class="overview-value">${item.value}</span>
    </div>
  `).join('');
}

function getConfidenceLabel(conversations) {
  const high = conversations.filter(c => c.tokenConfidence === 'high').length;
  const total = conversations.length || 1;
  if (high / total > 0.7) return '高';
  if (high / total > 0.3) return '中';
  return '低';
}

// ============================================
// Chart 通用配置
// ============================================
function chartOptions(c, stacked) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: { color: c.text, padding: 12, usePointStyle: true, pointStyleWidth: 6, font: { size: 10 } },
      },
      tooltip: tooltipOpts(c),
    },
    scales: {
      x: {
        stacked: stacked === 'stacked',
        grid: { color: c.grid, drawBorder: false },
        ticks: { color: c.textDim, font: { size: 9 }, maxTicksLimit: 8 },
        border: { display: false },
      },
      y: {
        stacked: stacked === 'stacked',
        grid: { color: c.grid, drawBorder: false },
        ticks: {
          color: c.textDim,
          font: { size: 9 },
          callback: v => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v,
        },
        border: { display: false },
      },
    },
  };
}

function tooltipOpts(c) {
  return {
    backgroundColor: c.bg,
    titleColor: '#e8ecf4',
    bodyColor: c.text,
    borderColor: 'rgba(0,212,255,0.15)',
    borderWidth: 1,
    padding: 10,
    cornerRadius: 4,
    displayColors: true,
  };
}

function emptyCanvas(canvas, msg) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const empty = document.createElement('div');
  empty.className = 'dash-empty';
  empty.innerHTML = `<div class="dash-empty-icon">--</div>${msg}`;
  canvas.style.display = 'none';
  parent.appendChild(empty);
}

// ============================================
// 工具函数
// ============================================
function formatNum(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function esc(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
