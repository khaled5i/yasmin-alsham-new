@echo off
chcp 65001 >nul
echo.
echo ========================================
echo    تحويل الفرع من master إلى main
echo    Switch from master to main branch
echo ========================================
echo.

:: التحقق من Git
git --version >nul 2>&1
if errorlevel 1 (
    echo ❌ خطأ: Git غير مثبت على النظام
    echo ❌ Error: Git is not installed
    pause
    exit /b 1
)

echo ✅ تم العثور على Git
echo ✅ Git found
echo.

:: التحقق من الفرع الحالي
for /f "tokens=*" %%i in ('git branch --show-current 2^>nul') do set current_branch=%%i

echo 🔍 الفرع الحالي: %current_branch%
echo 🔍 Current branch: %current_branch%
echo.

if "%current_branch%"=="main" (
    echo ✅ أنت بالفعل على فرع main
    echo ✅ You are already on main branch
    echo.
    pause
    exit /b 0
)

if not "%current_branch%"=="master" (
    echo ⚠️  تحذير: أنت لست على فرع master
    echo ⚠️  Warning: You are not on master branch
    echo.
    set /p choice="هل تريد المتابعة؟ (y/n): "
    if /i not "%choice%"=="y" (
        echo تم الإلغاء
        echo Cancelled
        pause
        exit /b 0
    )
)

echo 🚀 بدء عملية التحويل...
echo 🚀 Starting conversion process...
echo.

:: التأكد من عدم وجود تغييرات غير محفوظة
git status --porcelain >nul 2>&1
for /f %%i in ('git status --porcelain ^| find /c /v ""') do set changes_count=%%i

if %changes_count% gtr 0 (
    echo ⚠️  تحذير: يوجد تغييرات غير محفوظة
    echo ⚠️  Warning: There are uncommitted changes
    echo.
    git status --short
    echo.
    set /p choice="هل تريد حفظ التغييرات أولاً؟ (y/n): "
    if /i "%choice%"=="y" (
        echo 💾 حفظ التغييرات...
        echo 💾 Saving changes...
        git add .
        git commit -m "Save changes before switching to main branch"
        if errorlevel 1 (
            echo ❌ فشل في حفظ التغييرات
            echo ❌ Failed to save changes
            pause
            exit /b 1
        )
        echo ✅ تم حفظ التغييرات
        echo ✅ Changes saved
    ) else (
        echo ⚠️  سيتم فقدان التغييرات غير المحفوظة
        echo ⚠️  Uncommitted changes will be lost
        set /p confirm="هل أنت متأكد؟ (y/n): "
        if /i not "%confirm%"=="y" (
            echo تم الإلغاء
            echo Cancelled
            pause
            exit /b 0
        )
    )
)

:: إنشاء فرع main من master
echo 📝 إنشاء فرع main...
echo 📝 Creating main branch...
git checkout -b main
if errorlevel 1 (
    echo ❌ فشل في إنشاء فرع main
    echo ❌ Failed to create main branch
    pause
    exit /b 1
)

echo ✅ تم إنشاء فرع main بنجاح
echo ✅ Main branch created successfully
echo.

:: رفع فرع main إلى GitHub
echo 📤 رفع فرع main إلى GitHub...
echo 📤 Pushing main branch to GitHub...
git push -u origin main
if errorlevel 1 (
    echo ❌ فشل في رفع فرع main
    echo ❌ Failed to push main branch
    echo.
    echo 💡 نصائح:
    echo 💡 Tips:
    echo    1. تأكد من اتصال الإنترنت
    echo    1. Check internet connection
    echo    2. تأكد من صلاحيات GitHub
    echo    2. Check GitHub permissions
    pause
    exit /b 1
)

echo ✅ تم رفع فرع main بنجاح
echo ✅ Main branch pushed successfully
echo.

:: تغيير الفرع الافتراضي على GitHub (تعليمات)
echo 📋 خطوات إضافية مطلوبة:
echo 📋 Additional steps required:
echo.
echo 🌐 يرجى تغيير الفرع الافتراضي على GitHub:
echo 🌐 Please change the default branch on GitHub:
echo.
echo    1. اذهب إلى: Settings → Branches
echo    1. Go to: Settings → Branches
echo    2. غير Default branch من master إلى main
echo    2. Change Default branch from master to main
echo    3. احذف فرع master القديم (اختياري)
echo    3. Delete old master branch (optional)
echo.

:: عرض الحالة النهائية
echo 📊 الحالة النهائية:
echo 📊 Final status:
echo.
git branch -a
echo.

echo ========================================
echo 🎉 تم التحويل إلى فرع main بنجاح!
echo 🎉 Successfully switched to main branch!
echo ========================================
echo.

echo ✅ الآن جميع السكريبتات ستستخدم فرع main
echo ✅ Now all scripts will use main branch
echo.

:: فتح GitHub (اختياري)
set /p open_github="🌐 هل تريد فتح GitHub لتغيير الفرع الافتراضي؟ (y/n): "
if /i "%open_github%"=="y" (
    for /f "tokens=*" %%i in ('git remote get-url origin') do (
        set repo_url=%%i
    )
    :: تحويل SSH URL إلى HTTPS إذا لزم الأمر
    echo !repo_url! | findstr "git@github.com" >nul
    if not errorlevel 1 (
        for /f "tokens=2 delims=:" %%j in ("!repo_url!") do (
            set repo_path=%%j
        )
        set repo_url=https://github.com/!repo_path:.git=!
    )
    start "" "!repo_url!/settings/branches"
)

echo.
echo شكراً لاستخدام ياسمين الشام!
echo Thank you for using Yasmin Alsham!
pause
