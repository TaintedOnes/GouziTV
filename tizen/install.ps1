# 打包并安装 GouziTV 到三星电视
# 用法: .\tizen\install.ps1 -TvIp 192.168.1.50 [-Profile GouziTV]
param(
  [Parameter(Mandatory = $true)][string]$TvIp,
  [string]$Profile = 'GouziTV',
  [string]$TizenHome = 'C:\tizen-studio'
)
$ErrorActionPreference = 'Stop'
$tizen = Join-Path $TizenHome 'tools\ide\bin\tizen.bat'
$sdb = Join-Path $TizenHome 'tools\sdb.exe'
if (-not (Test-Path $tizen)) { throw "找不到 Tizen Studio：$tizen（用 -TizenHome 指定安装目录）" }

$app = Join-Path $PSScriptRoot 'app'
$out = Join-Path $PSScriptRoot 'out'
New-Item -ItemType Directory -Force $out | Out-Null

Write-Host "连接电视 $TvIp ..."
& $sdb connect $TvIp
$device = & $sdb devices | Select-String ([regex]::Escape($TvIp)) | Select-Object -First 1
if (-not $device -or $device.Line -notmatch '\sdevice\s') {
  throw "连接电视失败：$TvIp。请确认电视已开启开发者模式且填写了本机 IP；可尝试 `"$sdb kill-server`" 后重试。"
}
$serial = ($device.Line.Trim() -split '\s+')[2]
if (-not $serial) { $serial = ($device.Line.Trim() -split '\s+')[0] }

$profiles = & $tizen security-profiles list | Out-String
if ($profiles -notmatch "(?m)^\s*$([regex]::Escape($Profile))\s") {
  throw "找不到证书配置「$Profile」。请先在 Certificate Manager 中创建，或用 -Profile 指定。现有配置：`n$profiles"
}

Write-Host "打包（证书配置：$Profile）..."
Get-ChildItem $out -Filter *.wgt | Remove-Item -Force
$pkgLog = & $tizen package -t wgt -s $Profile -o $out -- $app | Out-String
Write-Host $pkgLog
$wgt = Get-ChildItem $out -Filter *.wgt | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($LASTEXITCODE -ne 0 -or -not $wgt) { throw "打包失败（证书配置：$Profile），请查看上面的输出。" }

Write-Host "安装 $($wgt.Name) ..."
$installLog = & $tizen install -n $wgt.Name -t $serial -- $out | Out-String
Write-Host $installLog
if ($LASTEXITCODE -ne 0 -or $installLog -notmatch 'successfully installed') {
  throw "安装失败，请查看上面的输出。"
}
Write-Host "完成！在电视「应用」里打开 GouziTV。"
