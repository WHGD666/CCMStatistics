/* ============================================
   主应用逻辑 - 重写版
   ============================================ */

const state = {
  currentPage: 'dashboard',
  currentTheme: localStorage.getItem('theme') || 'dark',
  conversations: [],
  projects: [],
  logs: [],
  selectedFile: null,
  autoProjectName: '',
  stats: null,
  filters: { project: '', model: '', task: '', sort: 'time', order: 'desc' },
};

const API_BASE = '';

// ============================================
// 初始化
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initNavigation();
  initFileUpload();
  initFilters();
  initSearch();
  loadDashboard();
  loadLogs();
  reinitIcons();
});

function reinitIcons() {
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ============================================
// 主题系统
// ============================================
function initTheme() {
  document.documentElement.setAttribute('data-theme', state.currentTheme);
  updateThemeButtons();
  document.querySelectorAll('.theme-btn, .theme-option').forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.theme));
  });
}

function setTheme(theme) {
  state.currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  updateThemeButtons();
}

function updateThemeButtons() {
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === state.currentTheme);
  });
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === state.currentTheme);
  });
}

// ============================================
// 导航系统
// ============================================
function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });

  // 侧边栏切换
  const toggle = document.getElementById('sidebar-toggle');
  if (toggle) toggle.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('collapsed'));

  const menuBtn = document.getElementById('menu-btn');
  if (menuBtn) menuBtn.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));

  // 快速导入按钮
  const quickImport = document.getElementById('btn-import-quick');
  if (quickImport) quickImport.addEventListener('click', () => navigateTo('import'));
}

function navigateTo(page) {
  state.currentPage = page;

  // 更新导航高亮
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  // 切换页面
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add('active');

  // 更新面包屑
  const breadcrumb = document.getElementById('breadcrumb');
  const pageNames = {
    dashboard: '统计面板', analytics: '数据大屏', projects: '项目管理',
    conversations: '对话列表', import: '导入会话', logs: '操作日志', settings: '设置',
  };
  if (breadcrumb) breadcrumb.innerHTML = `<span class="breadcrumb-item">${pageNames[page] || page}</span>`;

  // 加载页面数据
  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'analytics': loadAnalytics(); break;
    case 'projects': loadProjects(); break;
    case 'conversations': loadConversations(); break;
    case 'settings': loadSettings(); break;
  }

  reinitIcons();
}

// ============================================
// 筛选系统
// ============================================
function initFilters() {
  ['filter-project', 'filter-model', 'filter-task'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => {
      state.filters.project = document.getElementById('filter-project')?.value || '';
      state.filters.model = document.getElementById('filter-model')?.value || '';
      state.filters.task = document.getElementById('filter-task')?.value || '';
      loadConversations();
    });
  });
}

// ============================================
// 搜索系统
// ============================================
function initSearch() {
  const searchInput = document.getElementById('global-search');
  if (!searchInput) return;

  let debounceTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const q = searchInput.value.trim();
      if (q.length < 2) {
        if (state.currentPage === 'conversations') loadConversations();
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (state.currentPage === 'conversations') {
          renderConversationsList(data.results || []);
        } else {
          // 在其他页面搜索时跳转到对话列表
          if (data.results && data.results.length > 0) {
            navigateTo('conversations');
            renderConversationsList(data.results || []);
          }
        }
      } catch (err) {
        console.error('Search error:', err);
      }
    }, 300);
  });
}

