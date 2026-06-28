/* ============================================
   图表配置与初始化 - 全部使用后端真实数据
   ============================================ */

// Chart.js 默认配置（仅在 Chart.js 已加载时设置）
if (typeof Chart !== 'undefined') {
  Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
}

// 检查 Chart.js 是否可用
function isChartReady() {
  return typeof Chart !== 'undefined';
}

function isDark() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

// 如果 Chart.js 3 秒后仍未加载，显示错误提示
setTimeout(() => {
  if (!isChartReady()) {
    document.querySelectorAll('canvas').forEach(canvas => {
      const parent = canvas.parentElement;
      if (parent) {
        parent.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ef4444;font-size:14px;">Chart.js 加载失败，请检查网络连接</div>';
      }
    });
  }
}, 5000);

// 获取主题颜色（与 CSS 变量同步）
function getChartColors() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    primary: isDark ? '#8b7cf7' : '#6c5ce7',
    primaryLight: isDark ? 'rgba(139, 124, 247, 0.12)' : 'rgba(108, 92, 231, 0.08)',
    success: isDark ? '#3ecf8e' : '#0d9488',
    successLight: isDark ? 'rgba(62, 207, 142, 0.1)' : 'rgba(13, 148, 136, 0.08)',
    warning: isDark ? '#f0b429' : '#d97706',
    warningLight: isDark ? 'rgba(240, 180, 41, 0.1)' : 'rgba(217, 119, 6, 0.08)',
    danger: isDark ? '#e5484d' : '#dc2626',
    dangerLight: isDark ? 'rgba(229, 72, 77, 0.1)' : 'rgba(220, 38, 38, 0.08)',
    info: isDark ? '#60a5fa' : '#2563eb',
    infoLight: isDark ? 'rgba(96, 165, 250, 0.1)' : 'rgba(37, 99, 235, 0.08)',
    text: isDark ? '#e8e8ec' : '#1a1a1e',
    textSecondary: isDark ? '#8888a0' : '#6b6b76',
    grid: isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(0, 0, 0, 0.06)',
    background: isDark ? '#18181c' : '#ffffff',
    palette: isDark
      ? ['#8b7cf7', '#3ecf8e', '#f0b429', '#e5484d', '#60a5fa', '#e879f9', '#f97316', '#2dd4bf']
      : ['#6c5ce7', '#0d9488', '#d97706', '#dc2626', '#2563eb', '#c026d3', '#ea580c', '#0d9488'],
  };
}

// 图表实例存储
const chartInstances = {};

function destroyChart(chartId) {
  if (chartInstances[chartId]) {
    chartInstances[chartId].destroy();
    delete chartInstances[chartId];
  }
}

// 安全创建图表：处理 canvas 在 display:none 时尺寸为 0 的问题
function createChart(chartId, canvasEl, config) {
  if (!isChartReady()) {
    console.warn('Chart.js not loaded, deferring chart creation:', chartId);
    setTimeout(() => createChart(chartId, canvasEl, config), 500);
    return null;
  }

  // 如果 canvas 还没有尺寸（display:none），延迟重试
  const rect = canvasEl.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    setTimeout(() => createChart(chartId, canvasEl, config), 100);
    return null;
  }

  destroyChart(chartId);
  try {
    chartInstances[chartId] = new Chart(canvasEl, config);
  } catch (e) {
    console.error(`Chart ${chartId} creation failed:`, e);
    return null;
  }

  // 多次延迟 resize 确保 canvas 尺寸正确
  const chart = chartInstances[chartId];
  const doResize = () => {
    if (chart && typeof chart.resize === 'function') {
      chart.resize();
      chart.update('none');
    }
  };
  requestAnimationFrame(doResize);
  setTimeout(doResize, 200);
  setTimeout(doResize, 500);
  return chart;
}

// ==================== 仪表盘图表（使用真实数据）====================

