using System;
using System.IO;
using System.Net;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Web.Script.Serialization;

// Bounded-memory HTTP range engine. Part lengths are the resume checkpoints;
// each response must match the requested range and source validator exactly.
public sealed class RangeFile { public string Url, Path, ETag, Modified, Sha256; public long Size; }
public sealed class RangeRequest { public RangeFile[] Files; public string Metrics, JobPath; public int Connections; }
public sealed class RangeMeta { public string Source, ETag, Modified; public long Size; public int Count; }
public static class JingcaiRanges {
    sealed class Part { public long Start, End, Done, Previous, Speed; public int Active; public string Path; }
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 4194304 };
    static bool Stopped(string job) { return File.Exists(job+".paused") || File.Exists(job+".deleted"); }
    static void Atomic(string path, object value) {
        string temp=path+"."+Guid.NewGuid().ToString("N")+".tmp";
        File.WriteAllText(temp,Json.Serialize(value),new System.Text.UTF8Encoding(false));
        for(int retry=0;;retry++)try { if(File.Exists(path))File.Replace(temp,path,null);else File.Move(temp,path);break; }
        catch(IOException){ if(retry>=5){File.Delete(temp);throw;} Thread.Sleep(50); }
    }
    static string HashFile(string path) { using(var sha=SHA256.Create())using(var stream=File.OpenRead(path))return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant(); }
    static void Fetch(RangeFile file,Part part,string job) {
        for(int attempt=0;attempt<4;attempt++) {
            if(Stopped(job))throw new OperationCanceledException("Task stopped");
            part.Done=File.Exists(part.Path)?new FileInfo(part.Path).Length:0;
            if(part.Done>part.End-part.Start+1)throw new IOException("Invalid partial length; partial preserved");
            if(part.Done==part.End-part.Start+1)return;
            var request=(HttpWebRequest)WebRequest.Create(file.Url);
            if(request.RequestUri.IsLoopback)request.Proxy=null;
            request.AllowAutoRedirect=true;request.MaximumAutomaticRedirections=10;
            request.Timeout=20000;request.ReadWriteTimeout=20000;request.KeepAlive=false;
            request.UserAgent="JingcaiDownloader/1.20";request.AutomaticDecompression=DecompressionMethods.None;
            request.Headers[HttpRequestHeader.AcceptEncoding]="identity";
            long offset=part.Start+part.Done;request.AddRange(offset,part.End);
            if(!String.IsNullOrEmpty(file.ETag)&&!file.ETag.StartsWith("W/"))request.Headers[HttpRequestHeader.IfRange]=file.ETag;
            else if(!String.IsNullOrEmpty(file.Modified))request.Headers[HttpRequestHeader.IfRange]=file.Modified;
            try {
                Interlocked.Exchange(ref part.Active,1);
                using(var response=(HttpWebResponse)request.GetResponse()) {
                    string expected="bytes "+offset+"-"+part.End+"/"+file.Size;
                    if(response.StatusCode!=HttpStatusCode.PartialContent || response.Headers["Content-Range"]!=expected || (response.ContentLength>=0 && response.ContentLength!=part.End-offset+1))
                        throw new InvalidDataException("Range response changed or unsupported; partial preserved");
                    if(!String.IsNullOrEmpty(file.ETag)&&response.Headers["ETag"]!=file.ETag)throw new InvalidDataException("Source ETag changed; partial preserved");
                    if(String.IsNullOrEmpty(file.ETag)&&!String.IsNullOrEmpty(file.Modified)&&response.Headers["Last-Modified"]!=file.Modified)throw new InvalidDataException("Source Last-Modified changed; partial preserved");
                    if(!String.IsNullOrEmpty(response.Headers["Content-Encoding"])&&response.Headers["Content-Encoding"]!="identity")throw new InvalidDataException("Unexpected range content encoding");
                    using(var input=response.GetResponseStream())using(var output=new FileStream(part.Path,FileMode.Append,FileAccess.Write,FileShare.Read,65536)) {
                        byte[] buffer=new byte[65536];long left=part.End-offset+1;long checkpoint=0;
                        var watch=System.Diagnostics.Stopwatch.StartNew();long interval=0;
                        while(left>0) {
                            if(Stopped(job))throw new OperationCanceledException("Task stopped");
                            int n=input.Read(buffer,0,(int)Math.Min(buffer.Length,left));if(n==0)throw new IOException("Early end of range");
                            output.Write(buffer,0,n);left-=n;Interlocked.Add(ref part.Done,n);checkpoint+=n;interval+=n;
                            if(checkpoint>=1048576){output.Flush(true);checkpoint=0;}
                            if(watch.Elapsed.TotalSeconds>=20){if(interval/watch.Elapsed.TotalSeconds<1024)throw new IOException("Range too slow; retrying");watch.Restart();interval=0;}
                        }
                        output.Flush(true);
                    }
                }
                return;
            }catch(InvalidDataException){throw;}
            catch(OperationCanceledException){throw;}
            catch(Exception){if(attempt==3)throw;Thread.Sleep(500*(attempt+1));}
            finally { request.Abort();Interlocked.Exchange(ref part.Active,0); }
        }
    }
    public static void Run(string requestJson) {
        var req=Json.Deserialize<RangeRequest>(requestJson);
        ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
        ServicePointManager.DefaultConnectionLimit=128;
        int workers,io;ThreadPool.GetMinThreads(out workers,out io);ThreadPool.SetMinThreads(Math.Max(workers,128),io);
        long total=req.Files.Sum(f=>f.Size),finished=0;
        foreach(var file in req.Files) {
            if(Stopped(req.JobPath))throw new OperationCanceledException("Task stopped");
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(file.Path));
            string folder=file.Path+".jcparts",metaPath=System.IO.Path.Combine(folder,"state.json");
            var meta=new RangeMeta {Source=new Uri(file.Url).Host=="huggingface.co"?file.Url.Split('?')[0]:file.Url,Size=file.Size,Count=(int)Math.Min(4096,Math.Max(1,(file.Size+1048575)/1048576)),ETag=file.ETag,Modified=file.Modified};
            if(File.Exists(metaPath)) {
                var old=Json.Deserialize<RangeMeta>(File.ReadAllText(metaPath));
                if(old.Size!=meta.Size||old.Source!=meta.Source||old.ETag!=meta.ETag||old.Modified!=meta.Modified||old.Count!=meta.Count)throw new InvalidDataException("Source version changed; partial preserved. Choose a new filename.");
            }else {
                if(Directory.Exists(folder))throw new IOException("Unknown partial folder; choose a new filename");
                if(File.Exists(file.Path))throw new IOException("Output already exists; choose a new filename");
                Directory.CreateDirectory(folder);Atomic(metaPath,meta);
            }
            string receipt=System.IO.Path.Combine(folder,"complete.sha256");
            if(File.Exists(file.Path)&&File.Exists(receipt)) {
                if(new FileInfo(file.Path).Length!=file.Size||HashFile(file.Path)!=File.ReadAllText(receipt))throw new InvalidDataException("Completed output changed");
                finished+=file.Size;continue;
            }
            if(File.Exists(file.Path))throw new IOException("Unexpected existing output; preserved");
            var parts=Enumerable.Range(0,meta.Count).Select(i=>new Part {Start=file.Size*i/meta.Count,End=file.Size*(i+1)/meta.Count-1,Path=System.IO.Path.Combine(folder,i.ToString("D4")+".part")}).ToArray();
            foreach(var p in parts){p.Done=File.Exists(p.Path)?new FileInfo(p.Path).Length:0;p.Previous=p.Done;}
            if(parts.Any(p=>p.Done>0)&&String.IsNullOrEmpty(meta.ETag)&&String.IsNullOrEmpty(meta.Modified))throw new InvalidDataException("Source has no validator; cannot safely resume parts");
            Exception error=null;
            var queue=new ConcurrentQueue<Part>(parts);int limit=Math.Max(1,Math.Min(64,req.Connections));
            var download=Task.Factory.StartNew(()=>{try {Parallel.For(0,limit,new ParallelOptions {MaxDegreeOfParallelism=limit},i=>{Part next;while(queue.TryDequeue(out next))Fetch(file,next,req.JobPath);});}catch(Exception e){error=e;}});
            var clock=System.Diagnostics.Stopwatch.StartNew();
            do {
                download.Wait(1000);double elapsed=Math.Max(.001,clock.Elapsed.TotalSeconds);clock.Restart();
                foreach(var p in parts){long current=Interlocked.Read(ref p.Done);p.Speed=Math.Max(0,(long)((current-p.Previous)/elapsed));p.Previous=current;}
                Atomic(req.Metrics,new {updatedAt=DateTime.UtcNow.ToString("o"),total=total,completed=finished+parts.Sum(p=>Interlocked.Read(ref p.Done)),speed=parts.Sum(p=>p.Speed),connections=parts.Sum(p=>p.Active),source="range64",files=new[]{new {name=System.IO.Path.GetFileName(file.Path),groups=Enumerable.Range(0,Math.Min(64,parts.Length)).Select(i=>{
                    int groups=Math.Min(64,parts.Length),start=i*parts.Length/groups,end=(i+1)*parts.Length/groups;var slice=parts.Skip(start).Take(end-start).ToArray();
                    return new {start=slice[0].Start,end=slice[slice.Length-1].End+1,percent=Math.Round(100.0*slice.Sum(p=>Interlocked.Read(ref p.Done))/(slice[slice.Length-1].End-slice[0].Start+1),1),speed=slice.Sum(p=>p.Speed),active=slice.Any(p=>p.Active==1)};
                }).ToArray()}}});
            }while(!download.IsCompleted);
            if(error!=null)throw error;
            if(Stopped(req.JobPath))throw new OperationCanceledException("Task stopped");
            var finalMetrics=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(req.Metrics));finalMetrics["phase"]="正在合并与校验文件";finalMetrics["speed"]=0;finalMetrics["connections"]=0;Atomic(req.Metrics,finalMetrics);
            string merged=System.IO.Path.Combine(folder,"assembled.tmp");
            using(var output=new FileStream(merged,FileMode.Create,FileAccess.Write,FileShare.None,1048576))foreach(var p in parts){if(Stopped(req.JobPath))throw new OperationCanceledException("Task stopped");using(var input=File.OpenRead(p.Path))input.CopyTo(output,1048576);}
            if(new FileInfo(merged).Length!=file.Size)throw new IOException("Assembled size mismatch");
            string completeHash=HashFile(merged);
            if(!String.IsNullOrEmpty(file.Sha256)&&!String.Equals(completeHash,file.Sha256,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("SHA-256 mismatch; parts retained, output not published");
            if(Stopped(req.JobPath))throw new OperationCanceledException("Task stopped");
            File.WriteAllText(receipt,completeHash);
            File.Move(merged,file.Path);
            // Delete only the exact engine-created part files after successful publication.
            foreach(var p in parts)File.Delete(p.Path);
            finished+=file.Size;
        }
    }
}