// ============================================
// 统计面板
// ============================================
async function loadDashboard() {
  try {
    const [statsRes, convRes] = await Promise.all([
      fetch(`${API_BASE}/api/stats`),
      fetch(`${API_BASE}/api/conversations`),
    ]);
    const stats = await statsRes.json();
    const convData = await convRes.json();

    state.stats = stats;
    state.conversations = convData.conversations || [];
    window._lastStats = stats;

    // 更新统计卡片
    updateStatCards(stats);

    // 更新图表（等待 CSS 动画完成后再初始化）
    await new Promise(resolve => setTimeout(resolve, 50));
    initTrendMiniChart(stats);
    initTaskMiniChart(stats);

    // 最近对话
    renderRecentConversations(state.conversations.slice(0, 5));

    reinitIcons();
  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

function updateStatCards(stats) {
  const el = (id) => document.getElementById(id);
  if (el('stat-conversations')) el('stat-conversations').textContent = stats.totalConversations || 0;
  if (el('stat-tokens')) el('stat-tokens').textContent = formatNumber(stats.totalTokens || 0);
  if (el('stat-projects')) el('stat-projects').textContent = stats.totalProjects || 0;
  if (el('stat-score')) el('stat-score').textContent = stats.averageValueScore || 0;
  if (el('stat-cost')) el('stat-cost').textContent = '$' + (stats.totalCost || 0).toFixed(4);

  // 更新趋势
  if (el('stat-conversations-trend')) {
    const recent = stats.recentCount || 0;
    const total = stats.totalConversations || 1;
    el('stat-conversations-trend').textContent = `${Math.round(recent / total * 100)}% 近7天`;
  }
  if (el('stat-tokens-trend')) {
    el('stat-tokens-trend').textContent = `${formatNumber(stats.recentTokens || 0)} 近7天`;
  }
  if (el('stat-cost-note')) {
    el('stat-cost-note').textContent = `近7天: $${(stats.recentCost || 0).toFixed(4)}`;
  }
}

function refreshDashboard() {
  loadDashboard();
  showToast('数据已刷新', 'success');
}

function renderRecentConversations(conversations) {
  const container = document.getElementById('recent-conversations');
  if (!container) return;

  if (!conversations || conversations.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>暂无对话</p><button class="btn btn-primary btn-small" onclick="navigateTo(\'import\')"><i data-lucide="download"></i> 导入对话</button></div>';
    reinitIcons();
    return;
  }

  container.innerHTML = conversations.map(c => `
    <div class="recent-item" onclick="viewConversation('${c.id}')">
      <div class="recent-item-icon"><i data-lucide="message-square"></i></div>
      <div class="recent-item-content">
        <div class="recent-item-title">${escapeHtml(c.title || '')}</div>
        <div class="recent-item-meta">
          <span class="tag tag-model${c.modelConfidence === 'low' ? ' tag-model-unknown' : ''}">${c.modelDisplay || c.model || '未知'}</span>
          <span class="tag tag-task-${(c.taskType || '其他').toLowerCase()}">${c.taskType || '其他'}</span>
          <span class="tag tag-cost${c.costConfidence === 'unknown' ? ' tag-cost-unknown' : ''}">$${(c.cost || 0).toFixed(4)}</span>
        </div>
      </div>
      <div class="recent-item-score">
        <span class="score-badge">${c.valueScore || 0}</span>
      </div>
    </div>`).join('');
  reinitIcons();
}

// ============================================
// 数据大屏
// ============================================
async function loadAnalytics() {
  try {
    // 显示加载状态
    ['chart-trend-full', 'chart-model', 'chart-task-full', 'chart-cost'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.opacity = '0.3';
    });

    const [statsRes, convRes] = await Promise.all([
      fetch(`${API_BASE}/api/stats`),
      fetch(`${API_BASE}/api/conversations`),
    ]);
    const stats = await statsRes.json();
    const convData = await convRes.json();

    state.stats = stats;
    state.conversations = convData.conversations || [];
    window._lastStats = stats;

    // 填充 KPI 卡片
    const el = (id) => document.getElementById(id);
    if (el('a-cost')) el('a-cost').textContent = '$' + (stats.totalCost || 0).toFixed(2);
    if (el('a-tokens')) el('a-tokens').textContent = formatNumber(stats.totalTokens || 0);
    if (el('a-convos')) el('a-convos').textContent = stats.totalConversations || 0;
    if (el('a-projects')) el('a-projects').textContent = stats.totalProjects || 0;
    if (el('a-score')) el('a-score').textContent = stats.averageValueScore || 0;

    // 等待页面完全可见后再创建图表（解决 display:none 时 canvas 尺寸为 0 的问题）
    await new Promise(resolve => setTimeout(resolve, 50));

    initTrendFullChart(stats);
    initModelChart(stats);
    initTaskFullChart(stats);
    initCostChart(stats);
    renderHeatmap(stats);
    renderTopConversations(state.conversations);
    renderOverviewStats(stats, state.conversations);

    // 恢复 opacity
    ['chart-trend-full', 'chart-model', 'chart-task-full', 'chart-cost'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.opacity = '1';
    });

    reinitIcons();
  } catch (err) {
    console.error('Analytics load error:', err);
  }
}

function refreshAnalytics() {
  loadAnalytics();
  showToast('数据已刷新', 'success');
}

// ============================================
// 项目管理
// ============================================
async function loadProjects() {
  try {
    const [projRes, convRes] = await Promise.all([
      fetch(`${API_BASE}/api/projects`),
      fetch(`${API_BASE}/api/conversations`),
    ]);
    const projData = await projRes.json();
    const convData = await convRes.json();

    state.projects = projData.projects || [];
    state.conversations = convData.conversations || [];

    renderProjects();
    populateProjectFilter();
    reinitIcons();
  } catch (err) {
    console.error('Projects load error:', err);
  }
}

