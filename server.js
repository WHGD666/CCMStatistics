const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 导入模块化组件
const { parseContent } = require('./lib/parser');
const { calculateMessageTokens } = require('./lib/analytics/tokenEstimator');
const { calculateCost, getModelDisplayName, getAllPricing } = require('./lib/analytics/costCalculator');
const { classifyConversation } = require('./lib/analytics/taskClassifier');
const { calculateValueScore } = require('./lib/analytics/valueScore');
const { generateStructuredSummary, generateLLMSummary, generateSimpleSummary } = require('./lib/analytics/summarizer');
const { generateRecommendations, generateLLMRecommendations } = require('./lib/analytics/recommendations');
const { loadLLMConfig, saveLLMConfig, isLLMAvailable, getModelInfo, testConnection, PROVIDERS } = require('./lib/llm/client');

const app = express();
const PORT = process.env.PORT || 3025;

// 文件上传配置
const upload = multer({
  dest: path.join(__dirname, 'data', 'uploads'),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// 数据文件路径
const DATA_DIR = path.join(__dirname, 'data');
const CONVERSATIONS_FILE = path.join(DATA_DIR, 'conversations.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

// 确保目录和文件存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(path.join(DATA_DIR, 'uploads'))) fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
if (!fs.existsSync(CONVERSATIONS_FILE)) fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify({ conversations: [] }, null, 2));
if (!fs.existsSync(PROJECTS_FILE)) fs.writeFileSync(PROJECTS_FILE, JSON.stringify({ projects: [] }, null, 2));

// ==================== 数据读写 ====================

function loadConversations() {
  try { return JSON.parse(fs.readFileSync(CONVERSATIONS_FILE, 'utf8')); }
  catch { return { conversations: [] }; }
}

function loadProjects() {
  try { return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')); }
  catch { return { projects: [] }; }
}

function saveConversations(data) {
  fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(data, null, 2));
}

function saveProjects(data) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(data, null, 2));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

// ==================== 项目 API ====================

app.get('/api/projects', (req, res) => {
  const data = loadProjects();
  const convData = loadConversations();

  // 附加每个项目的统计信息
  const projects = data.projects.map(p => {
    const convos = convData.conversations.filter(c => c.projectId === p.id);
    return {
      ...p,
      conversationCount: convos.length,
      totalTokens: convos.reduce((s, c) => s + (c.totalTokens || 0), 0),
      totalCost: Math.round(convos.reduce((s, c) => s + (c.cost || 0), 0) * 10000) / 10000,
    };
  });

  res.json({ projects });
});

app.post('/api/projects', (req, res) => {
  try {
    const { name, path: projectPath, desc, color } = req.body;
    if (!name) return res.status(400).json({ error: '项目名称不能为空' });

    const project = {
      id: generateId(),
      name,
      path: projectPath || '',
      desc: desc || '',
      color: color || '#6366f1',
      createdAt: new Date().toISOString(),
    };

    const data = loadProjects();
    data.projects.push(project);
    saveProjects(data);
    res.json({ success: true, project });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: '创建项目失败' });
  }
});

app.put('/api/projects/:id', (req, res) => {
  try {
    const data = loadProjects();
    const index = data.projects.findIndex(p => p.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: '项目不存在' });

    const { name, path: projectPath, desc, color } = req.body;
    if (name) data.projects[index].name = name;
    if (projectPath !== undefined) data.projects[index].path = projectPath;
    if (desc !== undefined) data.projects[index].desc = desc;
    if (color) data.projects[index].color = color;

    saveProjects(data);
    res.json({ success: true, project: data.projects[index] });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: '更新项目失败' });
  }
});

