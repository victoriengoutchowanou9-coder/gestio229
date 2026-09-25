param([int]$Port = 3000)

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
$listener.Start()
Write-Host "SERVEUR GESTIO 229 ACTIF ET ROBUSTE SUR PORT $Port (http://localhost:$Port ou http://127.0.0.1:$Port)"

$root = $PSScriptRoot
if ([string]::IsNullOrEmpty($root)) { $root = (Get-Location).Path }

while ($true) {
    try {
        $client = $listener.AcceptTcpClient()
        [System.Threading.Tasks.Task]::Run({
            param($client, $root)
            try {
                $stream = $client.GetStream()
                $stream.ReadTimeout = 5000
                $stream.WriteTimeout = 5000

                $buf = New-Object byte[] 8192
                $read = $stream.Read($buf, 0, $buf.Length)
                if ($read -gt 0) {
                    $req = [System.Text.Encoding]::UTF8.GetString($buf, 0, $read)
                    $firstLine = $req.Split("`n")[0].Trim()
                    $parts = $firstLine.Split(" ")
                    $path = "/"
                    if ($parts.Length -gt 1) { $path = $parts[1].Split("?")[0] }
                    if ($path -eq "/" -or [string]::IsNullOrEmpty($path)) { $path = "/index.html" }

                    $file = Join-Path $root $path.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
                    if (-not (Test-Path $file -PathType Leaf)) {
                        $file = Join-Path $root "index.html"
                    }

                    if (Test-Path $file -PathType Leaf) {
                        $bytes = [System.IO.File]::ReadAllBytes($file)
                        $ct = "text/html; charset=utf-8"
                        if ($file.EndsWith(".js")) { $ct = "application/javascript; charset=utf-8" }
                        elseif ($file.EndsWith(".css")) { $ct = "text/css; charset=utf-8" }
                        elseif ($file.EndsWith(".json")) { $ct = "application/json; charset=utf-8" }
                        elseif ($file.EndsWith(".png")) { $ct = "image/png" }
                        elseif ($file.EndsWith(".jpg") -or $file.EndsWith(".jpeg")) { $ct = "image/jpeg" }
                        elseif ($file.EndsWith(".svg")) { $ct = "image/svg+xml" }
                        elseif ($file.EndsWith(".ico")) { $ct = "image/x-icon" }

                        $headerStr = "HTTP/1.1 200 OK`r`nContent-Type: $ct`r`nContent-Length: $($bytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
                        $hb = [System.Text.Encoding]::UTF8.GetBytes($headerStr)
                        $stream.Write($hb, 0, $hb.Length)
                        $stream.Write($bytes, 0, $bytes.Length)
                    } else {
                        $nf = "HTTP/1.1 404 Not Found`r`nContent-Length: 0`r`nConnection: close`r`n`r`n"
                        $nfb = [System.Text.Encoding]::UTF8.GetBytes($nf)
                        $stream.Write($nfb, 0, $nfb.Length)
                    }
                    $stream.Flush()
                }
            } catch {
                # Ignorer les déconnexions brutales du navigateur client sans impacter le serveur
            } finally {
                try { $client.Close() } catch {}
            }
        }.GetNewClosure(), $client, $root)
    } catch {
        # Continuer d'écouter même si une exception survient
        Start-Sleep -Milliseconds 100
    }
}