function renderProjects() {
  const container = document.getElementById('projects-grid');
  if (!container) return;

  if (state.projects.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>暂无项目</p><button class="btn btn-primary btn-small" onclick="openCreateProjectModal()"><i data-lucide="plus"></i> 创建第一个项目</button></div>';
    reinitIcons();
    return;
  }

  container.innerHTML = state.projects.map(p => {
    const convos = state.conversations.filter(c => c.projectId === p.id);
    const totalTokens = convos.reduce((s, c) => s + (c.totalTokens || 0), 0);
    const totalCost = convos.reduce((s, c) => s + (c.cost || 0), 0);

    return `<div class="project-card" style="border-left: 3px solid ${p.color || '#7c6df0'}">
      <div class="project-card-header">
        <div class="project-name">${escapeHtml(p.name)}</div>
        <div class="project-actions">
          <button class="btn btn-ghost btn-small" onclick="viewProjectConversations('${p.id}')" title="查看对话"><i data-lucide="eye"></i></button>
          <button class="btn btn-ghost btn-small" onclick="deleteProject('${p.id}')" title="删除项目"><i data-lucide="trash-2"></i></button>
        </div>
      </div>
      ${p.desc ? `<div class="project-desc">${escapeHtml(p.desc)}</div>` : ''}
      <div class="project-stats">
        <div class="project-stat"><span class="project-stat-value">${convos.length}</span><span class="project-stat-label">对话</span></div>
        <div class="project-stat"><span class="project-stat-value">${formatNumber(totalTokens)}</span><span class="project-stat-label">tokens</span></div>
        <div class="project-stat"><span class="project-stat-value">$${totalCost.toFixed(4)}</span><span class="project-stat-label">费用</span></div>
      </div>
      ${convos.length > 0 ? `<button class="btn btn-ghost btn-small" style="margin-top:10px;width:100%" onclick="viewProjectConversations('${p.id}')">查看对话</button>` : ''}
    </div>`;
  }).join('');

  reinitIcons();
}

function openCreateProjectModal() {
  openModal('create-project-modal');
}

async function createProject() {
  const name = document.getElementById('project-name')?.value?.trim();
  if (!name) { showToast('请输入项目名称', 'warning'); return; }

  try {
    const res = await fetch(`${API_BASE}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        path: document.getElementById('project-path')?.value || '',
        desc: document.getElementById('project-desc')?.value || '',
        color: document.querySelector('.color-option.active')?.dataset.color || '#6366f1',
      }),
    });
    const data = await res.json();
    if (data.success) {
      closeModal('create-project-modal');
      showToast('项目创建成功', 'success');
      loadProjects();
      addLog('info', `创建项目: ${name}`);
    }
  } catch (err) {
    showToast('创建项目失败', 'error');
  }
}

async function deleteProject(id) {
  if (!confirm('确定删除该项目及其所有对话？')) return;

  try {
    const res = await fetch(`${API_BASE}/api/projects/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(`项目已删除，同时删除了 ${data.deletedConversations} 个对话`, 'success');
      loadProjects();
      addLog('warning', `删除项目及 ${data.deletedConversations} 个对话`);
    }
  } catch (err) {
    showToast('删除项目失败', 'error');
  }
}

function viewProjectConversations(projectId) {
  state.filters.project = projectId;
  const filterEl = document.getElementById('filter-project');
  if (filterEl) filterEl.value = projectId;
  navigateTo('conversations');
}

// ============================================
// 对话列表
// ============================================
async function loadConversations() {
  try {
    const params = new URLSearchParams();
    if (state.filters.project) params.set('projectId', state.filters.project);
    if (state.filters.model) params.set('model', state.filters.model);
    if (state.filters.task) params.set('taskType', state.filters.task);
    if (state.filters.sort) params.set('sort', state.filters.sort);
    if (state.filters.order) params.set('order', state.filters.order);

    const [convRes, projRes, modelsRes] = await Promise.all([
      fetch(`${API_BASE}/api/conversations?${params}`),
      fetch(`${API_BASE}/api/projects`),
      fetch(`${API_BASE}/api/models`),
    ]);

    const convData = await convRes.json();
    const projData = await projRes.json();
    const modelsData = await modelsRes.json();

    state.conversations = convData.conversations || [];
    state.projects = projData.projects || [];

    // 更新筛选下拉
    populateProjectFilter();
    populateModelFilter(modelsData.models || []);

    renderConversationsList(state.conversations);
    reinitIcons();
  } catch (err) {
    console.error('Conversations load error:', err);
  }
}

