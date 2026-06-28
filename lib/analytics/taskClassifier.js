/**
 * 任务分类器
 * 改进版：用户消息优先，支持多标签，带置信度
 */

const TASK_KEYWORDS = {
  '编码': {
    primary: ['写', '实现', '函数', '类', '修复', '修改', '代码', 'bug', 'Bug', 'function', 'class', 'implement', 'fix', 'refactor', '重构', '组件', 'component', '接口', 'API', 'endpoint'],
    secondary: ['文件', 'file', 'module', '模块', 'import', 'export', 'npm', 'package'],
    weight: 1.0,
  },
  '分析': {
    primary: ['分析', '排查', '诊断', '为什么', '是什么', '评估', '对比', 'analyze', 'debug', 'why', 'what', 'compare', '差异', 'difference', '性能', 'performance', 'profile'],
    secondary: ['日志', 'log', '错误', 'error', 'warning', '异常', 'exception', '原因'],
    weight: 0.9,
  },
  '规划': {
    primary: ['规划', '设计', '架构', '方案', '计划', '技术选型', 'plan', 'design', 'architecture', '方案', 'strategy', 'approach'],
    secondary: ['讨论', 'discuss', '方案', 'proposal', '评审', 'review'],
    weight: 0.8,
  },
  '执行': {
    primary: ['运行', '测试', '部署', '构建', '打包', '发布', 'run', 'test', 'deploy', 'build', 'compile', 'install', '安装'],
    secondary: ['docker', 'ci', 'cd', 'pipeline', '命令', 'command', 'script'],
    weight: 0.7,
  },
};

/**
 * 对单条用户消息分类
 */
function classifyMessage(text) {
  if (!text) return { type: '其他', confidence: 0 };

  const lowerText = text.toLowerCase();
  const scores = {};

  for (const [taskType, config] of Object.entries(TASK_KEYWORDS)) {
    let score = 0;
    let matchCount = 0;

    for (const keyword of config.primary) {
      if (lowerText.includes(keyword.toLowerCase())) {
        score += 2 * config.weight;
        matchCount++;
      }
    }

    for (const keyword of config.secondary) {
      if (lowerText.includes(keyword.toLowerCase())) {
        score += 1 * config.weight;
        matchCount++;
      }
    }

    if (score > 0) {
      scores[taskType] = { score, matchCount };
    }
  }

  if (Object.keys(scores).length === 0) {
    return { type: '其他', confidence: 0.3 };
  }

  // 排序取最高分
  const sorted = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
  const [topType, topData] = sorted[0];
  const totalScore = sorted.reduce((sum, [, d]) => sum + d.score, 0);
  const confidence = Math.min(0.95, topData.score / Math.max(totalScore, 1) * 0.7 + topData.matchCount * 0.1);

  return {
    type: topType,
    confidence: Math.round(confidence * 100) / 100,
    allTypes: sorted.map(([type, data]) => ({ type, score: data.score })),
  };
}

/**
 * 对整个会话分类（用户消息优先）
 */
function classifyConversation(messages) {
  // 只用用户消息分类
  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length === 0) {
    return { type: '其他', confidence: 0.1, isUserBased: false };
  }

  // 统计各类型出现次数
  const typeCounts = {};
  let totalConfidence = 0;

  for (const msg of userMessages) {
    const result = classifyMessage(msg.content);
    typeCounts[result.type] = (typeCounts[result.type] || 0) + 1;
    totalConfidence += result.confidence;
  }

  // 取出现最多的类型
  const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  const primaryType = sorted[0][0];
  const avgConfidence = totalConfidence / userMessages.length;

  // 是否混合任务
  const isMixed = sorted.length > 1 && sorted[1][1] >= sorted[0][1] * 0.5;
  const secondaryType = isMixed ? sorted[1][0] : null;

  return {
    type: primaryType,
    secondaryType,
    confidence: Math.round(avgConfidence * 100) / 100,
    isUserBased: true,
    distribution: typeCounts,
  };
}

module.exports = { classifyMessage, classifyConversation };
