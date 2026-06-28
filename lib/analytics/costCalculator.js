/**
 * 费用计算器
 * 带置信度，unknown 模型不默认按高价计费
 * 价格来源：各厂商官网 API 定价页（2025-2026）
 */

// 模型单价 ($/M tokens)
// 匹配顺序：长 key 优先，避免 'sonnet' 误匹配到 'claude-sonnet-4'
const MODEL_PRICING = {
  // ---- Anthropic ----
  'claude-opus-4':      { input: 15.0,   output: 75.0,   display: 'Claude Opus 4' },
  'claude-3-opus':      { input: 15.0,   output: 75.0,   display: 'Claude 3 Opus' },
  'claude-sonnet-4':    { input: 3.0,    output: 15.0,   display: 'Claude Sonnet 4' },
  'claude-3.5-sonnet':  { input: 3.0,    output: 15.0,   display: 'Claude 3.5 Sonnet' },
  'claude-3-sonnet':    { input: 3.0,    output: 15.0,   display: 'Claude 3 Sonnet' },
  'claude-3-haiku':     { input: 0.25,   output: 1.25,   display: 'Claude 3 Haiku' },

  // ---- OpenAI ----
  'gpt-4o-mini':        { input: 0.15,   output: 0.60,   display: 'GPT-4o Mini' },
  'gpt-4o':             { input: 2.50,   output: 10.0,   display: 'GPT-4o' },
  'gpt-4-turbo':        { input: 10.0,   output: 30.0,   display: 'GPT-4 Turbo' },
  'gpt-4':              { input: 30.0,   output: 60.0,   display: 'GPT-4' },
  'gpt-3.5-turbo':      { input: 0.50,   output: 1.50,   display: 'GPT-3.5 Turbo' },
  'o3-mini':            { input: 1.10,   output: 4.40,   display: 'o3-mini' },
  'o1-mini':            { input: 3.0,    output: 12.0,   display: 'o1-mini' },
  'o1':                 { input: 15.0,   output: 60.0,   display: 'o1' },
  'chatgpt-4o':         { input: 2.50,   output: 10.0,   display: 'ChatGPT-4o' },

  // ---- DeepSeek ----
  'deepseek-r1':        { input: 0.55,   output: 2.19,   display: 'DeepSeek R1' },
  'deepseek-v3':        { input: 0.27,   output: 1.10,   display: 'DeepSeek V3' },
  'deepseek-chat':      { input: 0.27,   output: 1.10,   display: 'DeepSeek Chat' },
  'deepseek-coder':     { input: 0.27,   output: 1.10,   display: 'DeepSeek Coder' },
  'deepseek':           { input: 0.27,   output: 1.10,   display: 'DeepSeek' },

  // ---- Google ----
  'gemini-2.5-pro':     { input: 1.25,   output: 10.0,   display: 'Gemini 2.5 Pro' },
  'gemini-2.5-flash':   { input: 0.15,   output: 0.60,   display: 'Gemini 2.5 Flash' },
  'gemini-2.0-flash':   { input: 0.10,   output: 0.40,   display: 'Gemini 2.0 Flash' },
  'gemini-1.5-pro':     { input: 1.25,   output: 5.0,    display: 'Gemini 1.5 Pro' },
  'gemini-1.5-flash':   { input: 0.075,  output: 0.30,   display: 'Gemini 1.5 Flash' },
  'gemini-pro':         { input: 0.50,   output: 1.50,   display: 'Gemini Pro' },

  // ---- Meta ----
  'llama-3.3':          { input: 0.20,   output: 0.60,   display: 'Llama 3.3' },
  'llama-3.1-405b':     { input: 1.0,    output: 1.0,    display: 'Llama 3.1 405B' },
  'llama-3.1-70b':      { input: 0.52,   output: 0.75,   display: 'Llama 3.1 70B' },
  'llama-3.1-8b':       { input: 0.05,   output: 0.08,   display: 'Llama 3.1 8B' },

  // ---- Mistral ----
  'mistral-large':      { input: 2.0,    output: 6.0,    display: 'Mistral Large' },
  'mistral-small':      { input: 0.20,   output: 0.60,   display: 'Mistral Small' },
  'mistral-medium':     { input: 2.70,   output: 8.10,   display: 'Mistral Medium' },
  'codestral':          { input: 0.30,   output: 0.90,   display: 'Codestral' },
  'mixtral-8x7b':       { input: 0.24,   output: 0.24,   display: 'Mixtral 8x7B' },
  'mixtral-8x22b':      { input: 0.65,   output: 0.65,   display: 'Mixtral 8x22B' },

  // ---- 其他 ----
  'qwen-2.5':           { input: 0.15,   output: 0.60,   display: 'Qwen 2.5' },
  'qwen-max':           { input: 1.60,   output: 6.40,   display: 'Qwen Max' },
  'glm-4':              { input: 0.70,   output: 0.70,   display: 'GLM-4' },
  'mimo':               { input: 0.50,   output: 1.0,    display: 'Mimo' },
  'yi-large':           { input: 0.60,   output: 0.60,   display: 'Yi Large' },
  'command-r-plus':     { input: 2.50,   output: 10.0,   display: 'Command R+' },
  'command-r':          { input: 0.15,   output: 0.60,   display: 'Command R' },

  // ---- 兜底 ----
  'unknown':            { input: 0,      output: 0,      display: '未知模型' },
};

// 按 key 长度降序排列，确保长 key 优先匹配
const SORTED_KEYS = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);

/**
 * 计算费用（带置信度）
 */
function calculateCost(inputTokens, outputTokens, model) {
  if (!model || model === 'unknown') {
    return {
      cost: 0,
      confidence: 'unknown',
      note: '模型未识别，费用暂不计算',
      modelDisplay: '未知模型',
    };
  }

  const lower = model.toLowerCase();
  const modelKey = SORTED_KEYS.find(key => lower.includes(key));

  if (!modelKey || modelKey === 'unknown') {
    return {
      cost: 0,
      confidence: 'unknown',
      note: `模型 "${model}" 未在定价表中，费用暂不计算`,
      modelDisplay: model,
    };
  }

  const pricing = MODEL_PRICING[modelKey];
  const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;

  return {
    cost: Math.round(cost * 10000) / 10000,
    confidence: 'high',
    note: `基于 ${pricing.display} 定价 ($${pricing.input}/$${pricing.output} per M)`,
    modelDisplay: pricing.display,
    pricing: { input: pricing.input, output: pricing.output },
  };
}

/**
 * 获取模型显示名称
 */
function getModelDisplayName(model) {
  if (!model || model === 'unknown') return '未知模型';
  const lower = model.toLowerCase();
  const modelKey = SORTED_KEYS.find(key => lower.includes(key));
  return modelKey ? MODEL_PRICING[modelKey].display : model;
}

/**
 * 获取所有模型定价（供前端设置页展示）
 */
function getAllPricing() {
  return Object.entries(MODEL_PRICING)
    .filter(([key]) => key !== 'unknown')
    .map(([key, val]) => ({ key, ...val }))
    .sort((a, b) => a.input - b.input);
}

module.exports = { calculateCost, getModelDisplayName, getAllPricing, MODEL_PRICING };