// Token 趋势迷你图
function initTrendMiniChart(stats) {
  destroyChart('trend-mini');
  const ctx = document.getElementById('chart-trend-mini');
  if (!ctx) return;
  const colors = getChartColors();

  const usage = stats?.hourlyUsage?.length ? stats.hourlyUsage : stats?.dailyUsage || [];

  if (usage.length === 0) {
    createChart('trend-mini', ctx, {
      type: 'line',
      data: { labels: ['暂无数据'], datasets: [{ data: [0], borderColor: colors.primary }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    });
    return;
  }

  const recent = usage.slice(-24);
  const labels = recent.map(d => {
    if (stats?.hourlyUsage?.length) {
      const parts = d.date.split(' ');
      return parts[1] || d.date;
    }
    const parts = d.date.split('-');
    return parts[1] + '/' + parts[2];
  });

  createChart('trend-mini', ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Token 使用量',
        data: recent.map(d => d.tokens),
        borderColor: colors.primary,
        backgroundColor: colors.primaryLight,
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.background,
          titleColor: colors.text,
          bodyColor: colors.textSecondary,
          borderColor: colors.grid,
          borderWidth: 1,
          padding: 12,
          callbacks: { label: (ctx) => `${ctx.parsed.y.toLocaleString()} tokens` },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: colors.textSecondary, font: { size: 11 } } },
        y: { grid: { color: colors.grid }, ticks: { color: colors.textSecondary, font: { size: 11 }, callback: v => v >= 1000 ? (v / 1000) + 'K' : v } },
      },
      interaction: { intersect: false, mode: 'index' },
    },
  });
}

// 任务分布迷你图
function initTaskMiniChart(stats) {
  destroyChart('task-mini');
  const ctx = document.getElementById('chart-task-mini');
  if (!ctx) return;
  const colors = getChartColors();

  const dist = stats?.taskDistribution || {};
  const labels = Object.keys(dist);
  const data = Object.values(dist);

  if (labels.length === 0) {
    createChart('task-mini', ctx, {
      type: 'doughnut',
      data: { labels: ['暂无数据'], datasets: [{ data: [1], backgroundColor: [colors.grid] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    });
    return;
  }

  createChart('task-mini', ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.palette.slice(0, labels.length),
        borderWidth: 0,
        hoverOffset: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { color: colors.textSecondary, padding: 16, usePointStyle: true, pointStyleWidth: 8, font: { size: 11 } } },
        tooltip: {
          backgroundColor: colors.background,
          titleColor: colors.text,
          bodyColor: colors.textSecondary,
          borderColor: colors.grid,
          borderWidth: 1,
          padding: 12,
          callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed} 个对话` },
        },
      },
    },
  });
}

// ==================== 数据大屏图表（使用真实数据）====================

// Token 趋势全屏图
function initTrendFullChart(stats) {
  destroyChart('trend-full');
  const ctx = document.getElementById('chart-trend-full');
  if (!ctx) return;
  const colors = getChartColors();

  const usage = stats?.hourlyUsage?.length ? stats.hourlyUsage : stats?.dailyUsage || [];

  if (usage.length === 0) {
    createChart('trend-full', ctx, {
      type: 'line',
      data: { labels: ['暂无数据'], datasets: [{ data: [0] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    });
    return;
  }

  const labels = usage.map(d => {
    if (stats?.hourlyUsage?.length) {
      const parts = d.date.split(' ');
      return parts[1] || d.date;
    }
    const parts = d.date.split('-');
    return parts[1] + '/' + parts[2];
  });

  // Canvas 渐变（使用实际 canvas 高度）
  const canvasCtx = ctx.getContext('2d');
  const h = ctx.height || 300;
  const gradPrimary = canvasCtx.createLinearGradient(0, 0, 0, h);
  gradPrimary.addColorStop(0, colors.primaryLight);
  gradPrimary.addColorStop(1, 'rgba(132, 116, 247, 0)');

  const gradSuccess = canvasCtx.createLinearGradient(0, 0, 0, h);
  gradSuccess.addColorStop(0, colors.successLight);
  gradSuccess.addColorStop(1, 'rgba(61, 214, 140, 0)');

  // 竖线插件 - 交叉准线
  const crosshairPlugin = {
    id: 'crosshair',
    afterDraw(chart) {
      if (chart.tooltip?._active?.length) {
        const x = chart.tooltip._active[0].element.x;
        const yAxis = chart.scales.y;
        const ctx2 = chart.ctx;
        ctx2.save();
        ctx2.beginPath();
        ctx2.setLineDash([3, 3]);
        ctx2.moveTo(x, yAxis.top);
        ctx2.lineTo(x, yAxis.bottom);
        ctx2.lineWidth = 1;
        ctx2.strokeStyle = isDark() ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
        ctx2.stroke();
        ctx2.restore();
      }
    }
  };

  createChart('trend-full', ctx, {
    type: 'line',
    plugins: [crosshairPlugin],
    data: {
      labels,
      datasets: [
        {
          label: '输入 Token',
          data: usage.map(d => d.inputTokens || 0),
          borderColor: colors.primary,
          backgroundColor: gradPrimary,
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: colors.primary,
          pointHoverBorderColor: isDark() ? '#1e1e24' : '#fff',
          pointHoverBorderWidth: 3,
        },
        {
          label: '输出 Token',
          data: usage.map(d => d.outputTokens || 0),
          borderColor: colors.success,
          backgroundColor: gradSuccess,
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: colors.success,
          pointHoverBorderColor: isDark() ? '#1e1e24' : '#fff',
          pointHoverBorderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 800, easing: 'easeOutQuart' },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { color: colors.textSecondary, padding: 16, usePointStyle: true, pointStyleWidth: 8, font: { size: 11 } } },
        tooltip: {
          backgroundColor: isDark() ? 'rgba(22,22,26,0.95)' : 'rgba(255,255,255,0.95)',
          titleColor: colors.text,
          bodyColor: colors.textSecondary,
          borderColor: isDark() ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          borderWidth: 1,
          padding: 14,
          cornerRadius: 10,
          displayColors: true,
          boxPadding: 6,
          usePointStyle: true,
          callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()}` },
        },
      },
      scales: {
        x: {
          grid: { color: colors.grid, drawBorder: false },
          ticks: { color: colors.textSecondary, font: { size: 10 }, maxTicksLimit: 10 },
          border: { display: false },
        },
        y: {
          grid: { color: colors.grid, drawBorder: false },
          ticks: { color: colors.textSecondary, font: { size: 10 }, callback: v => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v },
          border: { display: false },
        },
      },
    },
  });
}