function populateProjectFilter() {
  const select = document.getElementById('filter-project');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">所有项目</option>';
  state.projects.forEach(p => {
    select.innerHTML += `<option value="${p.id}">${escapeHtml(p.name)}</option>`;
  });
  select.value = current;
}

function populateModelFilter(models) {
  const select = document.getElementById('filter-model');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">所有模型</option>';
  models.forEach(m => {
    select.innerHTML += `<option value="${m}">${m}</option>`;
  });
  select.value = current;
}

function renderConversationsList(conversations) {
  const container = document.getElementById('conversations-container');
  if (!container) return;

  if (!conversations || conversations.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>暂无对话数据</p><button class="btn btn-primary btn-small" onclick="navigateTo(\'import\')"><i data-lucide="download"></i> 导入对话</button></div>';
    reinitIcons();
    return;
  }

  container.innerHTML = conversations.map(c => `
    <div class="conversation-card" onclick="viewConversation('${c.id}')">
      <div class="conversation-header">
        <div class="conversation-title">${escapeHtml(c.title || '')}</div>
        <span class="score-badge">${c.valueScore || 0}</span>
      </div>
      <div class="conversation-summary">${escapeHtml(c.summary || '')}</div>
      <div class="conversation-meta">
        <span class="tag tag-model${c.modelConfidence === 'low' ? ' tag-model-unknown' : ''}">${c.modelDisplay || c.model || '未知'}${c.modelConfidence === 'low' ? ' ?' : ''}</span>
        <span class="tag tag-task-${(c.taskType || '其他').toLowerCase()}">${c.taskType || '其他'}</span>
        <span class="tag tag-token" title="${c.tokenConfidence === 'estimated' ? '估算值' : 'API 真实值'}">${formatNumber(c.totalTokens || 0)} tok${c.tokenConfidence === 'estimated' ? ' ≈' : ''}</span>
        <span class="tag tag-cost${c.costConfidence === 'unknown' ? ' tag-cost-unknown' : ''}" title="${c.costNote || ''}">$${(c.cost || 0).toFixed(4)}</span>
        <span class="tag tag-time">${formatTime(c.timestamp)}</span>
      </div>
      ${c.valueScoreExplanation && c.valueScoreExplanation.length > 0 ? `<div class="conversation-explanation">${c.valueScoreExplanation.slice(0, 2).map(e => `<span class="tag-explain">${escapeHtml(e)}</span>`).join('')}</div>` : ''}
    </div>
  `).join('');
}

