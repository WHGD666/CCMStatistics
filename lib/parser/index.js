/**
 * 解析器统一入口
 * 自动识别格式并调用对应解析器
 */

const { parseTxt } = require('./parseTxt');
const { parseJsonl } = require('./parseJsonl');

/**
 * 解析导入内容
 * @param {string} content - 文件内容
 * @param {string} format - 格式: 'txt' | 'jsonl' | 'auto'
 * @returns {{ messages: Array, detectedModel: string, warnings: string[] }}
 */
function parseContent(content, format = 'auto') {
  if (format === 'auto') {
    const trimmed = content.trim();
    // JSONL: 每行都是 JSON
    if (trimmed.startsWith('{')) {
      const firstLine = trimmed.split('\n')[0].trim();
      try {
        JSON.parse(firstLine);
        format = 'jsonl';
      } catch {
        format = 'txt';
      }
    } else {
      format = 'txt';
    }
  }

  if (format === 'jsonl') {
    return parseJsonl(content);
  }
  return parseTxt(content);
}

module.exports = { parseContent, parseTxt, parseJsonl };