app.delete('/api/projects/:id', (req, res) => {
  try {
    const projectData = loadProjects();
    const projectIndex = projectData.projects.findIndex(p => p.id === req.params.id);
    if (projectIndex === -1) return res.status(404).json({ error: '项目不存在' });

    projectData.projects.splice(projectIndex, 1);
    saveProjects(projectData);

    const convData = loadConversations();
    const deletedCount = convData.conversations.filter(c => c.projectId === req.params.id).length;
    convData.conversations = convData.conversations.filter(c => c.projectId !== req.params.id);
    saveConversations(convData);

    res.json({ success: true, deletedConversations: deletedCount });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: '删除项目失败' });
  }
});

// ==================== 对话导入 API ====================

// 文件上传导入
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '未上传文件' });

    const content = fs.readFileSync(req.file.path, 'utf8');
    const model = req.body.model || null;
    const projectId = req.body.projectId || null;
    const projectName = req.body.projectName || null;
    const filename = req.file.originalname;

    fs.unlinkSync(req.file.path);
    return doImport(res, content, model, projectId, projectName, filename);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: '文件上传失败' });
  }
});

// JSON 导入
app.post('/api/import', (req, res) => {
  try {
    const { content, model, projectId, projectName, filename } = req.body;
    if (!content) return res.status(400).json({ error: '未提供内容' });
    return doImport(res, content, model, projectId, projectName, filename);
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: '导入失败' });
  }
});

// 导入核心逻辑
function doImport(res, content, model, projectId, projectName, filename) {
  try {
    // 解析内容
    const parseResult = parseContent(content, 'auto');
    const { messages, detectedModel, warnings } = parseResult;

    if (messages.length === 0) {
      return res.status(400).json({ error: '未找到有效消息', warnings });
    }

    const finalModel = model || detectedModel;

    // 确定项目
    let finalProjectId = projectId;
    let finalProjectName = projectName;

    if (!finalProjectId && projectName) {
      const projectData = loadProjects();
      let existing = projectData.projects.find(p => p.name === projectName);
      if (existing) {
        finalProjectId = existing.id;
        finalProjectName = existing.name;
      } else {
        const newProject = {
          id: generateId(),
          name: projectName,
          path: '',
          desc: filename ? `从文件 ${filename} 导入` : '',
          color: '#6366f1',
          createdAt: new Date().toISOString(),
        };
        projectData.projects.push(newProject);
        saveProjects(projectData);
        finalProjectId = newProject.id;
        finalProjectName = newProject.name;
      }
    }

    if (!finalProjectId && filename) {
      const autoName = filename.replace(/\.(txt|log|text|jsonl?)$/i, '').replace(/[-_]/g, ' ').trim() || '未命名项目';
      const projectData = loadProjects();
      let existing = projectData.projects.find(p => p.name === autoName);
      if (!existing) {
        existing = {
          id: generateId(),
          name: autoName,
          path: '',
          desc: `从文件 ${filename} 自动创建`,
          color: '#6366f1',
          createdAt: new Date().toISOString(),
        };
        projectData.projects.push(existing);
        saveProjects(projectData);
      }
      finalProjectId = existing.id;
      finalProjectName = existing.name;
    }

    // Token 计算
    const tokenResult = calculateMessageTokens(messages);

    // 任务分类
    const taskResult = classifyConversation(messages);

    // 费用计算
    const costResult = calculateCost(tokenResult.inputTokens, tokenResult.outputTokens, finalModel);

    // 结构化摘要
    const structuredSummary = generateStructuredSummary(messages);
    const simpleSummary = generateSimpleSummary(messages);

    // 生成标题
    const firstUser = messages.find(m => m.role === 'user');
    const title = firstUser
      ? firstUser.content.substring(0, 50) + (firstUser.content.length > 50 ? '...' : '')
      : '未命名对话';

    const conversation = {
      id: generateId(),
      title,
      summary: simpleSummary,
      structuredSummary,
      preview: simpleSummary,
      timestamp: new Date().toISOString(),
      model: finalModel,
      modelDisplay: getModelDisplayName(finalModel),
      modelConfidence: finalModel === 'unknown' ? 'low' : 'high',
      taskType: taskResult.type,
      taskConfidence: taskResult.confidence,
      taskDistribution: taskResult.distribution || {},
      inputTokens: tokenResult.inputTokens,
      outputTokens: tokenResult.outputTokens,
      totalTokens: tokenResult.totalTokens,
      tokenConfidence: tokenResult.tokenConfidence,
      cost: costResult.cost,
      costConfidence: costResult.confidence,
      costNote: costResult.note,
      valueScore: 0,
      messages,
      format: parseResult.detectedModel ? 'jsonl' : 'txt',
      projectId: finalProjectId,
      warnings,
    };

    // 评分
    const scoreResult = calculateValueScore(conversation);
    conversation.valueScore = scoreResult.score;
    conversation.valueScoreBreakdown = scoreResult.breakdown;
    conversation.valueScoreExplanation = scoreResult.explanation;
    conversation.valueScoreConfidence = scoreResult.confidence;

    // 保存
    const data = loadConversations();
    data.conversations.unshift(conversation);
    saveConversations(data);

    // 异步 LLM 摘要（不阻塞响应）
    if (isLLMAvailable()) {
      generateLLMSummary(messages).then(llmResult => {
        if (llmResult.success) {
          const freshData = loadConversations();
          const conv = freshData.conversations.find(c => c.id === conversation.id);
          if (conv) {
            conv.structuredSummary = llmResult.summary;
            conv.summary = generateSimpleSummary(messages);
            saveConversations(freshData);
            console.log(`  LLM summary generated for conversation: ${conversation.id}`);
          }
        }
      }).catch(err => {
        console.error('  Background LLM summary failed:', err.message);
      });
    }

    res.json({
      success: true,
      conversationId: conversation.id,
      messageCount: messages.length,
      inputTokens: tokenResult.inputTokens,
      outputTokens: tokenResult.outputTokens,
      totalTokens: tokenResult.totalTokens,
      tokenConfidence: tokenResult.tokenConfidence,
      cost: costResult.cost,
      costConfidence: costResult.confidence,
      costNote: costResult.note,
      taskType: taskResult.type,
      taskConfidence: taskResult.confidence,
      valueScore: scoreResult.score,
      model: finalModel,
      modelDisplay: getModelDisplayName(finalModel),
      projectId: finalProjectId,
      projectName: finalProjectName,
      warnings,
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: '导入处理失败: ' + error.message });
  }
}

