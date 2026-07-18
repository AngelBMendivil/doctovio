# ===========================================================================
# Arranque local del MVP de pacientes en Windows (PowerShell).
# Requisitos previos: Node.js 20+, Docker Desktop corriendo.
# Uso:  Abre PowerShell en la carpeta del proyecto y ejecuta:
#         ./setup-local.ps1
# ===========================================================================
$ErrorActionPreference = "Stop"

Write-Host "==> 1/5 Verificando requisitos..." -ForegroundColor Cyan
node -v
docker --version

if (-not (Test-Path ".env")) {
    Write-Host "No existe .env. Copiando desde .env.example (revisa los valores)." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
}

Write-Host "==> 2/5 Levantando PostgreSQL con Docker..." -ForegroundColor Cyan
docker compose up -d
Write-Host "Esperando a que la base este lista..."
Start-Sleep -Seconds 6

Write-Host "==> 3/5 Instalando dependencias (npm install)..." -ForegroundColor Cyan
npm install

Write-Host "==> 4/5 Migraciones y datos de ejemplo..." -ForegroundColor Cyan
npm run prisma:migrate
npm run db:seed

Write-Host "==> 5/5 Iniciando la app (npm run dev)..." -ForegroundColor Cyan
Write-Host "Abre http://localhost:3000  ->  admin@demo.com / Demo1234!" -ForegroundColor Green
npm run dev
