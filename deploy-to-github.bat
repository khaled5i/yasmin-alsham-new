@echo off
chcp 65001 >nul
echo.
echo ========================================
echo    ياسمين الشام - رفع التحديثات إلى GitHub
echo    Yasmin Alsham - Deploy to GitHub
echo ========================================
echo.

:: التحقق من وجود Git
git --version >nul 2>&1
if errorlevel 1 (
    echo ❌ خطأ: Git غير مثبت على النظام
    echo ❌ Error: Git is not installed
    echo.
    echo يرجى تثبيت Git من: https://git-scm.com/
    echo Please install Git from: https://git-scm.com/
    pause
    exit /b 1
)

echo ✅ تم العثور على Git
echo ✅ Git found
echo.

:: التحقق من حالة Git
echo 🔍 فحص حالة المشروع...
echo 🔍 Checking project status...
git status --porcelain >nul 2>&1
if errorlevel 1 (
    echo ❌ خطأ: هذا المجلد ليس مشروع Git
    echo ❌ Error: This folder is not a Git repository
    echo.
    echo يرجى تشغيل الأمر التالي أولاً:
    echo Please run this command first:
    echo git init
    pause
    exit /b 1
)

:: عرض حالة الملفات
echo.
echo 📋 حالة الملفات الحالية:
echo 📋 Current file status:
echo.
git status --short

:: التحقق من وجود تغييرات
git diff-index --quiet HEAD -- 2>nul
if %errorlevel% equ 0 (
    echo.
    echo ℹ️  لا توجد تغييرات للرفع
    echo ℹ️  No changes to commit
    echo.
    set /p choice="هل تريد المتابعة؟ (y/n): "
    if /i not "%choice%"=="y" (
        echo تم الإلغاء
        echo Cancelled
        pause
        exit /b 0
    )
)

:: طلب رسالة الـ commit
echo.
set /p commit_message="📝 أدخل رسالة التحديث (أو اضغط Enter للرسالة الافتراضية): "
if "%commit_message%"=="" (
    for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (
        for /f "tokens=1-2 delims=: " %%d in ('time /t') do (
            set commit_message=Update: %%c-%%a-%%b %%d:%%e
        )
    )
)

echo.
echo 🚀 بدء عملية الرفع...
echo 🚀 Starting deployment...
echo.

:: إضافة جميع الملفات
echo ➕ إضافة الملفات...
echo ➕ Adding files...
git add .
if errorlevel 1 (
    echo ❌ خطأ في إضافة الملفات
    echo ❌ Error adding files
    pause
    exit /b 1
)
echo ✅ تم إضافة الملفات بنجاح
echo ✅ Files added successfully

:: إنشاء commit
echo.
echo 💾 إنشاء commit...
echo 💾 Creating commit...
git commit -m "%commit_message%"
if errorlevel 1 (
    echo ❌ خطأ في إنشاء commit
    echo ❌ Error creating commit
    pause
    exit /b 1
)
echo ✅ تم إنشاء commit بنجاح
echo ✅ Commit created successfully

:: التحقق من وجود remote origin
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo.
    echo ⚠️  تحذير: لا يوجد remote origin مُعرف
    echo ⚠️  Warning: No remote origin configured
    echo.
    set /p repo_url="🔗 أدخل رابط المستودع (مثال: https://github.com/username/repo.git): "
    if "!repo_url!"=="" (
        echo ❌ لم يتم إدخال رابط المستودع
        echo ❌ Repository URL not provided
        pause
        exit /b 1
    )
    
    echo ➕ إضافة remote origin...
    echo ➕ Adding remote origin...
    git remote add origin "!repo_url!"
    if errorlevel 1 (
        echo ❌ خطأ في إضافة remote origin
        echo ❌ Error adding remote origin
        pause
        exit /b 1
    )
    echo ✅ تم إضافة remote origin بنجاح
    echo ✅ Remote origin added successfully
)

:: رفع التحديثات
echo.
echo 📤 رفع التحديثات إلى GitHub...
echo 📤 Pushing updates to GitHub...

:: تحديد اسم الفرع
for /f "tokens=*" %%i in ('git branch --show-current 2^>nul') do set current_branch=%%i
if "%current_branch%"=="" set current_branch=main

echo 🌿 الفرع الحالي: %current_branch%
echo 🌿 Current branch: %current_branch%

git push -u origin %current_branch%
if errorlevel 1 (
    echo.
    echo ❌ خطأ في رفع التحديثات
    echo ❌ Error pushing updates
    echo.
    echo 💡 نصائح لحل المشكلة:
    echo 💡 Troubleshooting tips:
    echo    1. تأكد من صحة بيانات تسجيل الدخول
    echo    1. Check your login credentials
    echo    2. تأكد من وجود صلاحيات الكتابة في المستودع
    echo    2. Ensure you have write permissions
    echo    3. تأكد من اتصال الإنترنت
    echo    3. Check your internet connection
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo 🎉 تم رفع التحديثات بنجاح!
echo 🎉 Updates deployed successfully!
echo ========================================
echo.
echo 📊 تفاصيل العملية:
echo 📊 Operation details:
echo    📝 رسالة التحديث: %commit_message%
echo    📝 Commit message: %commit_message%
echo    🌿 الفرع: %current_branch%
echo    🌿 Branch: %current_branch%
echo    🔗 المستودع: 
git remote get-url origin
echo.

:: عرض آخر commits
echo 📋 آخر التحديثات:
echo 📋 Recent commits:
git log --oneline -5

echo.
echo ✅ العملية مكتملة! يمكنك الآن مراجعة التحديثات على GitHub
echo ✅ Operation complete! You can now review the updates on GitHub
echo.

:: فتح GitHub (اختياري)
set /p open_github="🌐 هل تريد فتح GitHub في المتصفح؟ (y/n): "
if /i "%open_github%"=="y" (
    for /f "tokens=*" %%i in ('git remote get-url origin') do (
        set repo_url=%%i
    )
    start "" "!repo_url!"
)

echo.
echo شكراً لاستخدام ياسمين الشام!
echo Thank you for using Yasmin Alsham!
pause
