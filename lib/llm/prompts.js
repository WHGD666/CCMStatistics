/**
 * LLM 提示词模板
 * 所有提示词使用中文，与项目语言一致
 */

/**
 * 结构化摘要提示词
 * 要求 LLM 返回 JSON 格式的结构化摘要
 */
const SUMMARIZE_SYSTEM = `你是一个对话分析助手。你的任务是从 Claude Code 对话中提取结构化摘要。

你必须返回一个 JSON 对象，包含以下字段：
{
  "problem": "用户要解决的问题（一句话概括）",
  "keyActions": ["关键操作1", "关键操作2", ...],
  "touchedFiles": ["涉及的文件路径1", ...],
  "result": "最终结果或结论（一句话）",
  "risks": ["风险或注意事项1", ...],
  "nextPrompt": "如果用户要继续这项工作，应该输入的下一句提示词"
}

规则：
- problem：从第一条用户消息中提取核心意图
- keyActions：从助手回复中提取关键操作（如创建文件、修改代码、运行命令等），最多 5 条
- touchedFiles：提取所有涉及的文件路径，最多 10 个
- result：从最后一条助手消息中提取最终结果
- risks：识别潜在问题（错误、TODO、性能隐患等），没有则为空数组
- nextPrompt：生成一条自然的接续提示词，帮助用户在新会话中继续工作
- 所有文本使用中文
- 只返回 JSON，不要有其他内容`;

function buildSummarizePrompt(messages) {
  // 截取消息以控制 token 用量
  const MAX_CHARS = 8000;
  let totalChars = 0;
  const truncated = [];

  for (const msg of messages) {
    const content = msg.content || '';
    if (totalChars + content.length > MAX_CHARS) {
      const remaining = MAX_CHARS - totalChars;
      if (remaining > 100) {
        truncated.push({ role: msg.role, content: content.substring(0, remaining) + '...(截断)' });
      }
      break;
    }
    truncated.push({ role: msg.role, content });
    totalChars += content.length;
  }

  const conversationText = truncated
    .map(m => `[${m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : '工具'}]: ${m.content}`)
    .join('\n\n');

  return [
    { role: 'system', content: SUMMARIZE_SYSTEM },
    { role: 'user', content: `请分析以下对话并生成结构化摘要：\n\n${conversationText}` },
  ];
}

/**
 * 优化建议提示词
 * 要求 LLM 基于统计数据生成个性化建议
 */
const RECOMMEND_SYSTEM = `你是一个 AI 使用优化顾问。你根据用户的 Claude Code 使用数据，生成可执行的优化建议。

你必须返回一个 JSON 对象：
{
  "suggestions": [
    {
      "type": "warning|info|suggestion|best_practice",
      "title": "建议标题",
      "description": "详细描述（包含具体数据）",
      "evidence": "支撑数据",
      "potentialSaving": 0.00,
      "action": "具体行动建议",
      "copyPrompt": "用户可以直接复制粘贴到 Claude Code 的提示词"
    }
  ]
}

规则：
- 基于实际数据分析，不要泛泛而谈
- 每条建议必须有具体的 evidence（数字、百分比、金额）
- copyPrompt 应该是用户可以直接使用的、自然的提示词
- 至少分析以下几个维度：
  1. 模型选择是否合理（昂贵模型用在简单任务上？）
  2. Token 效率（输出/输入比是否过高？）
  3. 费用分布（哪些对话/项目花费最多？）
  4. 任务-模型匹配（分析任务用了 Opus？编码用了太弱的模型？）
- 建议数量：3-5 条，按潜在节省金额排序
- 所有文本使用中文
- 只返回 JSON，不要有其他内容`;

function buildRecommendPrompt(conversations) {
  // 提取统计数据，不发送完整消息内容
  const totalConversations = conversations.length;
  const totalCost = conversations.reduce((s, c) => s + (c.cost || 0), 0);
  const totalTokens = conversations.reduce((s, c) => s + (c.totalTokens || 0), 0);

  const modelStats = {};
  const taskStats = {};
  const projectStats = {};

  conversations.forEach(c => {
    const model = c.model || 'unknown';
    if (!modelStats[model]) modelStats[model] = { count: 0, cost: 0, tokens: 0, inputTokens: 0, outputTokens: 0 };
    modelStats[model].count++;
    modelStats[model].cost += c.cost || 0;
    modelStats[model].tokens += c.totalTokens || 0;
    modelStats[model].inputTokens += c.inputTokens || 0;
    modelStats[model].outputTokens += c.outputTokens || 0;

    const task = c.taskType || '其他';
    if (!taskStats[task]) taskStats[task] = { count: 0, cost: 0, tokens: 0 };
    taskStats[task].count++;
    taskStats[task].cost += c.cost || 0;
    taskStats[task].tokens += c.totalTokens || 0;

    const proj = c.projectId || '未分配';
    if (!projectStats[proj]) projectStats[proj] = { count: 0, cost: 0 };
    projectStats[proj].count++;
    projectStats[proj].cost += c.cost || 0;
  });

  // 找出最贵的对话
  const expensiveConvos = [...conversations]
    .sort((a, b) => (b.cost || 0) - (a.cost || 0))
    .slice(0, 5)
    .map(c => ({
      title: c.title,
      model: c.model,
      taskType: c.taskType,
      cost: c.cost,
      inputTokens: c.inputTokens,
      outputTokens: c.outputTokens,
    }));

  const statsSummary = {
    totalConversations,
    totalCost: Math.round(totalCost * 10000) / 10000,
    totalTokens,
    modelStats: Object.entries(modelStats)
      .sort((a, b) => b[1].cost - a[1].cost)
      .map(([model, s]) => ({
        model,
        count: s.count,
        cost: Math.round(s.cost * 10000) / 10000,
        tokens: s.tokens,
        outputInputRatio: s.inputTokens > 0 ? Math.round(s.outputTokens / s.inputTokens * 100) / 100 : 0,
      })),
    taskStats: Object.entries(taskStats).map(([task, s]) => ({
      task,
      count: s.count,
      cost: Math.round(s.cost * 10000) / 10000,
      tokens: s.tokens,
    })),
    expensiveConvos,
  };

  return [
    { role: 'system', content: RECOMMEND_SYSTEM },
    { role: 'user', content: `请分析以下 Claude Code 使用数据并生成优化建议：\n\n${JSON.stringify(statsSummary, null, 2)}` },
  ];
}

module.exports = {
  buildSummarizePrompt,
  buildRecommendPrompt,
};
