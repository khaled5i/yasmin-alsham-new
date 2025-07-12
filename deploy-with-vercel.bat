@echo off
chcp 65001 >nul
echo.
echo ========================================
echo    ياسمين الشام - رفع مع Vercel
echo    Yasmin Alsham - Deploy with Vercel
echo ========================================
echo.

:: التحقق من Git
git --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Git غير مثبت
    pause
    exit /b 1
)

echo ✅ Git موجود
echo.

:: عرض التغييرات
echo 📋 التغييرات الحالية:
git status --short
echo.

:: رسالة commit
set /p commit_message="📝 أدخل رسالة التحديث: "
if "%commit_message%"=="" (
    for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (
        for /f "tokens=1-2 delims=: " %%d in ('time /t') do (
            set commit_message=Update: %%c-%%a-%%b %%d:%%e
        )
    )
)

echo.
echo 🚀 بدء عملية الرفع...
echo.

:: رفع إلى GitHub
echo ➕ إضافة الملفات...
git add .

echo 💾 إنشاء commit...
git commit -m "%commit_message%"

echo 📤 رفع إلى GitHub...
for /f "tokens=*" %%i in ('git branch --show-current 2^>nul') do set current_branch=%%i
if "%current_branch%"=="" set current_branch=main

git push origin %current_branch%

if errorlevel 1 (
    echo ❌ فشل في الرفع إلى GitHub
    pause
    exit /b 1
)

echo ✅ تم الرفع إلى GitHub بنجاح!
echo.

:: انتظار قليل للتزامن
echo ⏳ انتظار التزامن مع Vercel...
timeout /t 5 >nul

:: فتح Vercel Dashboard
echo 🌐 فتح Vercel Dashboard...
start "" "https://vercel.com/dashboard"

echo.
echo ========================================
echo 🎉 تم الرفع بنجاح!
echo ========================================
echo.
echo 📝 رسالة التحديث: %commit_message%
echo 🌿 الفرع: %current_branch%
echo 🔗 GitHub: https://github.com/khaled5i/yasmin-alsham
echo 🚀 Vercel: https://vercel.com/dashboard
echo.
echo 💡 تحقق من Vercel Dashboard للتأكد من بدء النشر
echo.
pause
