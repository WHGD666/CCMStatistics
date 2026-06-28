@echo off
echo ========================================
echo   CCMStatistics - Claude Code 监控平台
echo ========================================
echo.

REM 检查 Node.js 是否安装
node -v >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js
    echo 请先安装 Node.js：https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [1/3] 检查 Node.js 版本...
node -v
echo.

REM 检查是否已安装依赖
if not exist "node_modules" (
    echo [2/3] 首次运行，正在安装依赖...
    call npm install
    echo.
) else (
    echo [2/3] 依赖已安装，跳过...
    echo.
)

echo [3/3] 启动服务...
echo.
echo ========================================
echo   访问地址：http://localhost:3000
echo   按 Ctrl+C 停止服务
echo ========================================
echo.

call npm start
