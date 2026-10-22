@echo off
rem Zamanli e-posta gonderimi (Windows Gorev Zamanlayici "EOT\eposta-gonder", hafta ici 11:00).
rem Once liste yenilenir (hibrit kayitlari girsin), sonra gunluk sinirla gonderilir.
rem Kayit: veri\eposta-zamanli.log. Durdurmak: schtasks /change /tn "EOT\eposta-gonder" /disable
cd /d "%~dp0"
set "NODE=node"
where node >nul 2>&1 || set "NODE=%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.22_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v22.23.2-win-x64\node.exe"
echo ===== %date% %time% >> veri\eposta-zamanli.log
rem Staj basvuru gonderimi (Desktop\staj-basvuru\send.js) suruyorsa bitmesini bekle: en cok 4 saat
set /a BEKLEME=0
:bekle
powershell -NoProfile -Command "if (Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*send.js*' }) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  if %BEKLEME% GEQ 48 goto devam
  if %BEKLEME%==0 echo Staj gonderimi suruyor, bitmesi bekleniyor >> veri\eposta-zamanli.log
  set /a BEKLEME+=1
  timeout /t 300 /nobreak >nul
  goto bekle
)
:devam
echo Basladi %time% >> veri\eposta-zamanli.log
"%NODE%" src\ssl-dogrula.mjs >> veri\eposta-zamanli.log 2>&1
"%NODE%" --env-file-if-exists=.env.local src\aday-mesaj.mjs >> veri\eposta-zamanli.log 2>&1
"%NODE%" --env-file-if-exists=.env.local src\eposta-gonder.mjs --gonder >> veri\eposta-zamanli.log 2>&1
