/**
 * 通用 LLM API 客户端
 * 支持 DeepSeek / OpenAI / 自定义端点
 * 使用 Node.js 原生 fetch，无额外依赖
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', '..', 'data', 'config.json');

// 预设提供商
const PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
  },
};

/**
 * 读取 LLM 配置
 */
function loadLLMConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return config.llm || {};
    }
  } catch (e) {
    console.error('Load LLM config error:', e.message);
  }
  return {};
}

/**
 * 保存 LLM 配置
 */
function saveLLMConfig(llmConfig) {
  let config = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    // ignore
  }
  config.llm = llmConfig;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * 检查 LLM 是否可用
 */
function isLLMAvailable() {
  const config = loadLLMConfig();
  return !!(config.enabled && config.apiKey && config.baseUrl);
}

/**
 * 获取当前配置的模型信息
 */
function getModelInfo() {
  const config = loadLLMConfig();
  if (!config.enabled || !config.apiKey) {
    return { available: false, provider: null, model: null };
  }
  return {
    available: true,
    provider: config.provider || 'deepseek',
    model: config.model || 'deepseek-chat',
    baseUrl: config.baseUrl,
  };
}

/**
 * 调用 LLM Chat Completions API
 * @param {Array} messages - OpenAI 格式的消息数组 [{role, content}]
 * @param {Object} options - 可选参数
 * @returns {{ success: boolean, content: string|null, error: string|null, usage: object|null }}
 */
async function callLLM(messages, options = {}) {
  const config = loadLLMConfig();

  if (!config.enabled || !config.apiKey) {
    return { success: false, content: null, error: 'LLM 未配置或未启用', usage: null };
  }

  const baseUrl = (config.baseUrl || '').replace(/\/+$/, '');
  const model = options.model || config.model || 'deepseek-chat';
  const maxTokens = options.maxTokens || 2000;
  const temperature = options.temperature ?? 0.3;

  const url = `${baseUrl}/chat/completions`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 30000);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      let errorMsg = `API 请求失败 (${response.status})`;
      try {
        const errJson = JSON.parse(errorBody);
        errorMsg = errJson.error?.message || errorMsg;
      } catch {}
      return { success: false, content: null, error: errorMsg, usage: null };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || null;

    return { success: true, content, error: null, usage };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: false, content: null, error: '请求超时 (30s)', usage: null };
    }
    return { success: false, content: null, error: err.message, usage: null };
  }
}

/**
 * 测试 LLM 连接
 * @returns {{ success: boolean, message: string, model: string|null }}
 */
async function testConnection() {
  const config = loadLLMConfig();
  if (!config.apiKey) {
    return { success: false, message: '请先填写 API Key', model: null };
  }

  const result = await callLLM(
    [{ role: 'user', content: '请回复"连接成功"四个字。' }],
    { maxTokens: 20, timeout: 15000 }
  );

  if (result.success) {
    return { success: true, message: '连接成功', model: config.model };
  }
  return { success: false, message: result.error, model: null };
}

module.exports = {
  PROVIDERS,
  loadLLMConfig,
  saveLLMConfig,
  isLLMAvailable,
  getModelInfo,
  callLLM,
  testConnection,
};
