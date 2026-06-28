#!/bin/bash

echo "========================================"
echo "  CCMStatistics - Claude Code 监控平台"
echo "========================================"
echo ""

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "[错误] 未检测到 Node.js"
    echo "请先安装 Node.js：https://nodejs.org/"
    echo ""
    exit 1
fi

echo "[1/3] 检查 Node.js 版本..."
node -v
echo ""

# 检查是否已安装依赖
if [ ! -d "node_modules" ]; then
    echo "[2/3] 首次运行，正在安装依赖..."
    npm install
    echo ""
else
    echo "[2/3] 依赖已安装，跳过..."
    echo ""
fi

echo "[3/3] 启动服务..."
echo ""
echo "========================================"
echo "  访问地址：http://localhost:3000"
echo "  按 Ctrl+C 停止服务"
echo "========================================"
echo ""

npm start
