@echo off
echo 正在启动后端服务...
@REM sqlite
@REM start cmd /k "cd /d %~dp0\bin\memos && go run main.go --mode dev --port 8081  --driver sqlite --dsn memos.db"
@REM MySql
start cmd /k "cd /d %~dp0\bin\memos && go run main.go --mode dev --port 8081  --driver mysql --dsn deepnote:Deepnote123@tcp(rm-bp15e0zk2w76cjjahno.mysql.rds.aliyuncs.com:3306)/deepnote"
echo 正在启动前端服务...
start cmd /k "cd /d %~dp0\web && pnpm dev"

echo 后端和前端服务已启动
echo 后端服务运行在: http://localhost:8081
echo 前端服务运行在: http://localhost:3001
pause
