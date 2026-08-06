@echo off
cd /d "%~dp0"
echo Iniciando TripleLinea en modo local...
start "Servidor TripleLinea" py -m http.server 8000
timeout /t 2 /nobreak >nul
start "" "http://localhost:8000/index.html"
echo.
echo La web se abrio en el navegador.
echo Panel administrador: http://localhost:8000/admin.html
echo Pagina principal:    http://localhost:8000/index.html
echo.
echo No cierres la ventana llamada Servidor TripleLinea mientras pruebas la web.
pause
