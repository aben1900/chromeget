using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net;

public static class JingcaiSetupDownload {
    private static void CheckCancelled() {
        string flag = Environment.GetEnvironmentVariable("JINGCAI_SETUP_CANCEL_FILE");
        if (!String.IsNullOrEmpty(flag) && File.Exists(flag)) throw new OperationCanceledException("SETUP_CANCELLED");
    }
    private static void Report(string label, long done, long total, double speed) {
        int percent = total > 0 ? (int)Math.Min(100L, done * 100L / total) : -1;
        string size = total > 0 ? (total / 1048576.0).ToString("F1", CultureInfo.InvariantCulture) + " MiB" : "大小未知";
        string message = String.Format(CultureInfo.InvariantCulture,
            "{0} · {1} · {2:F1} / {3} · {4:F2} MiB/s", label,
            percent < 0 ? "下载中" : percent + "%", done / 1048576.0, size, speed / 1048576.0);
        Console.WriteLine("JINGCAI_PROGRESS|" + percent + "|" + message);
        Console.Out.Flush();
    }
    public static void Download(string url, string destination, string label, IWebProxy proxy) {
        CheckCancelled();
        var request = (HttpWebRequest)WebRequest.Create(url);
        request.Proxy = proxy;
        request.Timeout = 15000;
        request.ReadWriteTimeout = 15000;
        request.UserAgent = "JingcaiClipper-Setup";
        request.AllowAutoRedirect = true;
        try {
            using (var response = (HttpWebResponse)request.GetResponse()) {
                long total = response.ContentLength, done = 0, lastBytes = 0;
                var watch = Stopwatch.StartNew();
                double lastTime = 0, speedWindowStart = 0;
                long speedWindowBytes = 0;
                Report(label, 0, total, 0);
                using (var input = response.GetResponseStream())
                using (var output = new FileStream(destination, FileMode.Create, FileAccess.Write, FileShare.Read)) {
                    var buffer = new byte[131072];
                    int n;
                    while ((n = input.Read(buffer, 0, buffer.Length)) > 0) {
                        CheckCancelled();
                        output.Write(buffer, 0, n); done += n;
                        double elapsed = watch.Elapsed.TotalSeconds;
                        if (elapsed - speedWindowStart >= 20) {
                            double rate = (done - speedWindowBytes) / (elapsed - speedWindowStart);
                            if (rate < 65536 && (total < 0 || total - done > 1048576))
                                throw new IOException("下载持续低于 64 KiB/s，尝试其他下载源。");
                            speedWindowStart = elapsed; speedWindowBytes = done;
                        }
                        if (elapsed - lastTime >= 0.5) {
                            Report(label, done, total, (done - lastBytes) / (elapsed - lastTime));
                            lastTime = elapsed; lastBytes = done;
                        }
                    }
                }
                if (total >= 0 && done != total) throw new IOException("下载未完整接收，请重试。");
                Report(label, done, total, done / Math.Max(0.001, watch.Elapsed.TotalSeconds));
            }
        } finally { request.Abort(); }
    }
}
