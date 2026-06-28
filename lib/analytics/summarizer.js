/**
 * 结构化摘要生成器
 * 支持 LLM 生成（优先）+ 规则回退
 */

const { callLLM, isLLMAvailable } = require('../llm/client');
const { buildSummarizePrompt } = require('../llm/prompts');

/**
 * 生成结构化摘要（优先使用 LLM，回退到规则）
 * @param {Array} messages
 * @param {Object} options - { useLLM: boolean }
 * @returns {Object} 结构化摘要
 */
function generateStructuredSummary(messages, options = {}) {
  // 规则版始终生成（作为回退）
  const ruleBased = generateRuleBasedSummary(messages);

  // 如果不使用 LLM 或 LLM 不可用，直接返回规则版
  if (options.useLLM === false || !isLLMAvailable()) {
    return ruleBased;
  }

  // 返回规则版，调用方可以通过 generateLLMSummary 异步获取 LLM 版本
  return ruleBased;
}

/**
 * 异步生成 LLM 结构化摘要
 * @param {Array} messages
 * @returns {Promise<{ success: boolean, summary: Object|null, error: string|null }>}
 */
async function generateLLMSummary(messages) {
  if (!isLLMAvailable()) {
    return { success: false, summary: null, error: 'LLM 未配置' };
  }

  try {
    const llmMessages = buildSummarizePrompt(messages);
    const result = await callLLM(llmMessages, { jsonMode: true, maxTokens: 1500 });

    if (!result.success) {
      return { success: false, summary: null, error: result.error };
    }

    // 解析 JSON 响应
    let parsed;
    try {
      // 提取 JSON（LLM 可能会包裹在 markdown 代码块中）
      let jsonStr = result.content.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      return { success: false, summary: null, error: 'LLM 返回格式解析失败' };
    }

    // 验证和规范化字段
    const summary = {
      problem: String(parsed.problem || '').substring(0, 200),
      userGoal: String(parsed.problem || '').substring(0, 200),
      keyActions: Array.isArray(parsed.keyActions) ? parsed.keyActions.slice(0, 8).map(String) : [],
      touchedFiles: Array.isArray(parsed.touchedFiles) ? parsed.touchedFiles.slice(0, 15).map(String) : [],
      result: String(parsed.result || '').substring(0, 300),
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 5).map(String) : [],
      nextPrompt: String(parsed.nextPrompt || ''),
      generatedBy: 'llm',
    };

    return { success: true, summary, error: null };
  } catch (err) {
    return { success: false, summary: null, error: err.message };
  }
}

/**
 * 规则版结构化摘要（原有逻辑）
 */
function generateRuleBasedSummary(messages) {
  const userMessages = messages.filter(m => m.role === 'user');
  const assistantMessages = messages.filter(m => m.role === 'assistant');

  // 提取用户目标（第一条用户消息）
  const firstUser = userMessages[0];
  const problem = firstUser ? truncate(firstUser.content, 100) : '未知';

  // 提取关键操作（从助手消息和工具消息中）
  const keyActions = [];
  for (const msg of messages) {
    if (msg.role === 'assistant') {
      const fileOps = msg.content.match(/(?:Read|Write|Edit|Create|Delete)\s+[`"]?([^\s`"]+\.[a-zA-Z]+)/g);
      if (fileOps) {
        for (const op of fileOps.slice(0, 5)) {
          if (!keyActions.includes(op)) keyActions.push(op);
        }
      }
    }
  }

  // 提取涉及文件
  const touchedFiles = new Set();
  for (const msg of messages) {
    const fileRefs = msg.content.match(/(?:^|\s)([a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,10})/gm);
    if (fileRefs) {
      for (const f of fileRefs) {
        const clean = f.trim();
        if (clean.length > 3 && clean.length < 100 && !clean.startsWith('http')) {
          touchedFiles.add(clean);
        }
      }
    }
  }

  // 提取结果（最后一条助手消息）
  const lastAssistant = assistantMessages[assistantMessages.length - 1];
  const result = lastAssistant ? truncate(lastAssistant.content, 150) : '';

  // 生成下次接续建议
  const nextPrompt = generateNextPrompt(problem, result, keyActions);

  return {
    problem,
    userGoal: problem,
    keyActions: keyActions.slice(0, 10),
    touchedFiles: Array.from(touchedFiles).slice(0, 20),
    result,
    risks: detectRisks(messages),
    nextPrompt,
    generatedBy: 'rule',
  };
}

/**
 * 生成简单文本摘要（向后兼容）
 */
function generateSimpleSummary(messages) {
  const structured = generateStructuredSummary(messages);
  const parts = [];
  if (structured.problem) parts.push(`问题: ${structured.problem}`);
  if (structured.keyActions.length > 0) parts.push(`操作: ${structured.keyActions.slice(0, 3).join(', ')}`);
  if (structured.result) parts.push(`结果: ${truncate(structured.result, 60)}`);
  return parts.join(' | ') || '空对话';
}

function detectRisks(messages) {
  const risks = [];
  const allContent = messages.map(m => m.content).join(' ').toLowerCase();

  if (allContent.includes('error') || allContent.includes('错误') || allContent.includes('failed')) {
    risks.push('会话中存在错误');
  }
  if (allContent.includes('todo') || allContent.includes('fixme') || allContent.includes('hack')) {
    risks.push('存在待处理的 TODO/FIXME');
  }
  if (messages.filter(m => m.role === 'user').length > 20) {
    risks.push('超长会话，建议拆分');
  }
  return risks;
}

function generateNextPrompt(problem, result, actions) {
  if (!problem) return '';
  const actionHint = actions.length > 0 ? `，之前做了 ${actions.slice(0, 2).join('、')}` : '';
  return `继续之前的工作：${truncate(problem, 50)}${actionHint}。请检查当前状态并继续。`;
}

function truncate(text, maxLen) {
  if (!text) return '';
  text = text.replace(/\n/g, ' ').trim();
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

module.exports = { generateStructuredSummary, generateLLMSummary, generateSimpleSummary };
