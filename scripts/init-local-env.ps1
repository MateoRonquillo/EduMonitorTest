param()
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$destination = Join-Path $root 'infra/.env'
if (Test-Path -LiteralPath $destination) {
    Write-Host 'infra/.env ya existe; se conserva su configuración.'
    return
}
function New-LocalSecret {
    'Edu1!' + [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
}
$lines = @('# Credenciales locales generadas; no compartir ni versionar.')
foreach ($key in 'MYSQL_ROOT_PASSWORD','MYSQL_PASSWORD','MOODLE_DB_PASSWORD','MOODLE_ADMIN_PASSWORD','MOODLE_LAB_PASSWORD') {
    $lines += "$key=$(New-LocalSecret)"
}
[System.IO.File]::WriteAllLines($destination, $lines)
Write-Host 'Creado infra/.env con contraseñas locales. Los valores no se muestran en la terminal.'
