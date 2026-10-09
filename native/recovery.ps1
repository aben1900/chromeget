function New-RecoveryError {
    param([string]$Message,[string]$Code,[bool]$Retryable=$false)
    if(-not $Code){
        $Code=switch -Regex ($Message){
            '空间不足|not enough (disk|space)|no space left|requires free space' {'DISK_FULL';break}
            'SHA.?256.*(mismatch|失败|不匹配)|校验.*(失败|不匹配)' {'CHECKSUM_MISMATCH';break}
            'certificate.*(invalid|verify|failed)|证书.*(失败|错误)' {'TLS_INVALID';break}
            'access.*denied|拒绝访问|目录.*(不存在|无权限|不可写)' {'DIRECTORY_UNAVAILABLE';break}
            'connection (reset|timed out)|连接重置|网络.*中断' {'NETWORK_TEMPORARY';break}
            'sign in.*(required|confirm)|login required|需要登录' {'AUTH_REQUIRED';break}
            'link.*expired|链接.*(失效|过期)' {'LINK_EXPIRED';break}
            '\bDRM\b' {'DRM';break}
            'unsupported url' {'UNSUPPORTED';break}
            default {'UNKNOWN'}
        }
    }
    return @{ok=$false;error=$Message;code=$Code;retryable=($Code -in @('DISK_FULL','DIRECTORY_UNAVAILABLE','NETWORK_TEMPORARY'));details=$Message}
}
