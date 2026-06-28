/**
 * 性价比评分
 * 改进版：多维度评分，带解释
 */

/**
 * 计算性价比评分
 * @returns {{ score: number, breakdown: object, explanation: string[] }}
 */
function calculateValueScore(conversation) {
  let score = 100;
  const breakdown = {};
  const explanation = [];

  const model = conversation.model || 'unknown';
  const inputTokens = conversation.inputTokens || 0;
  const outputTokens = conversation.outputTokens || 0;
  const totalTokens = inputTokens + outputTokens;
  const taskType = conversation.taskType || '其他';
  const cost = conversation.cost || 0;

  // 1. 模型匹配分 (±20)
  const expensiveModels = ['claude-opus-4', 'claude-3-opus'];
  const mediumModels = ['claude-sonnet-4', 'claude-3.5-sonnet'];
  const cheapModels = ['deepseek', 'mimo', 'haiku'];
  const isExpensive = expensiveModels.some(m => model.toLowerCase().includes(m));
  const isMedium = mediumModels.some(m => model.toLowerCase().includes(m));
  const isCheap = cheapModels.some(m => model.toLowerCase().includes(m));

  let modelScore = 0;
  if (taskType === '分析' && isExpensive) {
    modelScore = -15;
    explanation.push('分析任务使用了高端模型，可考虑用更轻量的模型');
  } else if (taskType === '编码' && isExpensive) {
    modelScore = -5;
    explanation.push('编码任务使用高端模型，简单编码可降级');
  } else if (taskType === '规划' && isExpensive) {
    modelScore = 5;
    explanation.push('规划任务使用高端模型是合理的');
  } else if (taskType === '编码' && isCheap) {
    modelScore = 5;
    explanation.push('编码任务使用轻量模型，性价比高');
  } else if (model === 'unknown') {
    modelScore = -10;
    explanation.push('模型未识别，评分置信度低');
  }
  breakdown.modelScore = modelScore;
  score += modelScore;

  // 2. Token 效率分 (±15)
  let tokenScore = 0;
  if (outputTokens > 0 && inputTokens > 0) {
    const ratio = outputTokens / inputTokens;
    if (ratio > 5) {
      tokenScore = -10;
      explanation.push('输出 Token 远超输入，可能有冗余输出');
    } else if (ratio > 3) {
      tokenScore = -5;
      explanation.push('输出 Token 较高');
    } else if (ratio >= 0.5 && ratio <= 2) {
      tokenScore = 5;
      explanation.push('输入输出比例健康');
    }
  }
  breakdown.tokenScore = tokenScore;
  score += tokenScore;

  // 3. 对话规模分 (±10)
  let scaleScore = 0;
  if (totalTokens < 200 && (isExpensive || isMedium)) {
    scaleScore = -10;
    explanation.push('短对话使用了中高端模型');
  } else if (totalTokens > 50000) {
    scaleScore = -5;
    explanation.push('超长对话，考虑拆分会话');
  }
  breakdown.scaleScore = scaleScore;
  score += scaleScore;

  // 4. 费用风险分 (±10)
  let costScore = 0;
  if (cost > 1.0) {
    costScore = -10;
    explanation.push('单次对话费用超过 $1');
  } else if (cost > 0.5) {
    costScore = -5;
    explanation.push('单次对话费用较高');
  }
  breakdown.costScore = costScore;
  score += costScore;

  // 置信度
  let confidence = 'medium';
  if (model === 'unknown') confidence = 'low';
  else if (conversation.tokenConfidence === 'high') confidence = 'high';

  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown,
    explanation,
    confidence,
  };
}

module.exports = { calculateValueScore };