// ============================================
// 对话详情/回放
// ============================================
async function viewConversation(id) {
  try {
    const res = await fetch(`${API_BASE}/api/conversations/${id}`);
    const conv = await res.json();

    document.getElementById('conversation-modal-title').textContent = conv.title || '对话详情';

    // 统计信息
    const statsEl = document.getElementById('conversation-stats');
    statsEl.innerHTML = `
      <div class="detail-stats-grid">
        <div class="detail-stat">
          <div class="detail-stat-label">模型</div>
          <div class="detail-stat-value">${conv.modelDisplay || conv.model || '未知'}
            ${conv.modelConfidence === 'low' ? '<span class="tag-confidence">未确认</span>' : ''}
          </div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-label">任务类型</div>
          <div class="detail-stat-value">${conv.taskType || '其他'}
            <span class="tag-confidence">${Math.round((conv.taskConfidence || 0) * 100)}%</span>
          </div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-label">输入 Token</div>
          <div class="detail-stat-value">${formatNumber(conv.inputTokens || 0)}</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-label">输出 Token</div>
          <div class="detail-stat-value">${formatNumber(conv.outputTokens || 0)}</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-label">费用</div>
          <div class="detail-stat-value">$${(conv.cost || 0).toFixed(4)}
            ${conv.costConfidence === 'unknown' ? '<span class="tag-confidence">估算</span>' : ''}
          </div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-label">性价比评分</div>
          <div class="detail-stat-value">${conv.valueScore || 0}</div>
        </div>
      </div>
      ${conv.valueScoreExplanation && conv.valueScoreExplanation.length > 0 ? `<div class="score-explanations">${conv.valueScoreExplanation.map(e => `<div class="score-explanation-item">• ${escapeHtml(e)}</div>`).join('')}</div>` : ''}
      ${conv.warnings && conv.warnings.length > 0 ? `<div class="import-warnings">${conv.warnings.map(w => `<div class="warning-item">${escapeHtml(w)}</div>`).join('')}</div>` : ''}
    `;

    // 结构化摘要
    let summaryHtml = '';
    if (conv.structuredSummary) {
      const s = conv.structuredSummary;
      summaryHtml = `<div class="structured-summary">
        <h4>结构化摘要</h4>
        ${s.problem ? `<div class="summary-field"><strong>问题：</strong>${escapeHtml(s.problem)}</div>` : ''}
        ${s.keyActions && s.keyActions.length > 0 ? `<div class="summary-field"><strong>关键操作：</strong>${s.keyActions.map(a => escapeHtml(a)).join('、')}</div>` : ''}
        ${s.touchedFiles && s.touchedFiles.length > 0 ? `<div class="summary-field"><strong>涉及文件：</strong>${s.touchedFiles.slice(0, 10).map(f => escapeHtml(f)).join('、')}</div>` : ''}
        ${s.result ? `<div class="summary-field"><strong>结果：</strong>${escapeHtml(s.result)}</div>` : ''}
        ${s.risks && s.risks.length > 0 ? `<div class="summary-field"><strong>风险：</strong>${s.risks.map(r => escapeHtml(r)).join('、')}</div>` : ''}
        ${s.nextPrompt ? `<div class="summary-field next-prompt"><strong>下次接续：</strong>${escapeHtml(s.nextPrompt)}
          <button class="btn btn-ghost btn-small" onclick="copyToClipboard('${escapeJs(s.nextPrompt)}')">复制</button>
        </div>` : ''}
      </div>`;
    }

    // 消息回放
    const messagesHtml = (conv.messages || []).map((msg, i) => {
      const roleClass = msg.role === 'user' ? 'msg-user' : msg.role === 'tool' ? 'msg-tool' : 'msg-assistant';
      const roleLabel = msg.role === 'user' ? '用户' : msg.role === 'tool' ? '工具' : '助手';
      const tokenInfo = msg.tokens ? `<span class="msg-token">${msg.tokens} tokens${msg.tokenSource === 'estimated' ? ' ≈' : ''}</span>` : '';

      return `<div class="message-item ${roleClass}">
        <div class="message-header">
          <span class="message-role">${roleLabel}</span>
          ${tokenInfo}
          ${msg.timestamp ? `<span class="message-time">${formatTime(msg.timestamp)}</span>` : ''}
        </div>
        <div class="message-content">${formatMessageContent(msg.content)}</div>
        <button class="btn btn-ghost btn-small msg-copy" onclick="copyToClipboard('${escapeJs(msg.content)}')">复制</button>
      </div>`;
    }).join('');

    // 操作按钮
    const actionsHtml = `<div class="detail-actions">
      <button class="btn btn-ghost" onclick="copyToClipboard('${escapeJs(conv.summary || '')}')"><i data-lucide="copy"></i> 复制摘要</button>
      ${conv.structuredSummary?.nextPrompt ? `<button class="btn btn-primary" onclick="copyToClipboard('${escapeJs(conv.structuredSummary.nextPrompt)}')"><i data-lucide="clipboard"></i> 复制接续 Prompt</button>` : ''}
      <button class="btn btn-danger btn-small" onclick="deleteConversation('${conv.id}')"><i data-lucide="trash-2"></i> 删除</button>
    </div>`;

    document.getElementById('conversation-messages').innerHTML = summaryHtml + actionsHtml + `<div class="messages-timeline">${messagesHtml}</div>`;

    openModal('conversation-modal');
    reinitIcons();
  } catch (err) {
    showToast('加载对话详情失败', 'error');
  }
}

async function deleteConversation(id) {
  if (!confirm('确定删除该对话？')) return;
  try {
    await fetch(`${API_BASE}/api/conversations/${id}`, { method: 'DELETE' });
    closeModal('conversation-modal');
    showToast('对话已删除', 'success');
    if (state.currentPage === 'conversations') loadConversations();
    if (state.currentPage === 'dashboard') loadDashboard();
  } catch (err) {
    showToast('删除失败', 'error');
  }
}

// ============================================
// 文件上传/导入
// ============================================
function initFileUpload() {
  const uploadZone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('file-input');
  if (!uploadZone || !fileInput) return;

  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFileSelect(files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) handleFileSelect(fileInput.files[0]);
  });
}

