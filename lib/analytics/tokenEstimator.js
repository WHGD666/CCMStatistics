/**
 * Token 估算器
 * 优先使用真实 usage，fallback 到字符估算
 */

/**
 * 从字符数估算 token
 */
function estimateTokens(text) {
  if (!text) return 0;
  const englishChars = (text.match(/[a-zA-Z0-9\s]/g) || []).length;
  const chineseChars = (text.match(/[一-鿿]/g) || []).length;
  const otherChars = text.length - englishChars - chineseChars;
  return Math.ceil(englishChars / 4 + chineseChars * 2 + otherChars / 2);
}

/**
 * 为消息列表计算 token 统计
 * 优先使用 JSONL 中的真实 usage 字段
 */
function calculateMessageTokens(messages) {
  let inputTokens = 0;
  let outputTokens = 0;
  let hasRealUsage = false;
  let estimatedCount = 0;

  for (const msg of messages) {
    if (msg.usage && (msg.usage.input_tokens > 0 || msg.usage.output_tokens > 0)) {
      // 使用真实 usage
      hasRealUsage = true;
      if (msg.role === 'user') {
        inputTokens += msg.usage.input_tokens || 0;
        outputTokens += msg.usage.output_tokens || 0;
      } else {
        outputTokens += msg.usage.output_tokens || 0;
        inputTokens += msg.usage.input_tokens || 0;
      }
      msg.tokens = (msg.usage.input_tokens || 0) + (msg.usage.output_tokens || 0);
      msg.tokenSource = 'real';
    } else {
      // 使用估算
      const estimated = estimateTokens(msg.content);
      msg.tokens = estimated;
      msg.tokenSource = 'estimated';
      estimatedCount++;
      if (msg.role === 'user') {
        inputTokens += estimated;
      } else {
        outputTokens += estimated;
      }
    }
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    hasRealUsage,
    estimatedCount,
    tokenConfidence: hasRealUsage ? (estimatedCount === 0 ? 'high' : 'mixed') : 'low',
  };
}

module.exports = { estimateTokens, calculateMessageTokens };