// ==================== 对话查询 API ====================

app.get('/api/conversations', (req, res) => {
  const data = loadConversations();
  const { projectId, model, taskType, sort, order, q } = req.query;

  let conversations = data.conversations;

  if (projectId) conversations = conversations.filter(c => c.projectId === projectId);
  if (model) conversations = conversations.filter(c => c.model === model);
  if (taskType) conversations = conversations.filter(c => c.taskType === taskType);

  // 搜索
  if (q) {
    const query = q.toLowerCase();
    conversations = conversations.filter(c => {
      const titleMatch = (c.title || '').toLowerCase().includes(query);
      const summaryMatch = (c.summary || '').toLowerCase().includes(query);
      const modelMatch = (c.model || '').toLowerCase().includes(query);
      const messageMatch = (c.messages || []).some(m =>
        (m.content || '').toLowerCase().includes(query)
      );
      return titleMatch || summaryMatch || modelMatch || messageMatch;
    });
  }

  // 排序
  if (sort) {
    const dir = order === 'asc' ? 1 : -1;
    conversations.sort((a, b) => {
      if (sort === 'cost') return ((a.cost || 0) - (b.cost || 0)) * dir;
      if (sort === 'tokens') return ((a.totalTokens || 0) - (b.totalTokens || 0)) * dir;
      if (sort === 'score') return ((a.valueScore || 0) - (b.valueScore || 0)) * dir;
      if (sort === 'time') return (new Date(a.timestamp) - new Date(b.timestamp)) * dir;
      return 0;
    });
  }

  const result = conversations.map(c => ({
    id: c.id,
    title: c.title,
    summary: c.summary || generateSimpleSummary(c.messages || []),
    preview: c.preview || '',
    structuredSummary: c.structuredSummary || null,
    timestamp: c.timestamp,
    model: c.model,
    modelDisplay: c.modelDisplay || getModelDisplayName(c.model),
    modelConfidence: c.modelConfidence || (c.model === 'unknown' ? 'low' : 'high'),
    taskType: c.taskType || '其他',
    taskConfidence: c.taskConfidence || 0,
    inputTokens: c.inputTokens,
    outputTokens: c.outputTokens,
    totalTokens: c.totalTokens,
    tokenConfidence: c.tokenConfidence || 'estimated',
    cost: c.cost || 0,
    costConfidence: c.costConfidence || (c.model === 'unknown' ? 'unknown' : 'high'),
    costNote: c.costNote || '',
    valueScore: c.valueScore || 0,
    valueScoreConfidence: c.valueScoreConfidence || 'medium',
    valueScoreExplanation: c.valueScoreExplanation || [],
    messageCount: c.messages?.length || 0,
    projectId: c.projectId,
    warnings: c.warnings || [],
  }));

  res.json({ conversations: result });
});