function handleFileSelect(file) {
  state.selectedFile = file;
  state.autoProjectName = file.name.replace(/\.(txt|log|text|jsonl?)$/i, '').replace(/[-_]/g, ' ').trim();

  const preview = document.getElementById('file-preview');
  const nameEl = document.getElementById('file-preview-name');
  const sizeEl = document.getElementById('file-preview-size');
  const form = document.getElementById('import-form');
  const autoNameInput = document.getElementById('auto-project-name');

  if (preview) preview.style.display = 'flex';
  if (nameEl) nameEl.textContent = file.name;
  if (sizeEl) sizeEl.textContent = formatFileSize(file.size);
  if (form) form.style.display = 'block';
  if (autoNameInput) autoNameInput.value = state.autoProjectName;

  // 加载项目列表
  loadImportProjects();
  reinitIcons();
}

async function loadImportProjects() {
  try {
    const res = await fetch(`${API_BASE}/api/projects`);
    const data = await res.json();
    const select = document.getElementById('import-project-select');
    if (select) {
      select.innerHTML = '<option value="">自动创建新项目</option>';
      (data.projects || []).forEach(p => {
        select.innerHTML += `<option value="${p.id}">${escapeHtml(p.name)}</option>`;
      });
    }
  } catch (err) { /* ignore */ }
}

function clearSelectedFile() {
  state.selectedFile = null;
  const preview = document.getElementById('file-preview');
  const form = document.getElementById('import-form');
  if (preview) preview.style.display = 'none';
  if (form) form.style.display = 'none';
}

