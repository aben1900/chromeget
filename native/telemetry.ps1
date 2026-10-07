function Invoke-DownloadRpc($port,$secret,$method,$values=@()){
    $request=[Net.HttpWebRequest]::Create('http://127.0.0.1:'+ $port +'/jsonrpc')
    $request.Proxy=$null;$request.Method='POST';$request.ContentType='application/json';$request.Timeout=1200;$request.ReadWriteTimeout=1200
    $payload=[Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -Depth 8 -Compress @{jsonrpc='2.0';id='progress';method=$method;params=@('token:'+$secret)+@($values)}))
    $request.ContentLength=$payload.Length
    $stream=$request.GetRequestStream();try{$stream.Write($payload,0,$payload.Length)}finally{$stream.Dispose()}
    $response=$request.GetResponse();try{$reader=New-Object IO.StreamReader($response.GetResponseStream());try{$data=$reader.ReadToEnd()|ConvertFrom-Json}finally{$reader.Dispose()}}finally{$response.Dispose()}
    if($data.error){throw $data.error.message};return $data.result
}
function Convert-DownloadMetrics($items){
    [long]$total=0;[long]$completed=0;[long]$speed=0;[int]$connections=0;$files=@()
    foreach($item in @($items)){
        [long]$length=$item.totalLength;[long]$done=$item.completedLength
        $total+=$length;$completed+=$done;$speed+=[long]$item.downloadSpeed;$connections+=[int]$item.connections
        if($item.status -notin @('active','paused') -and $files.Count){continue}
        if($files.Count -ge 4){continue}
        $groups=@();[int]$pieces=$item.numPieces;[long]$pieceLength=$item.pieceLength
        if($pieces -gt 0 -and $pieces -le 2000000 -and $item.bitfield -match '^[a-fA-F0-9]+$'){
            $count=[Math]::Min(32,$pieces)
            for($g=0;$g -lt $count;$g++){
                $start=[int][Math]::Floor($g*$pieces/[double]$count);$end=[int][Math]::Floor(($g+1)*$pieces/[double]$count);[long]$ready=0;[long]$bytes=0
                for($p=$start;$p -lt $end;$p++){
                    $part=[Math]::Min($pieceLength,$length-([long]$p*$pieceLength));$bytes+=$part
                    $n=[int][Math]::Floor($p/4.0)
                    if($n -lt $item.bitfield.Length -and ([Convert]::ToInt32([string]$item.bitfield[$n],16) -band (8 -shr ($p%4)))){$ready+=$part}
                }
                $groups+=@{start=([long]$start*$pieceLength);end=([Math]::Min($length,[long]$end*$pieceLength));percent=$(if($bytes -gt 0){[Math]::Round(100*$ready/[double]$bytes,1)}else{0})}
            }
        }
        $fileName=if(@($item.files).Count){[IO.Path]::GetFileName([string]$item.files[0].path)}else{'下载文件'}
        $files+=@{name=$fileName;total=$length;completed=$done;groups=$groups;status=$item.status}
    }
    return @{updatedAt=(Get-Date).ToUniversalTime().ToString('o');total=$total;completed=$completed;speed=$speed;connections=$connections;files=$files;source='aria2-rpc'}
}
function Update-DownloadMetrics($port,$secret,$base){
    $keys=@('gid','status','totalLength','completedLength','downloadSpeed','connections','bitfield','numPieces','pieceLength','files')
    $active=@(Invoke-DownloadRpc $port $secret 'aria2.tellActive' @(,$keys))
    $waiting=@(Invoke-DownloadRpc $port $secret 'aria2.tellWaiting' @(0,1000,$keys))
    $stopped=@(Invoke-DownloadRpc $port $secret 'aria2.tellStopped' @(0,1000,$keys))
    Write-VideoJson ($base+'.metrics.json') (Convert-DownloadMetrics @($active+$waiting+$stopped))
    return @{finished=($active.Count -eq 0 -and $waiting.Count -eq 0 -and $stopped.Count -gt 0);failed=(@($stopped|Where-Object{$_.status -eq 'error'}).Count -gt 0)}
}