// 模型分布图
function initModelChart(stats) {
  destroyChart('model');
  const ctx = document.getElementById('chart-model');
  if (!ctx) return;
  const colors = getChartColors();

  const dist = stats?.modelDistribution || {};
  const labels = Object.keys(dist);
  const data = Object.values(dist);
  const total = data.reduce((s, v) => s + v, 0);

  if (labels.length === 0) {
    createChart('model', ctx, {
      type: 'doughnut',
      data: { labels: ['暂无数据'], datasets: [{ data: [1], backgroundColor: [colors.grid] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    });
    return;
  }

  // 中心文字插件
  const centerTextPlugin = {
    id: 'centerText',
    afterDraw(chart) {
      const { ctx: c, width, height } = chart;
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const centerX = width / 2;
      const centerY = height / 2;
      c.font = `700 22px ${getComputedStyle(document.documentElement).getPropertyValue('--font-display') || 'system-ui'}`;
      c.fillStyle = colors.text;
      c.fillText(total, centerX, centerY - 8);
      c.font = `500 10px ${getComputedStyle(document.documentElement).getPropertyValue('--font-sans') || 'system-ui'}`;
      c.fillStyle = colors.textSecondary;
      c.fillText('总次数', centerX, centerY + 12);
      c.restore();
    }
  };

  createChart('model', ctx, {
    type: 'doughnut',
    plugins: [centerTextPlugin],
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.palette.slice(0, labels.length),
        borderWidth: 0,
        hoverOffset: 8,
        hoverBorderColor: isDark() ? '#1e1e24' : '#fff',
        hoverBorderWidth: 3,
        borderRadius: 3,
        spacing: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      animation: { animateRotate: true, duration: 1000, easing: 'easeOutQuart' },
      plugins: {
        legend: { position: 'right', labels: { color: colors.textSecondary, padding: 12, usePointStyle: true, pointStyleWidth: 8, font: { size: 11 }, generateLabels: (chart) => {
          const ds = chart.data.datasets[0];
          return chart.data.labels.map((label, i) => ({
            text: `${label}  ${ds.data[i]}`,
            fillStyle: ds.backgroundColor[i],
            strokeStyle: 'transparent',
            pointStyle: 'circle',
            index: i,
          }));
        }}},
        tooltip: {
          backgroundColor: isDark() ? 'rgba(22,22,26,0.95)' : 'rgba(255,255,255,0.95)',
          titleColor: colors.text,
          bodyColor: colors.textSecondary,
          borderColor: isDark() ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          borderWidth: 1,
          padding: 14,
          cornerRadius: 10,
          boxPadding: 6,
          callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed} 次 (${Math.round(ctx.parsed / total * 100)}%)` },
        },
      },
    },
  });
}

// 任务类型分布图
function initTaskFullChart(stats) {
  destroyChart('task-full');
  const ctx = document.getElementById('chart-task-full');
  if (!ctx) return;
  const colors = getChartColors();

  const dist = stats?.taskDistribution || {};
  const labels = Object.keys(dist);
  const data = Object.values(dist);
  const total = data.reduce((s, v) => s + v, 0);

  if (labels.length === 0) {
    createChart('task-full', ctx, {
      type: 'bar',
      data: { labels: ['暂无数据'], datasets: [{ data: [0] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    });
    return;
  }

  // 渐变色条
  const palette = colors.palette.slice(0, labels.length);
  const bgColors = palette.map(c => c + 'cc');
  const hoverColors = palette;

  createChart('task-full', ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '对话数量',
        data,
        backgroundColor: bgColors,
        hoverBackgroundColor: hoverColors,
        borderWidth: 0,
        borderRadius: 8,
        borderSkipped: false,
        barPercentage: 0.55,
        categoryPercentage: 0.8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark() ? 'rgba(22,22,26,0.95)' : 'rgba(255,255,255,0.95)',
          titleColor: colors.text,
          bodyColor: colors.textSecondary,
          borderColor: isDark() ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          borderWidth: 1,
          padding: 14,
          cornerRadius: 10,
          boxPadding: 6,
          callbacks: {
            label: (ctx) => ` ${ctx.parsed.y} 个对话`,
            afterLabel: (ctx) => `占比 ${Math.round(ctx.parsed.y / total * 100)}%`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: colors.textSecondary, font: { size: 11, weight: '500' } },
          border: { display: false },
        },
        y: {
          grid: { color: colors.grid, drawBorder: false },
          ticks: { color: colors.textSecondary, font: { size: 10 }, stepSize: 1 },
          beginAtZero: true,
          border: { display: false },
        },
      },
    },
  });
}

// ==================== 热力图（真实数据）====================

function renderHeatmap(stats) {
  const container = document.getElementById('heatmap-container');
  if (!container) return;

  const dailyUsage = stats?.dailyUsage || [];

  if (dailyUsage.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>暂无活动数据</p><p style="font-size:11px;margin-top:4px;">导入对话后将显示活动热力图</p></div>';
    return;
  }

  // 构建日期映射
  const maxTokens = Math.max(...dailyUsage.map(d => d.tokens), 1);
  const dateMap = {};
  dailyUsage.forEach(d => { dateMap[d.date] = d.tokens; });

  // 最近 20 周
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (20 * 7 - 1) - startDate.getDay());

  const dk = isDark();
  const colors = dk
    ? ['rgba(255,255,255,0.03)', 'rgba(132,116,247,0.18)', 'rgba(132,116,247,0.38)', 'rgba(132,116,247,0.62)', '#8474f7']
    : ['rgba(0,0,0,0.04)', 'rgba(108,92,231,0.12)', 'rgba(108,92,231,0.28)', 'rgba(108,92,231,0.52)', '#6c5ce7'];

  // 月份标签行
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  let monthLabelsHtml = '';
  let lastMonth = -1;
  const tempDate = new Date(startDate);
  let weekIdx = 0;
  while (tempDate <= today) {
    const m = tempDate.getMonth();
    if (m !== lastMonth && tempDate.getDay() === 0) {
      monthLabelsHtml += `<div style="grid-column:${weekIdx + 1};font-size:10px;color:var(--text-4);white-space:nowrap;">${months[m]}</div>`;
      lastMonth = m;
    }
    if (tempDate.getDay() === 0) weekIdx++;
    tempDate.setDate(tempDate.getDate() + 1);
  }

  // 星期标签
  const dayLabels = ['日', '一', '', '三', '', '五', ''];

  // 构建网格列数
  const totalDays = Math.ceil((today - startDate) / (1000 * 60 * 60 * 24)) + 1;
  const totalWeeks = Math.ceil(totalDays / 7);

  let html = `<div style="display:grid;grid-template-columns:18px repeat(${totalWeeks}, 16px);grid-template-rows:auto repeat(7, 16px);gap:3px;align-items:start;">`;

  // 月份标签行（第一行，偏移星期标签列）
  html += `<div></div>${monthLabelsHtml}`;

  // 星期标签 + 数据单元格
  const current = new Date(startDate);
  const cells = [];
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
    const dow = current.getDay();
    const weekNum = Math.floor((current - startDate) / (1000 * 60 * 60 * 24 * 7));
    cells.push({ dateStr, tokens, level, dow, weekNum });
    current.setDate(current.getDate() + 1);
  }

  // 按行（星期）渲染
  for (let dow = 0; dow < 7; dow++) {
    html += `<div style="display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text-4);height:16px;">${dayLabels[dow]}</div>`;
    for (let w = 0; w < totalWeeks; w++) {
      const cell = cells.find(c => c.dow === dow && c.weekNum === w);
      if (cell) {
        html += `<div class="hm-cell" title="${cell.dateStr}\n${cell.tokens.toLocaleString()} tokens" style="width:16px;height:16px;border-radius:3px;background:${colors[cell.level]};cursor:default;transition:all 0.15s;" onmouseover="this.style.transform='scale(1.6)';this.style.boxShadow='0 0 8px ${colors[cell.level]}'" onmouseout="this.style.transform='scale(1)';this.style.boxShadow='none'"></div>`;
      } else {
        html += `<div style="width:16px;height:16px;"></div>`;
      }
    }
  }

  html += '</div>';

  // 图例
  html += '<div style="display:flex;align-items:center;gap:6px;margin-top:14px;font-size:10px;color:var(--text-4);padding-left:22px;"><span>少</span>';
  colors.forEach(c => {
    html += `<div style="width:12px;height:12px;border-radius:2px;background:${c};"></div>`;
  });
  html += '<span>多</span></div>';

  container.innerHTML = html;
}

// ==================== 高效对话 TOP5 ====================

function renderTopConversations(conversations) {
  const container = document.getElementById('top-conversations');
  if (!container) return;

  if (!conversations || conversations.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>暂无对话数据</p></div>';
    return;
  }

  const sorted = [...conversations]
    .filter(c => c.valueScore > 0)
    .sort((a, b) => b.valueScore - a.valueScore)
    .slice(0, 5);

  if (sorted.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>暂无评分数据</p></div>';
    return;
  }

  const maxScore = Math.max(...sorted.map(c => c.valueScore || 0), 1);

  container.innerHTML = sorted.map((c, i) => {
    const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other';
    const scorePct = Math.round((c.valueScore || 0) / maxScore * 100);
    return `<div class="top-item" onclick="viewConversation('${c.id}')">
      <div class="top-rank ${rankClass}">${i + 1}</div>
      <div class="top-info">
        <div class="top-title">${escapeHtml(c.title || '')}</div>
        <div class="top-meta">${c.modelDisplay || c.model || ''} · ${c.taskType || ''}</div>
      </div>
      <div class="top-score-bar">
        <div class="top-score-track"><div class="top-score-fill" style="width:${scorePct}%"></div></div>
        <div class="top-score">${c.valueScore}</div>
      </div>
    </div>`;
  }).join('');
}

// ==================== 概览统计 ====================

function renderOverviewStats(stats, conversations) {
  const el = (id) => document.getElementById(id);

  if (el('avg-response')) {
    const avg = conversations.length > 0
      ? Math.round(conversations.reduce((s, c) => s + (c.messageCount || 0), 0) / conversations.length)
      : 0;
    el('avg-response').textContent = `${avg} msg`;
  }

  if (el('top-model')) {
    const models = stats?.modelDistribution || {};
    const sorted = Object.entries(models).sort((a, b) => b[1] - a[1]);
    el('top-model').textContent = sorted.length > 0 ? sorted[0][0] : '-';
  }

  if (el('recent-cost')) {
    el('recent-cost').textContent = '$' + (stats?.recentCost || 0).toFixed(4);
  }

  if (el('recent-tokens')) {
    el('recent-tokens').textContent = formatNumberChart(stats?.recentTokens || 0);
  }

  if (el('project-coverage')) {
    el('project-coverage').textContent = (stats?.totalProjects || 0) + ' 个项目';
  }
}

// ==================== 费用分布图 ====================

function initCostChart(stats) {
  destroyChart('cost');
  const ctx = document.getElementById('chart-cost');
  if (!ctx) return;
  const colors = getChartColors();

  const dist = stats?.modelCostDistribution || {};
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const labels = entries.map(e => e[0]);
  const data = entries.map(e => Math.round(e[1] * 10000) / 10000);

  if (labels.length === 0) {
    createChart('cost', ctx, {
      type: 'bar',
      data: { labels: ['暂无数据'], datasets: [{ data: [0] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    });
    return;
  }

  createChart('cost', ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '费用 ($)',
        data,
        backgroundColor: colors.palette.slice(0, labels.length).map(c => c + 'aa'),
        hoverBackgroundColor: colors.palette.slice(0, labels.length),
        borderWidth: 0,
        borderRadius: 4,
        borderSkipped: false,
        barPercentage: 0.65,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark() ? '#1e1e24' : '#fff',
          titleColor: colors.text,
          bodyColor: colors.textSecondary,
          borderColor: colors.grid,
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          callbacks: { label: (ctx) => ` $${ctx.parsed.x.toFixed(4)}` },
        },
      },
      scales: {
        x: {
          grid: { color: colors.grid, drawBorder: false },
          ticks: { color: colors.textSecondary, font: { size: 10 }, callback: v => '$' + v.toFixed(2) },
          border: { display: false },
        },
        y: {
          grid: { display: false },
          ticks: { color: colors.textSecondary, font: { size: 11 } },
          border: { display: false },
        },
      },
    },
  });
}

// 工具函数
function formatNumberChart(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

// 工具函数
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 主题变化时重新初始化图表
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.attributeName === 'data-theme') {
      setTimeout(() => {
        const s = window._lastStats;
        if (!s) return;
        // 仪表盘图表
        initTrendMiniChart(s);
        initTaskMiniChart(s);
        // 数据大屏图表（仅在可见时重建）
        const analyticsPage = document.getElementById('page-analytics');
        if (analyticsPage?.classList.contains('active')) {
          initTrendFullChart(s);
          initModelChart(s);
          initTaskFullChart(s);
          initCostChart(s);
          renderHeatmap(s);
        }
      }, 100);
    }
  });
});

observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// 窗口大小变化时调整图表
window.addEventListener('resize', () => {
  Object.values(chartInstances).forEach(chart => {
    if (chart && typeof chart.resize === 'function') chart.resize();
  });
});

// Canvas 在 display:none 时初始化会导致尺寸为 0
// 用 ResizeObserver 监听 canvas 可见后自动 resize
const resizeObserver = new ResizeObserver(entries => {
  for (const entry of entries) {
    const canvas = entry.target;
    if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
      // 找到对应的 chart 实例并触发 resize
      Object.values(chartInstances).forEach(chart => {
        if (chart && chart.canvas === canvas && typeof chart.resize === 'function') {
          chart.resize();
          chart.update('none');
        }
      });
    }
  }
});

// 对所有 chart canvas 注册 ResizeObserver
function observeCanvas(canvasId) {
  const el = document.getElementById(canvasId);
  if (el) resizeObserver.observe(el);
}

document.addEventListener('DOMContentLoaded', () => {
  ['chart-trend-mini', 'chart-task-mini', 'chart-trend-full', 'chart-model', 'chart-task-full'].forEach(observeCanvas);
});
