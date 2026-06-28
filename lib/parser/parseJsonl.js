/**
 * Claude Code JSONL 格式解析器
 * 重写版：准确提取 user/assistant/tool 消息，优先使用真实 usage
 */

function parseJsonl(content) {
  const messages = [];
  const warnings = [];
  let detectedModel = null;
  const lines = content.split('\n').filter(line => line.trim());

  for (const line of lines) {
    try {
      const data = JSON.parse(line);

      if (data.type === 'user' && data.message?.content) {
        let text = '';
        if (typeof data.message.content === 'string') {
          text = data.message.content;
        } else if (Array.isArray(data.message.content)) {
          text = data.message.content
            .map(c => c.text || c.content || '')
            .filter(Boolean)
            .join('');
        }

        if (text.trim()) {
          messages.push({
            role: 'user',
            content: text.trim(),
            timestamp: data.timestamp || null,
          });
        }
      } else if (data.type === 'assistant' && data.message?.content) {
        if (data.message.model) {
          detectedModel = data.message.model;
        }

        let text = '';
        if (typeof data.message.content === 'string') {
          text = data.message.content;
        } else if (Array.isArray(data.message.content)) {
          const parts = [];
          for (const c of data.message.content) {
            if (c.type === 'text' && c.text) parts.push(c.text);
            else if (c.type === 'thinking' && c.thinking) parts.push(`[思考] ${c.thinking}`);
            else if (c.type === 'tool_use') parts.push(`[工具调用] ${c.name}: ${JSON.stringify(c.input || {}).substring(0, 200)}`);
          }
          text = parts.join('\n');
        }

        if (text.trim()) {
          const msg = {
            role: 'assistant',
            content: text.trim(),
            timestamp: data.timestamp || null,
          };

          // 提取真实 usage
          if (data.message.usage) {
            msg.usage = {
              input_tokens: data.message.usage.input_tokens || 0,
              output_tokens: data.message.usage.output_tokens || 0,
              cache_creation_input_tokens: data.message.usage.cache_creation_input_tokens || 0,
              cache_read_input_tokens: data.message.usage.cache_read_input_tokens || 0,
            };
          }

          messages.push(msg);
        }
      } else if (data.type === 'tool_result' && data.content) {
        let text = '';
        if (typeof data.content === 'string') {
          text = data.content;
        } else if (Array.isArray(data.content)) {
          text = data.content.map(c => c.text || '').join('');
        }
        if (text.trim()) {
          messages.push({
            role: 'tool',
            content: text.trim().substring(0, 2000), // 限制工具输出长度
            timestamp: data.timestamp || null,
          });
        }
      }
    } catch (e) {
      // 跳过无法解析的行
    }
  }

  if (messages.length === 0) {
    warnings.push('JSONL 文件中未找到有效消息');
  }

  return { messages, detectedModel: detectedModel || 'unknown', warnings };
}

module.exports = { parseJsonl };
