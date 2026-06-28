/**
 * 优化建议引擎
 * 支持 LLM 生成（优先）+ 规则回退
 */

const { callLLM, isLLMAvailable } = require('../llm/client');
const { buildRecommendPrompt } = require('../llm/prompts');

/**
 * 生成优化建议（规则版，作为回退）
 */
function generateRecommendations(conversations) {
  const suggestions = [];
  if (conversations.length === 0) return { suggestions, totalCost: 0, potentialSaving: 0 };

  const totalCost = conversations.reduce((s, c) => s + (c.cost || 0), 0);
  const totalTokens = conversations.reduce((s, c) => s + (c.totalTokens || 0), 0);

  // 统计模型使用
  const modelCounts = {};
  const modelCosts = {};
  conversations.forEach(c => {
    const m = c.model || 'unknown';
    modelCounts[m] = (modelCounts[m] || 0) + 1;
    modelCosts[m] = (modelCosts[m] || 0) + (c.cost || 0);
  });

  // 1. 昂贵模型使用比例
  const expensiveModels = ['claude-opus-4', 'claude-3-opus'];
  const expensiveConvos = conversations.filter(c =>
    expensiveModels.some(m => (c.model || '').toLowerCase().includes(m))
  );
  if (expensiveConvos.length > conversations.length * 0.3) {
    const pct = Math.round(expensiveConvos.length / conversations.length * 100);
    const potentialSaving = expensiveConvos.reduce((s, c) => s + (c.cost || 0), 0) * 0.6;
    suggestions.push({
      type: 'warning',
      title: '高端模型使用比例偏高',
      description: `${pct}% 的对话使用了 Opus 系列模型，其中部分简单任务可用 Sonnet 替代`,
      evidence: `共 ${expensiveConvos.length} 次对话使用 Opus，总费用 $${modelCosts[expensiveConvos[0]?.model]?.toFixed(4) || '0'}`,
      potentialSaving: Math.round(potentialSaving * 10000) / 10000,
      action: '对简单编码和问答任务改用 Claude Sonnet',
      copyPrompt: '请使用 Claude Sonnet 模型来处理这个任务，以节省 Token 成本。',
    });
  }

  // 2. Token 效率问题
  const wastefulConvos = conversations.filter(c =>
    c.outputTokens > 0 && c.inputTokens > 0 && c.outputTokens > c.inputTokens * 4
  );
  if (wastefulConvos.length > 0) {
    suggestions.push({
      type: 'info',
      title: '部分对话输出 Token 过多',
      description: `${wastefulConvos.length} 个对话的输出 Token 超过输入的 4 倍，可能存在冗余输出`,
      evidence: `最长输出对话：${Math.max(...wastefulConvos.map(c => c.outputTokens))} tokens`,
      potentialSaving: totalCost * 0.05,
      action: '在提示词中明确要求简洁回复，或使用 /compact 压缩上下文',
      copyPrompt: '请简洁回复，避免重复内容，控制输出长度。',
    });
  }

  // 3. 任务-模型不匹配
  const analysisExpensive = conversations.filter(c =>
    c.taskType === '分析' && expensiveModels.some(m => (c.model || '').toLowerCase().includes(m))
  );
  if (analysisExpensive.length > 0) {
    suggestions.push({
      type: 'suggestion',
      title: '分析任务可用更轻量模型',
      description: `${analysisExpensive.length} 个分析任务使用了 Opus，DeepSeek 或 Sonnet 通常足够`,
      evidence: `分析任务平均 Token：${Math.round(analysisExpensive.reduce((s, c) => s + (c.totalTokens || 0), 0) / analysisExpensive.length)}`,
      potentialSaving: analysisExpensive.reduce((s, c) => s + (c.cost || 0), 0) * 0.8,
      action: '分析类任务改用 DeepSeek 或 Sonnet',
      copyPrompt: '请用 DeepSeek 模型分析这个问题，给出简洁的诊断结果。',
    });
  }

  // 4. unknown 模型多
  const unknownConvos = conversations.filter(c => c.model === 'unknown');
  if (unknownConvos.length > conversations.length * 0.3) {
    suggestions.push({
      type: 'warning',
      title: '大量对话模型未识别',
      description: `${unknownConvos.length} 个对话未能识别模型，费用统计可能不准确`,
      evidence: `占总对话 ${Math.round(unknownConvos.length / conversations.length * 100)}%`,
      potentialSaving: 0,
      action: '在导入时手动选择模型，或检查导出文件格式',
      copyPrompt: '',
    });
  }

  // 5. 最佳实践
  suggestions.push({
    type: 'best_practice',
    title: '任务-模型匹配建议',
    description: '编码用 Sonnet、分析用 DeepSeek、规划用 Opus、简单问答用 Haiku/Mimo',
    evidence: '基于各模型性价比分析',
    potentialSaving: 0,
    action: '按任务类型选择最优模型',
    copyPrompt: '',
  });

  return {
    suggestions,
    totalCost: Math.round(totalCost * 10000) / 10000,
    potentialSaving: Math.round(suggestions.reduce((s, r) => s + (r.potentialSaving || 0), 0) * 10000) / 10000,
    generatedBy: 'rule',
  };
}

/**
 * 异步生成 LLM 优化建议
 * @param {Array} conversations
 * @returns {Promise<{ success: boolean, result: Object|null, error: string|null }>}
 */
async function generateLLMRecommendations(conversations) {
  if (!isLLMAvailable()) {
    return { success: false, result: null, error: 'LLM 未配置' };
  }

  if (conversations.length === 0) {
    return { success: true, result: { suggestions: [], totalCost: 0, potentialSaving: 0 }, error: null };
  }

  try {
    const llmMessages = buildRecommendPrompt(conversations);
    const response = await callLLM(llmMessages, { jsonMode: true, maxTokens: 2000 });

    if (!response.success) {
      return { success: false, result: null, error: response.error };
    }

    // 解析 JSON 响应
    let parsed;
    try {
      let jsonStr = response.content.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      return { success: false, result: null, error: 'LLM 返回格式解析失败' };
    }

    // 验证和规范化建议
    const suggestions = (parsed.suggestions || []).map(s => ({
      type: ['warning', 'info', 'suggestion', 'best_practice'].includes(s.type) ? s.type : 'info',
      title: String(s.title || '').substring(0, 100),
      description: String(s.description || '').substring(0, 300),
      evidence: String(s.evidence || '').substring(0, 200),
      potentialSaving: Math.round((Number(s.potentialSaving) || 0) * 10000) / 10000,
      action: String(s.action || '').substring(0, 200),
      copyPrompt: String(s.copyPrompt || ''),
    }));

    const totalCost = conversations.reduce((s, c) => s + (c.cost || 0), 0);

    return {
      success: true,
      result: {
        suggestions,
        totalCost: Math.round(totalCost * 10000) / 10000,
        potentialSaving: Math.round(suggestions.reduce((s, r) => s + (r.potentialSaving || 0), 0) * 10000) / 10000,
        generatedBy: 'llm',
      },
      error: null,
    };
  } catch (err) {
    return { success: false, result: null, error: err.message };
  }
}

module.exports = { generateRecommendations, generateLLMRecommendations };
