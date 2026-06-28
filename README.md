<div align="center">

# CCMStatistics

**Claude Code 本地化成本分析与对话管理平台**

<br>

![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.18-000000?style=flat-square&logo=express&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-4.4-FF6384?style=flat-square&logo=chart.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-6366f1?style=flat-square)
![Status](https://img.shields.io/badge/Active-10b981?style=flat-square)

<br>

每次用 Claude Code 写代码，你真的知道钱花在哪了吗？

CCMStatistics 把 Claude Code 的对话记录变成一张清晰的账单——
花了多少 Token、用了什么模型、做了什么任务、值不值这个价。

**不登录、不上云、不收集任何数据。全部本地运行。**

<br>

<img src="https://img.shields.io/badge/快速开始-→-6366f1?style=for-the-badge&logoColor=white" />

</div>

---

## 它能做什么

```
导入对话文件 → 自动解析 → 识别模型 → 分类任务 → 估算费用 → 生成评分 → 可视化展示
```

一条 Claude Code 对话导入后，你会看到：

| 信息 | 说明 |
|------|------|
| **模型** | 自动识别 Claude Opus / Sonnet / GPT-4o / DeepSeek 等 43 种模型 |
| **任务类型** | 编码、分析、规划、执行、其他——基于用户消息分类 |
| **Token 消耗** | 优先读取 API 真实数据，无数据时按字符估算，标注置信度 |
| **费用** | 按模型官方定价计算，unknown 模型不计费，避免误导 |
| **性价比评分** | 0-100 分，结合模型匹配度、Token 效率、任务复杂度、费用风险 |
| **结构化摘要** | 问题、关键操作、涉及文件、结果、风险、下次接续建议 |

---

## 核心功能

### 对话导入

支持 Claude Code `/export` 导出的两种格式：

- **TXT 文本格式** — 自动识别 `❯` 用户输入和 `●` 助手回复
- **JSONL 结构化格式** — 优先提取真实 Token usage、模型名、时间戳

导入时自动创建项目，自动检测模型类型。支持 43 种主流模型的精确定价。

### 统计面板

首页展示五个核心指标卡片：

- 总对话数 / 总 Token / 总费用 / 项目数 / 平均评分

下方跟随 Token 使用趋势图和任务分布图，全部由真实数据驱动——没有一行 `Math.random()`。

### 数据大屏

全屏可视化面板：

- **Token 趋势** — 输入/输出双线渐变填充，hover 显示具体数值
- **模型分布** — 环形图展示各模型使用占比
- **任务分布** — 柱状图展示编码/分析/规划/执行分布
- **活动热力图** — 最近 16 周每日活动，hover 发光放大
- **高效对话 TOP 5** — 按性价比评分排序
- **概览面板** — 平均消息数、最常用模型、项目覆盖率

顶部摘要条横排展示五个关键指标，数字使用等宽字体。

### 对话回放

点击任意对话，查看完整回放：

- **统计面板** — 模型、任务类型、输入/输出 Token、费用、评分，附置信度标签
- **结构化摘要** — 问题、操作、文件、结果、风险、下次接续 Prompt
- **消息时间线** — user / assistant / tool 三色区分，支持复制任意消息
- **一键复制** — 复制摘要或接续 Prompt，直接粘贴到 Claude Code 继续工作

### 筛选与搜索

- 按项目、模型、任务类型筛选
- 按时间、费用、Token、评分排序
- 全局搜索覆盖标题、摘要、消息正文
- 动态填充模型列表

### 规则优化建议

基于对话数据自动生成可执行建议：

- 高端模型使用比例是否偏高
- Token 输出效率是否正常
- 分析任务是否用了过贵的模型
- 每条建议附带证据、预计节省金额、可复制的 Prompt

---

## 支持的模型（43 种）

| 厂商 | 模型 |
|------|------|
| **Anthropic** | Claude Opus 4, Sonnet 4, 3.5 Sonnet, 3 Haiku, 3 Opus |
| **OpenAI** | GPT-4o, GPT-4o Mini, GPT-4, GPT-4 Turbo, GPT-3.5 Turbo, o1, o1-mini, o3-mini, ChatGPT-4o |
| **DeepSeek** | V3, R1, Chat, Coder |
| **Google** | Gemini 2.5 Pro/Flash, 2.0 Flash, 1.5 Pro/Flash, Pro |
| **Meta** | Llama 3.3, 3.1 405B/70B/8B |
| **Mistral** | Large, Small, Medium, Codestral, Mixtral 8x7B/8x22B |
| **其他** | Qwen 2.5/Max, GLM-4, Mimo, Yi Large, Command R/R+ |

模型定价全部来自各厂商官网 API 定价页，定期可更新。

---

## 快速开始

```bash
# 1. 克隆项目
git clone https://github.com/your-username/CCMStatistics.git
cd CCMStatistics/CCMStatistics-main

# 2. 安装依赖
npm install

# 3. 启动服务
npm start
```

打开浏览器访问 `http://localhost:3025`

也可以直接双击 `start.bat`（Windows）或运行 `start.sh`（macOS/Linux）。

### 环境要求

- Node.js 18+
- 无需数据库，无需 Docker，无需注册

---

## 使用方式

### 导入对话

1. 在 Claude Code 中执行 `/export` 导出对话
2. 在 CCMStatistics 中点击「导入会话」
3. 拖入导出的 `.txt` 或 `.jsonl` 文件
4. 系统自动解析、分类、计费、评分

### 查看分析

- **统计面板** — 看总量和趋势
- **数据大屏** — 看分布和热力图
- **对话列表** — 筛选、排序、搜索
- **点击对话** — 回放消息、查看摘要、复制接续 Prompt

### 优化成本

- 查看「优化建议」获取可执行的降本策略
- 根据任务类型调整模型选择
- 关注性价比评分低于 60 的对话

---

## 技术架构

```
CCMStatistics/
├── server.js                # Express 服务入口
├── lib/
│   ├── parser/              # 对话解析器
│   │   ├── index.js         # 统一入口，自动识别格式
│   │   ├── parseTxt.js      # TXT 文本解析（状态机）
│   │   └── parseJsonl.js    # JSONL 结构化解析
│   └── analytics/           # 分析引擎
│       ├── tokenEstimator.js    # Token 估算（优先真实 usage）
│       ├── costCalculator.js    # 费用计算（43 模型定价）
│       ├── taskClassifier.js    # 任务分类（用户消息优先）
│       ├── valueScore.js        # 性价比评分（多维度）
│       ├── recommendations.js   # 规则优化建议
│       └── summarizer.js        # 结构化摘要生成
├── public/
│   ├── index.html           # 单页应用
│   ├── css/
│   │   ├── themes.css       # 双主题色彩体系
│   │   ├── layout.css       # 布局与组件
│   │   ├── components.css   # 交互组件
│   │   └── animations.css   # 动画
│   └── js/
│       ├── app.js           # 前端主逻辑
│       ├── charts.js        # 图表渲染
│       └── projects.js      # 项目管理
└── data/
    ├── conversations.json   # 对话数据
    └── projects.json        # 项目数据
```

**设计原则：**

- **模块化** — 解析器、分析器、存储层独立可替换
- **真实数据** — 所有图表和统计来自后端 API，无硬编码
- **置信度** — Token 估算、费用计算、模型识别均标注置信度
- **本地优先** — 数据存储在 `data/` 目录，不联网、不上传

---

## 团队

| 角色 | 成员 | 职责 |
|------|------|------|
| **项目负责人 / 全栈开发** | 李文豪 | 架构设计、核心功能开发、对话导入解析、Token 费用估算、任务分类评分及路演统筹 |
| **产品设计 / 前端展示** | 李昕莹 | 需求梳理、页面原型、监控大屏交互、PPT 视觉内容与用户场景表达 |
| **后端开发 / 数据处理** | 宋文斌 | 接口设计、本地存储、项目与对话数据管理、统计接口和数据清洗 |
| **算法与智能分析** | 郑卜玮 | 任务识别规则、上下文摘要、AI 优化建议和模型使用策略分析 |
| **测试与部署 / 文档支持** | 葛炜志 | 运行测试、Bug 反馈、本地部署、README 文档和 Demo 数据准备 |

---

## 许可证

[MIT](LICENSE)

---

<div align="center">

**CCMStatistics** — 让每一行 AI 生成的代码都有据可查。

</div>
