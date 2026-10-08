(function(root){
  const messages={HOST_UNAVAILABLE:'尚未连接本地程序',HOST_OUTDATED:'本地程序需要更新',ENGINE_MISSING:'下载引擎尚未准备好',AUTH_REQUIRED:'此内容需要登录后访问',LINK_EXPIRED:'下载链接已过期',DISK_FULL:'保存磁盘空间不足',DIRECTORY_UNAVAILABLE:'保存目录不可用',NETWORK_TEMPORARY:'网络连接暂时中断',TLS_INVALID:'网站证书验证未通过',CHECKSUM_MISMATCH:'文件完整性校验未通过',UNSUPPORTED:'暂不支持此内容',DRM:'此内容受 DRM 保护，无法下载',SUBMISSION_UNKNOWN:'提交结果尚未确认',UNKNOWN:'操作未完成'};
  const rules=[['HOST_UNAVAILABLE',/native messaging host|host has exited|本地.{0,6}(未连接|未响应|没有返回)/i],['HOST_OUTDATED',/请更新本地程序|版本(过旧|不匹配)|更新.*修复|不支持操作/i],['ENGINE_MISSING',/引擎.*(缺失|不存在|未安装)|cannot find.*(yt-dlp|aria2|ffmpeg)/i],['DRM',/\bDRM\b/i],['TLS_INVALID',/certificate.*(invalid|verify|failed)|证书.*(失败|错误|未通过)/i],['CHECKSUM_MISMATCH',/SHA.?256.*(mismatch|失败|不匹配)|校验.*(失败|不匹配)/i],['DISK_FULL',/空间不足|not enough (disk|space)|no space left|requires free space/i],['DIRECTORY_UNAVAILABLE',/access.*denied|拒绝访问|目录.*(不存在|无权限|不可写|不可用)/i],['AUTH_REQUIRED',/sign in.*(required|confirm)|login required|需要登录|请先登录/i],['LINK_EXPIRED',/link.*expired|链接.*(失效|过期)|signature.*expired/i],['NETWORK_TEMPORARY',/connection (reset|timed out)|连接重置|网络.*中断|TLS.*握手|timed out/i],['SUBMISSION_UNKNOWN',/等待本地程序超时|提交.*超时/i],['UNSUPPORTED',/unsupported url|不支持.*(网址|网站|资源)/i]];
  function redact(value){return String(value||'').replace(/(?:cookie|authorization|proxy-authorization)\s*[:=][^\r\n]*/gi,'[凭据已隐藏]').replace(/https?:\/\/[^\s<>"']+/gi,value=>{try{const u=new URL(value);return u.origin+u.pathname.replace(/[^/]{100,}/g,'[已隐藏]');}catch{return '[网址已隐藏]';}}).replace(/[a-z]:[\\/][^\r\n"<>]*/gi,'[本机路径]').replace(/\\\\[^\s]+/g,'[本机路径]');}
  function normalize(value){
    const raw=typeof value==='string'?value:value?.error||value?.message||'';
    const code=Object.hasOwn(messages,value?.code)?value.code:rules.find(([,rule])=>rule.test(raw))?.[0]||'UNKNOWN';
    return {code,message:messages[code],retryable:['NETWORK_TEMPORARY','DIRECTORY_UNAVAILABLE','DISK_FULL'].includes(code),details:redact(value?.details||raw)};
  }
  function toError(value){const e=new Error(value?.error||value?.message||'操作未完成');Object.assign(e,normalize(value));return e;}
  function response(value){const e=normalize(value);return {ok:false,error:e.message,...e};}
  function actionsFor(error,c={}){
    const {code}=normalize(error);
    if(code==='SUBMISSION_UNKNOWN')return c.hasTask?['view-tasks']:c.hasPending?['check-save']:[];
    if(['HOST_UNAVAILABLE','HOST_OUTDATED','ENGINE_MISSING'].includes(code))return ['setup'];
    if(code==='DRM'||code==='UNSUPPORTED')return c.hasSource?['source']:[];
    if(code==='AUTH_REQUIRED')return c.hasSource?['source']:[];
    if(code==='LINK_EXPIRED')return c.hasSource?['reparse']:[];
    if(code==='DISK_FULL')return c.hasTask?['folder']:[];
    if(code==='DIRECTORY_UNAVAILABLE')return c.canChooseFolder?['choose-folder']:['setup'];
    if(c.canResume&&!['TLS_INVALID','CHECKSUM_MISMATCH'].includes(code))return ['resume'];
    return c.hasPending?['check-save']:[];
  }
  const api={normalize,redact,toError,response,actionsFor};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.Recovery=api;
})(globalThis);
