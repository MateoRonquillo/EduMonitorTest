param(
 [Parameter(Mandatory)][SecureString]$LabPassword,
 [SecureString]$TeacherPassword = (ConvertTo-SecureString 'Docente123!' -AsPlainText -Force),
 [SecureString]$StudentPassword = (ConvertTo-SecureString 'Estudiante123!' -AsPlainText -Force)
)
$ErrorActionPreference = 'Stop'
$PSDefaultParameterValues = @{ 'Invoke-RestMethod:TimeoutSec'=120; 'Invoke-WebRequest:TimeoutSec'=120 }
$plain = [System.Net.NetworkCredential]::new('', $LabPassword).Password
function Assert-True($Condition, $Message) { if (-not $Condition) { throw $Message } }
function Token($User) {
 $accountPassword = switch ($User) {
  'docente@example.invalid' { [System.Net.NetworkCredential]::new('', $TeacherPassword).Password }
  'estudiante01@example.invalid' { [System.Net.NetworkCredential]::new('', $StudentPassword).Password }
  default { $plain }
 }
 $result = Invoke-RestMethod -Method Post -Uri 'http://localhost:8080/login/token.php' -Body @{username=$User;password=$accountPassword;service='edumonitor'}
 Assert-True ($null -ne $result.token) "No se pudo autenticar $User"
 return @{Authorization="Bearer $($result.token)"}
}
function Denied($Uri, $Headers, $Status) {
 $response = Invoke-WebRequest -Uri $Uri -Headers $Headers -SkipHttpErrorCheck
 Assert-True ($response.StatusCode -eq $Status) "Se esperaba HTTP $Status en $Uri"
}
Assert-True ((Invoke-WebRequest 'http://localhost:8080/health.php').Content.Trim() -eq 'Healthy') 'Moodle no está preparado'
foreach ($port in 5101,5102,5103) {
 Assert-True ((Invoke-WebRequest "http://localhost:$port/health").Content -eq 'Healthy') "Health $port"
}
$teacher = Token 'docente@example.invalid'
$student = Token 'estudiante01@example.invalid'
$other = Token 'otrodocente'
$access = Invoke-RestMethod http://localhost:5103/api/access/me -Headers $teacher
Assert-True ($access.courses.Count -eq 2) 'El docente debe tener dos cursos'
$restricted = (Invoke-RestMethod http://localhost:5103/api/access/me -Headers $other).courses[0].id
Denied "http://localhost:5101/api/courses/$restricted/snapshot" $teacher 403
Denied 'http://localhost:5103/api/access/me' $student 403
Denied 'http://localhost:5101/api/courses' @{} 401
foreach ($course in $access.courses) {
 $id = $course.id
 $source = Invoke-RestMethod "http://localhost:5101/api/courses/$id/snapshot" -Headers $teacher
 Assert-True ($source.students.Count -eq 12) 'Se esperan doce estudiantes'
 Assert-True ($source.grades.Count -gt 0) 'Se esperan notas de Moodle'
 1..2 | ForEach-Object { Invoke-RestMethod -Method Post "http://localhost:5102/api/courses/$id/sync" -Headers $teacher | Out-Null }
 $stored = Invoke-RestMethod "http://localhost:5102/api/courses/$id/data" -Headers $teacher
 Assert-True ($stored.students.Count -eq $source.students.Count) 'Matrícula diferente'
 Assert-True ($stored.grades.Count -eq $source.grades.Count) 'Duplicados o notas ausentes'
 $expected = $source.grades | Sort-Object studentId,itemId | ConvertTo-Json -Depth 10 -Compress
 $actual = $stored.grades | Sort-Object studentId,itemId | ConvertTo-Json -Depth 10 -Compress
 Assert-True ($expected -ceq $actual) 'Valores o escalas diferentes de Moodle'
 Assert-True (($stored.grades | Where-Object { $null -ne $_.value -and $_.value -eq 0 }).Count -gt 0) 'Se perdió la nota cero'
 Assert-True (($stored.grades | Where-Object { $null -eq $_.value -and $_.state -eq 'unknown' }).Count -gt 0) 'Se perdió el estado desconocido'
 Denied "http://localhost:5102/api/courses/$id/data" $student 403
}
$plain = $null
Write-Host 'HU-01..05: comprobaciones HTTP completadas. Verificar también libro de notas y pesos en Moodle.'