app.get('/api/conversations/:id', (req, res) => {
  const data = loadConversations();
  const conversation = data.conversations.find(c => c.id === req.params.id);
  if (!conversation) return res.status(404).json({ error: '对话不存在' });
  res.json(conversation);
});

app.delete('/api/conversations/:id', (req, res) => {
  const data = loadConversations();
  const index = data.conversations.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '对话不存在' });
  data.conversations.splice(index, 1);
  saveConversations(data);
  res.json({ success: true });
});

// ==================== 搜索 API ====================

app.get('/api/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ results: [] });

  const data = loadConversations();
  const projectData = loadProjects();
  const query = q.toLowerCase();

  const results = data.conversations
    .filter(c => {
      const titleMatch = (c.title || '').toLowerCase().includes(query);
      const summaryMatch = (c.summary || '').toLowerCase().includes(query);
      const modelMatch = (c.model || '').toLowerCase().includes(query);
      const messageMatch = (c.messages || []).some(m => (m.content || '').toLowerCase().includes(query));
      return titleMatch || summaryMatch || modelMatch || messageMatch;
    })
    .slice(0, 20)
    .map(c => {
      const project = projectData.projects.find(p => p.id === c.projectId);
      return {
        id: c.id,
        title: c.title,
        summary: c.summary,
        model: c.model,
        taskType: c.taskType,
        projectName: project?.name || '',
        timestamp: c.timestamp,
        matchPreview: findMatchPreview(c, query),
      };
    });

  res.json({ results, total: results.length });
});

function findMatchPreview(conversation, query) {
  for (const msg of (conversation.messages || [])) {
    const content = (msg.content || '').toLowerCase();
    const idx = content.indexOf(query);
    if (idx >= 0) {
      const start = Math.max(0, idx - 30);
      const end = Math.min(content.length, idx + query.length + 30);
      return (start > 0 ? '...' : '') + msg.content.substring(start, end) + (end < content.length ? '...' : '');
    }
  }
  return '';
}

// ==================== 统计 API ====================