async function startImport() {
  if (!state.selectedFile) { showToast('请先选择文件', 'warning'); return; }

  const btn = document.getElementById('btn-start-import');
  if (btn) { btn.disabled = true; btn.textContent = '导入中...'; }

  try {
    const formData = new FormData();
    formData.append('file', state.selectedFile);

    const projectName = document.getElementById('auto-project-name')?.value;
    const projectId = document.getElementById('import-project-select')?.value;

    if (projectId) formData.append('projectId', projectId);
    else if (projectName) formData.append('projectName', projectName);

    const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
    const data = await res.json();

    if (data.success) {
      let msg = `导入成功！${data.messageCount} 条消息，${formatNumber(data.totalTokens)} tokens`;
      if (data.warnings && data.warnings.length > 0) {
        msg += ` (${data.warnings.length} 条警告)`;
      }
      showToast(msg, 'success');
      addLog('success', `导入对话: ${data.messageCount} 条消息，模型: ${data.modelDisplay || data.model}`);
      clearSelectedFile();
    } else {
      showToast(`导入失败: ${data.error}`, 'error');
      addLog('error', `导入失败: ${data.error}`);
    }
  } catch (err) {
    showToast('导入请求失败', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="download"></i> 开始导入'; reinitIcons(); }
  }
}

// ============================================
// 设置
// ============================================
function loadSettings() {
  renderPricingGrid();
  loadLLMConfig();
}

async function renderPricingGrid() {
  const container = document.getElementById('pricing-grid');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/api/pricing`);
    const data = await res.json();
    const pricing = data.pricing || [];

    // 按厂商分组
    const groups = {};
    pricing.forEach(m => {
      let vendor = '其他';
      const d = m.display.toLowerCase();
      if (d.includes('claude')) vendor = 'Anthropic';
      else if (d.includes('gpt') || d.includes('o1') || d.includes('o3') || d.includes('chatgpt')) vendor = 'OpenAI';
      else if (d.includes('deepseek')) vendor = 'DeepSeek';
      else if (d.includes('gemini')) vendor = 'Google';
      else if (d.includes('llama')) vendor = 'Meta';
      else if (d.includes('mistral') || d.includes('mixtral') || d.includes('codestral')) vendor = 'Mistral';
      else if (d.includes('qwen')) vendor = 'Alibaba';
      else if (d.includes('glm')) vendor = 'Zhipu';
      else if (d.includes('yi')) vendor = '01.AI';
      else if (d.includes('command')) vendor = 'Cohere';
      if (!groups[vendor]) groups[vendor] = [];
      groups[vendor].push(m);
    });

    let html = '';
    for (const [vendor, models] of Object.entries(groups)) {
      html += `<div class="pricing-vendor">${vendor}</div>`;
      models.forEach(m => {
        html += `<div class="pricing-item">
          <div class="pricing-model">${m.display}</div>
          <div class="pricing-rates">
            <span>输入: $${m.input}/M</span>
            <span>输出: $${m.output}/M</span>
          </div>
        </div>`;
      });
    }
    container.innerHTML = html;
  } catch {
    container.innerHTML = '<div style="color:var(--text-3);font-size:12px;">加载失败</div>';
  }
}

async function confirmClearAll() {
  if (!confirm('确定要清空所有数据？\n\n此操作将删除：\n- 所有对话记录\n- 所有项目\n\n此操作不可恢复！')) return;
  if (!confirm('再次确认：真的要清空所有数据吗？')) return;

  try {
    const res = await fetch(`${API_BASE}/api/data/clear`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      state.conversations = [];
      state.projects = [];
      showToast('所有数据已清空', 'success');
      addLog('warning', '清空所有数据');
      loadDashboard();
    }
  } catch (err) {
    showToast('清空数据失败', 'error');
  }
}

async function exportData() {
  try {
    const res = await fetch(`${API_BASE}/api/data/export`);
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ccmstats-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('数据导出成功', 'success');
  } catch (err) {
    showToast('导出失败', 'error');
  }
}

// ============================================
// 操作日志
// ============================================
function loadLogs() {
  try {
    const saved = localStorage.getItem('ccmstats-logs');
    state.logs = saved ? JSON.parse(saved) : [];
  } catch { state.logs = []; }
  renderLogs();
}

function addLog(level, message) {
  const log = { level, message, time: new Date().toISOString() };
  state.logs.unshift(log);
  if (state.logs.length > 200) state.logs = state.logs.slice(0, 200);
  localStorage.setItem('ccmstats-logs', JSON.stringify(state.logs));
  if (state.currentPage === 'logs') renderLogs();
}

function renderLogs() {
  const container = document.getElementById('logs-list');
  if (!container) return;

  if (state.logs.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>暂无操作日志</p><p style="font-size:11px;">导入对话、创建项目等操作会自动记录</p></div>';
    reinitIcons();
    return;
  }

  container.innerHTML = state.logs.map(log => `
    <div class="log-item log-${log.level}">
      <div class="log-icon">${getLogIcon(log.level)}</div>
      <div class="log-content">
        <div class="log-message">${escapeHtml(log.message)}</div>
        <div class="log-time">${formatTime(log.time)}</div>
      </div>
    </div>
  `).join('');
}

function getLogIcon(level) {
  const icons = { info: '○', success: '●', warning: '◐', error: '●' };
  return `<span style="color:var(--${level === 'info' ? 'blue' : level === 'success' ? 'green' : level === 'warning' ? 'amber' : 'red'})">${icons[level] || '○'}</span>`;
}

function clearLogs() {
  state.logs = [];
  localStorage.removeItem('ccmstats-logs');
  renderLogs();
  showToast('日志已清空', 'success');
}

// ============================================
// 模态框
// ============================================
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

// 点击遮罩关闭
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.closest('.modal')?.classList.remove('active');
  }
});

// ============================================
// Toast 提示
// ============================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================
// 工具函数
// ============================================
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

function formatTime(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';

    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return isoString; }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeJs(text) {
  if (!text) return '';
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '');
}

function formatMessageContent(content) {
  if (!content) return '';
  let html = escapeHtml(content);
  // 代码块
  html = html.replace(/```([\s\S]*?)```/g, '<pre class="code-block">$1</pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // 换行
  html = html.replace(/\n/g, '<br>');
  return html;
}

function copyToClipboard(text) {
  if (!text) { showToast('无内容可复制', 'warning'); return; }
  navigator.clipboard.writeText(text).then(() => {
    showToast('已复制到剪贴板', 'success');
  }).catch(() => {
    // fallback
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('已复制到剪贴板', 'success');
  });
}

// 颜色选择器
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('color-option')) {
    document.querySelectorAll('.color-option').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
  }
});

// ============================================
// LLM 配置管理
// ============================================
const LLM_PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
  },
};

async function loadLLMConfig() {
  try {
    const res = await fetch(`${API_BASE}/api/config/llm`);
    const config = await res.json();

    const providerEl = document.getElementById('llm-provider');
    const apiKeyEl = document.getElementById('llm-apikey');
    const baseUrlEl = document.getElementById('llm-baseurl');
    const modelEl = document.getElementById('llm-model');
    const enabledEl = document.getElementById('llm-enabled');
    const statusText = document.getElementById('llm-status-text');
    const resummarizeSection = document.getElementById('llm-resummarize-section');

    if (providerEl) providerEl.value = config.provider || 'deepseek';
    if (apiKeyEl) apiKeyEl.value = '';
    if (baseUrlEl) baseUrlEl.value = config.baseUrl || '';
    if (enabledEl) enabledEl.checked = !!config.enabled;

    // 更新模型下拉
    updateModelOptions(config.provider || 'deepseek');
    if (modelEl) modelEl.value = config.model || '';

    // 状态显示
    if (statusText) {
      if (config.hasApiKey) {
        statusText.textContent = config.enabled ? '已启用' : '已配置（未启用）';
        statusText.style.color = config.enabled ? 'var(--green)' : 'var(--amber)';
      } else {
        statusText.textContent = '未配置';
        statusText.style.color = 'var(--text-3)';
      }
    }

    // 如果有 API key，显示重新生成按钮
    if (resummarizeSection) {
      resummarizeSection.style.display = config.hasApiKey ? 'flex' : 'none';
    }
  } catch (err) {
    console.error('Load LLM config error:', err);
  }
}

function updateModelOptions(provider) {
  const modelEl = document.getElementById('llm-model');
  if (!modelEl) return;

  const providerConfig = LLM_PROVIDERS[provider] || LLM_PROVIDERS.deepseek;
  modelEl.innerHTML = providerConfig.models
    .map(m => `<option value="${m}">${m}</option>`)
    .join('');
}

function onLLMProviderChange() {
  const provider = document.getElementById('llm-provider')?.value || 'deepseek';
  const baseUrlEl = document.getElementById('llm-baseurl');
  const providerConfig = LLM_PROVIDERS[provider] || LLM_PROVIDERS.deepseek;

  if (baseUrlEl) baseUrlEl.value = providerConfig.baseUrl;
  updateModelOptions(provider);
}

function toggleLLMKeyVisibility() {
  const el = document.getElementById('llm-apikey');
  if (el) el.type = el.type === 'password' ? 'text' : 'password';
}

async function saveLLMConfig() {
  const provider = document.getElementById('llm-provider')?.value || 'deepseek';
  const apiKey = document.getElementById('llm-apikey')?.value?.trim();
  const baseUrl = document.getElementById('llm-baseurl')?.value?.trim();
  const model = document.getElementById('llm-model')?.value;
  const enabled = document.getElementById('llm-enabled')?.checked;

  // 如果用户没有输入新的 apiKey，发送空字符串表示不更新
  const body = { provider, baseUrl, model, enabled };
  if (apiKey) body.apiKey = apiKey;

  try {
    const res = await fetch(`${API_BASE}/api/config/llm`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) {
      showToast('LLM 配置已保存', 'success');
      loadLLMConfig();
      reinitIcons();
    } else {
      showToast('保存失败: ' + (data.error || ''), 'error');
    }
  } catch (err) {
    showToast('保存配置失败', 'error');
  }
}

async function testLLMConnection() {
  const btn = document.getElementById('btn-test-llm');
  const statusText = document.getElementById('llm-status-text');

  if (btn) { btn.disabled = true; btn.textContent = '测试中...'; }
  if (statusText) { statusText.textContent = '测试中...'; statusText.style.color = 'var(--text-3)'; }

  // 先保存当前配置
  await saveLLMConfig();

  try {
    const res = await fetch(`${API_BASE}/api/config/llm/test`, { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      if (statusText) {
        statusText.textContent = `连接成功 (${data.model || ''})`;
        statusText.style.color = 'var(--green)';
      }
      showToast('LLM 连接成功', 'success');
    } else {
      if (statusText) {
        statusText.textContent = `${data.message || '连接失败'}`;
        statusText.style.color = 'var(--red)';
      }
      showToast('连接失败: ' + (data.message || ''), 'error');
    }
  } catch (err) {
    if (statusText) {
      statusText.textContent = '请求失败';
      statusText.style.color = 'var(--red)';
    }
    showToast('测试请求失败', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="wifi"></i> 测试连接'; reinitIcons(); }
  }
}

async function resummarizeAll() {
  const btn = document.getElementById('btn-resummarize');
  if (!confirm('确定要使用 LLM 为所有对话重新生成摘要？\n\n这可能需要一些时间，取决于对话数量。')) return;

  if (btn) { btn.disabled = true; btn.textContent = '处理中...'; }

  try {
    const res = await fetch(`${API_BASE}/api/conversations/resummarize-all`, { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      showToast(`摘要重新生成完成：成功 ${data.processed} 个，失败 ${data.failed} 个`, 'success');
      addLog('info', `批量重新生成摘要：成功 ${data.processed}，失败 ${data.failed}`);
    } else {
      showToast('操作失败: ' + (data.error || ''), 'error');
    }
  } catch (err) {
    showToast('请求失败', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="refresh-cw"></i> 全部重新生成'; reinitIcons(); }
  }
}
