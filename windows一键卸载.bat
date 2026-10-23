@echo off
setlocal
rem ============================================================
rem  Illustrator panels ZW  --  one-click uninstall (Windows)
rem  Bundle: wuliuma
rem  ASCII-only on purpose (see the install script for why).
rem ============================================================
set "DEST=%APPDATA%\Adobe\CEP\extensions\wuliuma"
set "DEST_OLD=%APPDATA%\Adobe\CEP\extensions\com.zw.illustrator.panels"

echo ============================================
echo   Illustrator Panels ZW  -  Uninstall
echo ============================================
echo.
echo Target: %DEST%
echo.
if not exist "%DEST%" echo       Nothing installed. Nothing to remove.
if exist "%DEST%" rmdir /S /Q "%DEST%"
rem 2026-10-22: also drop the pre-rename folder (com.zw.illustrator.panels), if any
if exist "%DEST_OLD%" rmdir /S /Q "%DEST_OLD%"
if exist "%DEST%" echo       FAILED - close Illustrator and run again,
if exist "%DEST%" echo                or delete the folder above manually.
if not exist "%DEST%" echo       OK - extension files removed.
echo.
echo   NOTE : CEP debug mode (PlayerDebugMode) is intentionally NOT reverted,
echo          because the other panel may still need it.
echo   NEXT : restart Adobe Illustrator
echo.
pause
exit /b 0