app.get('/api/stats', (req, res) => {
  const convData = loadConversations();
  const projectData = loadProjects();
  const conversations = convData.conversations;
  const projects = projectData.projects;

  const totalConversations = conversations.length;
  const totalInputTokens = conversations.reduce((s, c) => s + (c.inputTokens || 0), 0);
  const totalOutputTokens = conversations.reduce((s, c) => s + (c.outputTokens || 0), 0);
  const totalCost = conversations.reduce((s, c) => s + (c.cost || 0), 0);
  const avgScore = totalConversations > 0
    ? conversations.reduce((s, c) => s + (c.valueScore || 0), 0) / totalConversations
    : 0;

  // 模型分布
  const modelDistribution = {};
  conversations.forEach(c => {
    const m = getModelDisplayName(c.model);
    modelDistribution[m] = (modelDistribution[m] || 0) + 1;
  });

  // 任务分布
  const taskDistribution = {};
  conversations.forEach(c => {
    const t = c.taskType || '其他';
    taskDistribution[t] = (taskDistribution[t] || 0) + 1;
  });

  // 项目分布
  const projectDistribution = {};
  conversations.forEach(c => {
    if (c.projectId) {
      const p = projects.find(p => p.id === c.projectId);
      const name = p ? p.name : '未分配';
      projectDistribution[name] = (projectDistribution[name] || 0) + 1;
    }
  });

  // 每日使用
  const dailyUsage = {};
  conversations.forEach(c => {
    const date = c.timestamp?.split('T')[0] || 'unknown';
    if (!dailyUsage[date]) dailyUsage[date] = { date, tokens: 0, cost: 0, count: 0, inputTokens: 0, outputTokens: 0 };
    dailyUsage[date].tokens += c.totalTokens || 0;
    dailyUsage[date].cost += c.cost || 0;
    dailyUsage[date].count += 1;
    dailyUsage[date].inputTokens += c.inputTokens || 0;
    dailyUsage[date].outputTokens += c.outputTokens || 0;
  });

  // 模型费用分布
  const modelCostDistribution = {};
  conversations.forEach(c => {
    const m = getModelDisplayName(c.model);
    modelCostDistribution[m] = (modelCostDistribution[m] || 0) + (c.cost || 0);
  });

  // 最近 7 天 vs 之前
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const recentConvos = conversations.filter(c => (c.timestamp?.split('T')[0] || '') >= sevenDaysAgo);
  const recentCost = recentConvos.reduce((s, c) => s + (c.cost || 0), 0);
  const recentTokens = recentConvos.reduce((s, c) => s + (c.totalTokens || 0), 0);

  res.json({
    totalConversations,
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    totalCost: Math.round(totalCost * 10000) / 10000,
    averageValueScore: Math.round(avgScore),
    totalProjects: projects.length,
    modelDistribution,
    taskDistribution,
    projectDistribution,
    modelCostDistribution,
    dailyUsage: Object.values(dailyUsage).sort((a, b) => a.date.localeCompare(b.date)),
    recentCost: Math.round(recentCost * 10000) / 10000,
    recentTokens,
    recentCount: recentConvos.length,
  });
});

// ==================== 优化建议 API ====================

app.post('/api/optimize', async (req, res) => {
  const data = loadConversations();

  // 优先使用 LLM 生成建议
  if (isLLMAvailable()) {
    const llmResult = await generateLLMRecommendations(data.conversations);
    if (llmResult.success) {
      return res.json(llmResult.result);
    }
    console.warn('LLM recommendations failed, falling back to rule-based:', llmResult.error);
  }

  // 回退到规则版
  const result = generateRecommendations(data.conversations);
  res.json(result);
});

// ==================== 数据管理 API ====================

// 清空所有数据
app.delete('/api/data/clear', (req, res) => {
  try {
    saveConversations({ conversations: [] });
    saveProjects({ projects: [] });
    res.json({ success: true, message: '所有数据已清空' });
  } catch (error) {
    console.error('Clear data error:', error);
    res.status(500).json({ error: '清空数据失败' });
  }
});

// 导出所有数据
app.get('/api/data/export', (req, res) => {
  try {
    const convData = loadConversations();
    const projectData = loadProjects();
    res.json({
      conversations: convData.conversations,
      projects: projectData.projects,
      exportedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: '导出失败' });
  }
});

