$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:8080/')
$listener.Start()
Write-Host 'SERVEUR GESTIO 229 EN LIGNE SUR http://localhost:8080/index.html'
$root = (Get-Location).Path
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  $p = $req.Url.LocalPath
  if ($p -eq '/' -or [string]::IsNullOrEmpty($p)) { $p = '/index.html' }
  $f = Join-Path $root $p.TrimStart('/').Replace('/', '\')
  if (Test-Path $f -PathType Leaf) {
    $b = [System.IO.File]::ReadAllBytes($f)
    if ($f.EndsWith('.html')) { $res.ContentType = 'text/html; charset=utf-8' }
    elseif ($f.EndsWith('.js')) { $res.ContentType = 'application/javascript; charset=utf-8' }
    elseif ($f.EndsWith('.css')) { $res.ContentType = 'text/css; charset=utf-8' }
    elseif ($f.EndsWith('.json')) { $res.ContentType = 'application/json; charset=utf-8' }
    $res.ContentLength64 = $b.Length
    $res.OutputStream.Write($b, 0, $b.Length)
  } else {
    $res.StatusCode = 404
  }
  $res.OutputStream.Close()
}