@echo off
chcp 65001 > nul
title Coding Masters 100 Team Server
echo ===================================================
echo [Coding Masters 100] 팀 스터디 서버를 시작합니다...
echo ===================================================
cd /d "%~dp0"
python server.py
pause
