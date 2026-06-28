/**
 * Claude Code TXT 文本格式解析器
 * 重写版：准确拆分 user/assistant/tool/system 消息
 */

function parseTxt(content) {
  const messages = [];
  const warnings = [];
  const lines = content.split('\n');
  let detectedModel = null;

  // 状态机
  let currentRole = null;
  let currentContent = [];
  let lineIdx = 0;

  function flush() {
    if (currentRole && currentContent.length > 0) {
      const text = currentContent.join('\n').trim();
      if (text.length > 0) {
        messages.push({ role: currentRole, content: text });
      }
    }
    currentRole = null;
    currentContent = [];
  }

  // 清理边框字符
  function cleanBorder(line) {
    return line.replace(/[╭╮╰╯│─┐└┘┌]/g, '').trim();
  }

  // 检测模型（长模式优先）
  const MODEL_PATTERNS = [
    // Anthropic
    { pattern: /Opus\s*4\.?\d*/i, model: 'claude-opus-4' },
    { pattern: /Opus\s*3/i, model: 'claude-3-opus' },
    { pattern: /Sonnet\s*4\.?\d*/i, model: 'claude-sonnet-4' },
    { pattern: /Sonnet\s*3\.?5/i, model: 'claude-3.5-sonnet' },
    { pattern: /Sonnet\s*3/i, model: 'claude-3-sonnet' },
    { pattern: /Haiku/i, model: 'claude-3-haiku' },
    { pattern: /Claude(?!\s*Code)/i, model: 'claude-sonnet-4' },
    // OpenAI
    { pattern: /GPT-?4o[-\s]?Mini/i, model: 'gpt-4o-mini' },
    { pattern: /GPT-?4o/i, model: 'gpt-4o' },
    { pattern: /GPT-?4[-\s]?Turbo/i, model: 'gpt-4-turbo' },
    { pattern: /GPT-?4/i, model: 'gpt-4' },
    { pattern: /GPT-?3\.?5/i, model: 'gpt-3.5-turbo' },
    { pattern: /o3[-\s]?mini/i, model: 'o3-mini' },
    { pattern: /o1[-\s]?mini/i, model: 'o1-mini' },
    { pattern: /\bo1\b/i, model: 'o1' },
    { pattern: /ChatGPT/i, model: 'chatgpt-4o' },
    // DeepSeek
    { pattern: /DeepSeek[-\s]?R1/i, model: 'deepseek-r1' },
    { pattern: /DeepSeek[-\s]?V3/i, model: 'deepseek-v3' },
    { pattern: /DeepSeek[-\s]?Coder/i, model: 'deepseek-coder' },
    { pattern: /DeepSeek/i, model: 'deepseek' },
    // Google
    { pattern: /Gemini\s*2\.?5[-\s]?Pro/i, model: 'gemini-2.5-pro' },
    { pattern: /Gemini\s*2\.?5[-\s]?Flash/i, model: 'gemini-2.5-flash' },
    { pattern: /Gemini\s*2\.?0[-\s]?Flash/i, model: 'gemini-2.0-flash' },
    { pattern: /Gemini\s*1\.?5[-\s]?Pro/i, model: 'gemini-1.5-pro' },
    { pattern: /Gemini\s*1\.?5[-\s]?Flash/i, model: 'gemini-1.5-flash' },
    { pattern: /Gemini/i, model: 'gemini-2.5-pro' },
    // Meta
    { pattern: /Llama\s*3\.?3/i, model: 'llama-3.3' },
    { pattern: /Llama\s*3\.?1[-\s]?405/i, model: 'llama-3.1-405b' },
    { pattern: /Llama\s*3\.?1[-\s]?70/i, model: 'llama-3.1-70b' },
    { pattern: /Llama\s*3\.?1[-\s]?8/i, model: 'llama-3.1-8b' },
    { pattern: /Llama/i, model: 'llama-3.3' },
    // Mistral
    { pattern: /Mistral[-\s]?Large/i, model: 'mistral-large' },
    { pattern: /Mistral[-\s]?Small/i, model: 'mistral-small' },
    { pattern: /Codestral/i, model: 'codestral' },
    { pattern: /Mixtral[-\s]?8x22/i, model: 'mixtral-8x22b' },
    { pattern: /Mixtral[-\s]?8x7/i, model: 'mixtral-8x7b' },
    { pattern: /Mistral/i, model: 'mistral-large' },
    // 其他
    { pattern: /Qwen[-\s]?Max/i, model: 'qwen-max' },
    { pattern: /Qwen/i, model: 'qwen-2.5' },
    { pattern: /GLM[-\s]?4/i, model: 'glm-4' },
    { pattern: /Mimo/i, model: 'mimo' },
    { pattern: /Yi[-\s]?Large/i, model: 'yi-large' },
    { pattern: /Command[-\s]?R\+/i, model: 'command-r-plus' },
    { pattern: /Command[-\s]?R/i, model: 'command-r' },
  ];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) continue;

    // 尝试从任意行检测模型
    if (!detectedModel) {
      for (const { pattern, model } of MODEL_PATTERNS) {
        if (pattern.test(trimmed)) {
          detectedModel = model;
          break;
        }
      }
    }

    // 跳过纯边框线
    if (/^[╭╮╰╯─│┐└┘┌]+$/.test(trimmed)) continue;

    // 跳过系统提示
    if (isSystemLine(trimmed)) continue;

    // 跳过 thinking 行
    if (/^(✻|※)\s*(Thought|Saut[ée]ed|Brewed|Cooked|Stirred|Simmered)\s+for\s+\d+s/.test(trimmed)) {
      continue;
    }
    if (/^✻\s+\w+ed for \d+s/.test(trimmed)) continue;

    // 跳过命令输出标记
    if (isCommandOutput(trimmed)) continue;

    // 用户输入: ❯ 或 > 开头（非引用块）
    if (/^(❯|>\s)/.test(trimmed) && !trimmed.startsWith('> ') || trimmed === '❯') {
      flush();
      currentRole = 'user';
      const text = trimmed.replace(/^(❯\s*|>\s*)/, '').trim();
      if (text) currentContent.push(text);
      continue;
    }

    // 助手回复: ● 开头
    if (/^●\s/.test(trimmed) || trimmed === '●') {
      flush();
      currentRole = 'assistant';
      const text = trimmed.replace(/^●\s*/, '').trim();
      if (text) currentContent.push(text);
      continue;
    }

    // 工具调用: Bash(  Read(  Write(  Edit(  Grep(  Glob( 等
    if (/^(Bash|Read|Write|Edit|Grep|Glob|WebFetch|WebSearch|TodoWrite|TaskOutput|Agent|SendMessage|Skill|NotebookEdit)\(/.test(trimmed)) {
      if (currentRole !== 'tool') {
        flush();
        currentRole = 'tool';
      }
      currentContent.push(cleanBorder(trimmed));
      continue;
    }

    // 继续当前消息
    if (currentRole) {
      // 过滤 ⎿ 标记但保留内容
      let line = trimmed;
      if (line.startsWith('⎿')) {
        line = line.replace(/^⎿\s*/, '');
      }
      if (line) {
        currentContent.push(cleanBorder(line));
      }
    }
  }

  flush();

  // 验证
  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length === 0) {
    warnings.push('未找到用户消息，解析可能不准确');
  }

  // 合并连续相同角色消息（如果中间没有其他角色）
  const merged = [];
  for (const msg of messages) {
    if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
      merged[merged.length - 1].content += '\n' + msg.content;
    } else {
      merged.push({ ...msg });
    }
  }

  return { messages: merged, detectedModel: detectedModel || 'unknown', warnings };
}

function isSystemLine(line) {
  const systemPatterns = [
    'Tips for getting started',
    "What's new",
    'release-notes',
    'API Usage Billing',
    'Welcome back',
    'Claude Code',
    'Type /help',
    'npm notice',
    'node_modules',
  ];
  return systemPatterns.some(p => line.includes(p));
}

function isCommandOutput(line) {
  return line.includes('<local-command-caveat>') ||
    line.includes('<command-name>') ||
    line.includes('<command-message>') ||
    line.includes('<command-args>') ||
    line.includes('<local-command-stdout>');
}

module.exports = { parseTxt };
