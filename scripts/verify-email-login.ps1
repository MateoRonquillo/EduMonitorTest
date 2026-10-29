param(
 [SecureString]$TeacherPassword = (ConvertTo-SecureString 'Docente123!' -AsPlainText -Force),
 [SecureString]$StudentPassword = (ConvertTo-SecureString 'Estudiante123!' -AsPlainText -Force)
)
$ErrorActionPreference = 'Stop'
function Test-WebLogin([string]$Email, [SecureString]$Password, [bool]$Expected) {
    $page = Invoke-WebRequest 'http://localhost:8080/login/index.php' -SessionVariable loginSession -TimeoutSec 60
    $token = [regex]::Match($page.Content, 'name="logintoken" value="([^"]+)"').Groups[1].Value
    if (-not $token) { throw 'No se encontró el token del formulario Moodle.' }
    $plain = [System.Net.NetworkCredential]::new('', $Password).Password
    $result = Invoke-WebRequest 'http://localhost:8080/login/index.php' -Method Post -WebSession $loginSession -TimeoutSec 60 -Body @{
        username=$Email; password=$plain; logintoken=$token; testcookies=1
    }
    $loggedIn = $result.Content -match '/login/logout\.php\?'
    if ($loggedIn -ne $Expected) { throw "Resultado inesperado al autenticar $Email" }
    Write-Host "Formulario web: $Email — resultado correcto (acceso=$Expected)."
}
Test-WebLogin 'docente@example.invalid' $TeacherPassword $true
Test-WebLogin 'estudiante01@example.invalid' $StudentPassword $true
Test-WebLogin 'docente@example.invalid' (ConvertTo-SecureString 'Incorrecta123!' -AsPlainText -Force) $false

