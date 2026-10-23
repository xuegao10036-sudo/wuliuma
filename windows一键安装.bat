@echo off
setlocal
rem ============================================================
rem  Illustrator panels ZW  --  one-click install (Windows)
rem  Bundle: wuliuma
rem  Panel : "barcode + organize images" (one panel, two tabs)
rem  Kept ASCII-only on purpose: Chinese text inside a .bat breaks
rem  on machines whose console codepage is not 936.
rem ============================================================
set "DEST=%APPDATA%\Adobe\CEP\extensions\wuliuma"
set "FAIL="

echo ============================================
echo   Illustrator Panels ZW  -  Install
echo ============================================
echo.
echo [1/3] Copy files
echo       from : %~dp0
echo       to   : %DEST%
echo.
if not exist "%DEST%" mkdir "%DEST%"
rem 2026-10-22: deployment folder renamed com.zw.illustrator.panels -> wuliuma.
rem Remove the old copy, otherwise Illustrator lists the panel twice.
if exist "%APPDATA%\Adobe\CEP\extensions\com.zw.illustrator.panels" rmdir /S /Q "%APPDATA%\Adobe\CEP\extensions\com.zw.illustrator.panels"
rem clear old sub-files first so renamed/removed files cannot survive an update
rem (v3.0 got a new install script; from now on this folder is always rebuilt clean)
if exist "%DEST%\CSXS"   rmdir /S /Q "%DEST%\CSXS"
if exist "%DEST%\css"    rmdir /S /Q "%DEST%\css"
if exist "%DEST%\js"     rmdir /S /Q "%DEST%\js"
if exist "%DEST%\jsx"    rmdir /S /Q "%DEST%\jsx"
if exist "%DEST%\panels" rmdir /S /Q "%DEST%\panels"
rem NOTE: tests\ is dev-only and must NOT be shipped into the extension folder
xcopy "%~dp0CSXS"   "%DEST%\CSXS"   /E /I /Y /Q >nul || set "FAIL=1"
xcopy "%~dp0css"    "%DEST%\css"    /E /I /Y /Q >nul || set "FAIL=1"
xcopy "%~dp0js"     "%DEST%\js"     /E /I /Y /Q >nul || set "FAIL=1"
xcopy "%~dp0jsx"    "%DEST%\jsx"    /E /I /Y /Q >nul || set "FAIL=1"
xcopy "%~dp0panels" "%DEST%\panels" /E /I /Y /Q >nul || set "FAIL=1"
rem each xcopy checks its own errorlevel - a trailing check only reflects the last copy
if not exist "%DEST%\CSXS\manifest.xml"                 set "FAIL=1"
if not exist "%DEST%\css\panel.css"                     set "FAIL=1"
if not exist "%DEST%\js\CSInterface.js"                 set "FAIL=1"
if not exist "%DEST%\js\runner.js"                      set "FAIL=1"
if not exist "%DEST%\jsx\barcode_generator_panel.jsx"   set "FAIL=1"
if not exist "%DEST%\jsx\organize_images.jsx"           set "FAIL=1"
if not exist "%DEST%\panels\panel.html"                 set "FAIL=1"
if defined FAIL echo       FAILED - see TROUBLESHOOTING below.
if not defined FAIL echo       OK - 7 files copied.

echo.
echo [2/3] Enable CEP debug mode (required for unsigned extensions)
set "REGFAIL="
rem errorlevel check inside the loop - a check after the loop only sees the last reg add
for /l %%V in (9,1,16) do (
  reg add "HKCU\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1 || set "REGFAIL=1"
)
if defined REGFAIL echo       WARN - could not write PlayerDebugMode.
if defined REGFAIL echo              FIX: run as administrator, or add it in regedit by hand.
if not defined REGFAIL echo       OK - PlayerDebugMode set to 1 for CSXS 9 to 16.

echo.
echo [3/3] Done.
echo.
echo   NEXT : restart Adobe Illustrator
echo          Menu: Window -^> Extensions -^> the barcode panel
echo.

if not defined FAIL echo All done. You can close this window.
if not defined FAIL if defined REGFAIL echo NOTE: files copied, but the registry switch FAILED - see [2/3] above.
if defined FAIL echo ------------------------------------------------------------
if defined FAIL echo   TROUBLESHOOTING
if defined FAIL echo   1. Extract the ZIP first, then run this file from the
if defined FAIL echo      extracted folder. Do NOT run it from inside the ZIP.
if defined FAIL echo   2. Avoid Chinese characters or spaces in the folder path.
if defined FAIL echo      Example: put the folder in D:\ailight first.
if defined FAIL echo   3. If this file is blocked: right-click it, Properties,
if defined FAIL echo      tick "Unblock" at the bottom, OK, then run again.
if defined FAIL echo   4. Last resort: right-click, "Run as administrator".
if defined FAIL echo ------------------------------------------------------------
rem pure built-in wait: powershell may be blocked by policy on some machines
if defined FAIL echo Press any key to close this window...
if defined FAIL pause >nul
if defined FAIL exit /b 1
exit /b 0
