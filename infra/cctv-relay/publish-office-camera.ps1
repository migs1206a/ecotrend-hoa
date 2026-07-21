param(
  [string]$SourceRtspUrl = $env:SOURCE_RTSP_URL,
  [string]$RelayHost = $env:RELAY_HOST,
  [string]$RelayStreamPath = $env:RELAY_STREAM_PATH,
  [string]$RelayPublishUser = $env:RELAY_PUBLISH_USER,
  [string]$RelayPublishPass = $env:RELAY_PUBLISH_PASS
)

if (-not $SourceRtspUrl) {
  throw "SOURCE_RTSP_URL is required."
}

if (-not $RelayHost) {
  throw "RELAY_HOST is required."
}

if (-not $RelayStreamPath) {
  throw "RELAY_STREAM_PATH is required."
}

if (-not $RelayPublishUser) {
  throw "RELAY_PUBLISH_USER is required."
}

if (-not $RelayPublishPass) {
  throw "RELAY_PUBLISH_PASS is required."
}

$encodedUser = [System.Uri]::EscapeDataString($RelayPublishUser)
$encodedPass = [System.Uri]::EscapeDataString($RelayPublishPass)
$publishUrl = "rtsp://$encodedUser`:$encodedPass@$RelayHost`:8554/$RelayStreamPath"

Write-Host "Publishing office CCTV to $publishUrl" -ForegroundColor Cyan

while ($true) {
  & ffmpeg `
    -rtsp_transport tcp `
    -i $SourceRtspUrl `
    -an `
    -c:v copy `
    -f rtsp `
    -rtsp_transport tcp `
    $publishUrl

  Write-Warning "FFmpeg exited. Restarting in 5 seconds..."
  Start-Sleep -Seconds 5
}