// 获取模型列表（用于筛选下拉）
app.get('/api/models', (req, res) => {
  const data = loadConversations();
  const models = new Set();
  data.conversations.forEach(c => {
    if (c.model) models.add(c.model);
  });
  res.json({ models: Array.from(models) });
});

// 获取所有模型定价（设置页用）
app.get('/api/pricing', (req, res) => {
  res.json({ pricing: getAllPricing() });
});

// ==================== LLM 配置 API ====================

// 获取 LLM 配置（隐藏 apiKey）
app.get('/api/config/llm', (req, res) => {
  const config = loadLLMConfig();
  res.json({
    provider: config.provider || 'deepseek',
    apiKey: config.apiKey ? config.apiKey.slice(0, 8) + '...' : '',
    hasApiKey: !!config.apiKey,
    baseUrl: config.baseUrl || PROVIDERS.deepseek.baseUrl,
    model: config.model || PROVIDERS.deepseek.model,
    enabled: !!config.enabled,
    providers: PROVIDERS,
  });
});

// 保存 LLM 配置
app.put('/api/config/llm', (req, res) => {
  try {
    const { provider, apiKey, baseUrl, model, enabled } = req.body;

    const current = loadLLMConfig();
    const newConfig = {
      provider: provider || current.provider || 'deepseek',
      apiKey: apiKey !== undefined ? apiKey : current.apiKey || '',
      baseUrl: baseUrl || current.baseUrl || PROVIDERS.deepseek.baseUrl,
      model: model || current.model || PROVIDERS.deepseek.model,
      enabled: enabled !== undefined ? !!enabled : current.enabled || false,
    };

    saveLLMConfig(newConfig);
    res.json({ success: true, message: 'LLM 配置已保存' });
  } catch (error) {
    console.error('Save LLM config error:', error);
    res.status(500).json({ error: '保存配置失败' });
  }
});

// 测试 LLM 连接
app.post('/api/config/llm/test', async (req, res) => {
  try {
    const result = await testConnection();
    res.json(result);
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ==================== 对话重摘要 API ====================

app.post('/api/conversations/:id/resummarize', async (req, res) => {
  try {
    const data = loadConversations();
    const conv = data.conversations.find(c => c.id === req.params.id);
    if (!conv) return res.status(404).json({ error: '对话不存在' });

    if (!isLLMAvailable()) {
      return res.status(400).json({ error: 'LLM 未配置，请先在设置中配置 API Key' });
    }

    const llmResult = await generateLLMSummary(conv.messages || []);
    if (!llmResult.success) {
      return res.status(500).json({ error: 'LLM 摘要生成失败: ' + llmResult.error });
    }

    // 更新对话摘要
    conv.structuredSummary = llmResult.summary;
    conv.summary = generateSimpleSummary(conv.messages || []);
    saveConversations(data);

    res.json({ success: true, structuredSummary: llmResult.summary });
  } catch (error) {
    console.error('Resummarize error:', error);
    res.status(500).json({ error: '重摘要失败' });
  }
});

// 批量重摘要
app.post('/api/conversations/resummarize-all', async (req, res) => {
  try {
    if (!isLLMAvailable()) {
      return res.status(400).json({ error: 'LLM 未配置，请先在设置中配置 API Key' });
    }

    const data = loadConversations();
    let success = 0;
    let failed = 0;

    for (const conv of data.conversations) {
      const llmResult = await generateLLMSummary(conv.messages || []);
      if (llmResult.success) {
        conv.structuredSummary = llmResult.summary;
        success++;
      } else {
        failed++;
      }
    }

    saveConversations(data);
    res.json({ success: true, processed: success, failed, total: data.conversations.length });
  } catch (error) {
    console.error('Batch resummarize error:', error);
    res.status(500).json({ error: '批量重摘要失败' });
  }
});

// ==================== 首页 ====================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`\n  CCMStatistics server started!`);
  console.log(`  Local: http://localhost:${PORT}\n`);
});
