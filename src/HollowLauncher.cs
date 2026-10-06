using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("Hollow SMP Launcher")]
[assembly: AssemblyProduct("Hollow SMP")]
[assembly: AssemblyVersion("1.7.0.0")]
[assembly: AssemblyFileVersion("1.7.0.0")]

namespace HollowSMP {
static class Program {
    [STAThread] static int Main(string[] args) {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        try {
            if(args.Length>0 && args[0]=="--self-test") { Engine.SelfTest(args[1]); return 0; }
            if(args.Length>0 && args[0]=="--verify-reset") { Engine.VerifyReset(args[1]); return 0; }
            if(args.Length>0 && args[0]=="--preview") { using(var f=new LauncherForm()) { f.Show(); if(args.Length>2 && args[2]=="microsoft")f.PreviewMicrosoft(); Application.DoEvents(); using(var b=new Bitmap(f.Width,f.Height)) { f.DrawToBitmap(b,new Rectangle(0,0,b.Width,b.Height)); b.Save(args[1]); } } return 0; }
            if(args.Length>0 && args[0]=="--verify-selectors"){using(var f=new LauncherForm()){f.Show();Application.DoEvents();f.VerifySelectors(args[1]);f.VerifyMemory(args[1]);f.VerifyTypographyAndMotion(args[1]);PixelText.VerifyClipping();for(int i=0;i<20;i++){f.Invalidate(true);f.Update();Application.DoEvents();}File.AppendAllText(args[1],"\nTexto respeita recorte e posição do controle: OK\n20 redesenhos: OK");}return 0;}
            if(args.Length>0 && args[0]=="--verify-install") {
                var e=new Engine(args[1]); e.Report=s=>File.AppendAllText(Path.Combine(args[1],"verify.log"),s+Environment.NewLine);
                e.Install().GetAwaiter().GetResult(); e.BuildOfflineArguments("HollowTeste",6); File.WriteAllText(Path.Combine(args[1],"verified.txt"),"Instalacao e argumentos verificados."); return 0;
            }
            if(args.Length>0 && args[0]=="--verify-runtime") {var e=new Engine(args[1]);e.InstallJava().GetAwaiter().GetResult();File.WriteAllText(Path.Combine(args[1],"runtime-verified.txt"),e.Java);return 0;}
            if(args.Length>0 && args[0]=="--verify-profile") {
                var e=new Engine(args[1]);var home=Path.Combine(e.Root,"official-profile-test");Directory.CreateDirectory(home);var file=Path.Combine(home,"launcher_profiles.json");
                Engine.Write(file,new Dictionary<string,object>{{"profiles",new Dictionary<string,object>{{"existing",new Dictionary<string,object>{{"name","Perfil existente"}}}}},{"settings",new Dictionary<string,object>{{"sentinel",true}}}});
                e.RegisterOfficial(6,home);var r=Engine.Read(file);if(!Engine.Obj(r["profiles"]).ContainsKey("existing")||!Convert.ToBoolean(Engine.Obj(r["settings"])["sentinel"])||!Engine.Obj(r["profiles"]).ContainsKey("hollow-smp")||!File.Exists(file+".before-hollow.bak"))throw new Exception("Falha no perfil oficial.");
                File.WriteAllText(Path.Combine(e.Root,"profile-verified.txt"),"Perfil criado, dados existentes e backup preservados.");return 0;
            }
            if(args.Length>0 && args[0]=="--smoke-game") {
                var e=new Engine(args[1]);int id=e.LaunchOffline("HollowTeste",4);using(var p=Process.GetProcessById(id)){if(!p.WaitForExit(45000)){p.Kill();p.WaitForExit();}}
                Thread.Sleep(500);return 0;
            }
            bool first; using(var mutex=new Mutex(true,"Local\\HollowSMPLauncher",out first)) { if(!first)return 0; Application.Run(new LauncherForm()); }
            return 0;
        } catch(Exception ex) {
            if(args.Length>0) File.WriteAllText(Path.Combine(Path.GetDirectoryName(Path.GetFullPath(args[args.Length-1])),"launcher-test-error.txt"),ex.ToString());
            else LauncherDialog.Show(null,ex.Message);
            return 1;
        }
    }
}

class Engine {
    public const string MC="1.21.1", NF="21.1.253", Version="neoforge-21.1.253", Server="hollowsmp.com.br:25565";
    public const string ModHash="96dc57f223b83850a1684ebb8283e1e6aa5cfb89ae5226464de6d5fc85bb1f80";
    public readonly string Root,Game; public Action<string> Report=delegate{};
    static readonly JavaScriptSerializer Json=new JavaScriptSerializer { MaxJsonLength=int.MaxValue, RecursionLimit=200 };
    static readonly HttpClient Http=new HttpClient { Timeout=TimeSpan.FromMinutes(10) };
    public Engine(string root=null) { Root=root??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"HollowSMP"); Game=Path.Combine(Root,"game"); }
    public bool Ready { get { var mods=Path.Combine(Game,"mods");return File.Exists(Path.Combine(Root,"ready.json")) && File.Exists(Java) && File.Exists(VersionFile(Version)) && Directory.Exists(mods) && Directory.GetFiles(mods,"automodpack-*.jar").Length>0; } }
    public string Java { get { return Path.Combine(Root,"runtime","bin","java.exe"); } }
    // Reset is restricted to the launcher's private directory. Links are never followed.
    public void ResetInstallation() {
        var full=Path.GetFullPath(Root).TrimEnd(Path.DirectorySeparatorChar);
        var normal=Path.GetFullPath(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"HollowSMP"));
        if(!full.Equals(normal,StringComparison.OrdinalIgnoreCase) && Path.GetFileName(full)!="hollow-reset-test")throw new IOException("Pasta de reset inválida.");
        for(var ancestor=new DirectoryInfo(full);ancestor!=null;ancestor=ancestor.Parent)
            if(ancestor.Exists && (ancestor.Attributes&FileAttributes.ReparsePoint)!=0)throw new IOException("Reset bloqueado: a instalação contém um link de pasta.");
        if(!Directory.Exists(full))return;
        // The official launcher can use its own Java, so block both Java process names.
        // This works without administrator privileges or access to process command lines.
        foreach(var name in new[]{"java","javaw"})foreach(var process in Process.GetProcessesByName(name))using(process)
            if(!process.HasExited)throw new IOException("Feche o Minecraft e outros aplicativos Java antes de resetar.");
        var files=new List<string>();var directories=new List<string>();InspectReset(full,files,directories);
        // Check every file before deleting anything, so an open game does not cause a partial reset.
        foreach(var file in files)using(File.Open(file,FileMode.Open,FileAccess.Read,FileShare.None)){}
        foreach(var file in files){File.SetAttributes(file,FileAttributes.Normal);File.Delete(file);}
        directories.Reverse();foreach(var directory in directories)Directory.Delete(directory,false);
        Directory.Delete(full,false);
    }
    static void InspectReset(string directory,List<string> files,List<string> directories){
        foreach(var entry in Directory.GetFileSystemEntries(directory)){
            var attributes=File.GetAttributes(entry);if((attributes&FileAttributes.ReparsePoint)!=0)throw new IOException("Reset bloqueado: a instalação contém um link de arquivo ou pasta.");
            if((attributes&FileAttributes.Directory)!=0){directories.Add(entry);InspectReset(entry,files,directories);}else files.Add(entry);
        }
    }
    public static void VerifyReset(string output){
        string root=Path.Combine(Path.GetDirectoryName(Path.GetFullPath(output)),"hollow-reset-test");
        if(Directory.Exists(root))throw new IOException("O teste exige uma pasta nova.");
        var engine=new Engine(root);Directory.CreateDirectory(engine.Game);string file=Path.Combine(engine.Game,"locked.txt");File.WriteAllText(file,"sentinel");
        string outside=Path.Combine(Path.GetDirectoryName(root),"reset-outside-sentinel.txt");File.WriteAllText(outside,"preserve");
        using(var locked=File.Open(file,FileMode.Open,FileAccess.Read,FileShare.None)){bool refused=false;try{engine.ResetInstallation();}catch(IOException){refused=true;}if(!refused||!File.Exists(file))throw new Exception("Reset não preservou a instalação ocupada.");}
        bool invalid=false;try{new Engine(Path.GetDirectoryName(root)).ResetInstallation();}catch(IOException){invalid=true;}if(!invalid)throw new Exception("Reset aceitou pasta fora do escopo.");
        Write(Path.Combine(root,"launcher-settings.json"),new {ram=6});engine.ResetInstallation();engine.ResetInstallation();
        if(Directory.Exists(root)||File.ReadAllText(outside)!="preserve")throw new Exception("Reset não respeitou o isolamento.");File.Delete(outside);
        File.WriteAllText(output,"Reset completo: OK\nArquivo ocupado preservado: OK\nPasta fora do escopo recusada: OK\nArquivo externo preservado: OK\nReset repetido: OK");
    }
    string VersionFile(string v) { return Path.Combine(Game,"versions",v,v+".json"); }
    public static Dictionary<string,object> Obj(object o) { return (Dictionary<string,object>)o; }
    public static object[] Arr(object o) { return (object[])o; }
    public static Dictionary<string,object> Read(string f) { return Obj(Json.DeserializeObject(File.ReadAllText(f))); }
    public static void Write(string f,object o) { Directory.CreateDirectory(Path.GetDirectoryName(f)); Atomic(f,Encoding.UTF8.GetBytes(Json.Serialize(o))); }
    static void Atomic(string file,byte[] content) { Directory.CreateDirectory(Path.GetDirectoryName(file)); var temp=file+".hollow-new"; File.WriteAllBytes(temp,content); if(File.Exists(file))File.Replace(temp,file,null); else File.Move(temp,file); }
    static string Hash(string f,string alg) { using(var h=HashAlgorithm.Create(alg))using(var s=File.OpenRead(f))return BitConverter.ToString(h.ComputeHash(s)).Replace("-","").ToLowerInvariant(); }
    static string Under(string root,string relative) { var prefix=Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar; var full=Path.GetFullPath(Path.Combine(root,relative.Replace('/',Path.DirectorySeparatorChar))); if(!full.StartsWith(prefix,StringComparison.OrdinalIgnoreCase))throw new IOException("Caminho fora da pasta de instalacao."); return full; }
    static async Task Download(string url,string file,string hash=null,string algorithm="SHA1") {
        if(File.Exists(file) && hash!=null && Hash(file,algorithm)==hash.ToLowerInvariant())return;
        if(new Uri(url).Scheme!="https")throw new IOException("O download exige HTTPS.");
        Directory.CreateDirectory(Path.GetDirectoryName(file)); var temp=file+".partial";
        for(int attempt=0;attempt<3;attempt++) {
            try {
                using(var response=await Http.GetAsync(url,HttpCompletionOption.ResponseHeadersRead)) {
                    response.EnsureSuccessStatusCode(); using(var source=await response.Content.ReadAsStreamAsync())using(var dest=File.Create(temp))await source.CopyToAsync(dest);
                }
                if(hash!=null && Hash(temp,algorithm)!=hash.ToLowerInvariant())throw new IOException("Download nao passou na verificacao: "+Path.GetFileName(file));
                if(File.Exists(file))File.Replace(temp,file,null); else File.Move(temp,file); return;
            } catch { if(File.Exists(temp))File.Delete(temp); if(attempt==2)throw; }
            await Task.Delay(1000*(attempt+1));
        }
    }
    static void Extract(string zip,string target) {
        using(var z=ZipFile.OpenRead(zip))foreach(var entry in z.Entries) {
            var file=Under(target,entry.FullName); if(entry.FullName.EndsWith("/")) {Directory.CreateDirectory(file);continue;}
            Directory.CreateDirectory(Path.GetDirectoryName(file)); entry.ExtractToFile(file,true);
        }
    }
    public async Task Install() {
        Directory.CreateDirectory(Root); Directory.CreateDirectory(Game);
        if(IntPtr.Size!=8)throw new Exception("Use Windows de 64 bits.");
        await InstallJava();
        Report("Preparando Minecraft 1.21.1...");
        var manifest=Obj(Json.DeserializeObject(await Http.GetStringAsync("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json")));
        var mc=Arr(manifest["versions"]).Select(Obj).First(v=>(string)v["id"]==MC);
        await Download((string)mc["url"],VersionFile(MC),(string)mc["sha1"]);
        var vanilla=Read(VersionFile(MC)); var client=Obj(Obj(vanilla["downloads"])["client"]);
        await Download((string)client["url"],Path.Combine(Game,"versions",MC,MC+".jar"),(string)client["sha1"]);
        await GetLibraries(vanilla);
        if(!File.Exists(VersionFile(Version))) {
            Report("Instalando NeoForge 21.1.253. Isso pode levar alguns minutos...");
            string installer=Path.Combine(Root,"downloads","neoforge-installer.jar");
            await Download("https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.253/neoforge-21.1.253-installer.jar",installer,"8e8a6889b6d7ddcae5f93c4f9c90035e14ea70cdc5b74147773265809c4f9137","SHA256");
            string profiles=Path.Combine(Game,"launcher_profiles.json");
            if(!File.Exists(profiles))Write(profiles,new Dictionary<string,object>{{"profiles",new Dictionary<string,object>()}});
            await RunInstaller(installer);
        }
        var neo=Read(VersionFile(Version)); await GetLibraries(neo);
        Report("Conferindo recursos do jogo..."); var index=Obj(vanilla["assetIndex"]);
        string indexFile=Under(Path.Combine(Game,"assets","indexes"),(string)index["id"]+".json");
        await Download((string)index["url"],indexFile,(string)index["sha1"]);
        var assets=Obj(Read(indexFile)["objects"]).Values.Select(Obj).GroupBy(x=>(string)x["hash"]).Select(x=>x.First()).ToArray();
        using(var sem=new SemaphoreSlim(12)) {
            int done=0; await Task.WhenAll(assets.Select(async a=> {
                await sem.WaitAsync(); try { string h=(string)a["hash"]; await Download("https://resources.download.minecraft.net/"+h.Substring(0,2)+"/"+h,Under(Path.Combine(Game,"assets","objects"),h.Substring(0,2)+"/"+h),h); int n=Interlocked.Increment(ref done); if(n%100==0 || n==assets.Length)Report("Recursos: "+n+" / "+assets.Length); } finally {sem.Release();}
            }));
        }
        Report("Preparando o Hollow SMP...");
        var mod=Path.Combine(Game,"mods","automodpack-5.0.0-rc.2.jar");
        Directory.CreateDirectory(Path.GetDirectoryName(mod));
        bool firstMod=Directory.GetFiles(Path.GetDirectoryName(mod),"automodpack-*.jar").Length==0;
        if(firstMod) { using(var resource=Assembly.GetExecutingAssembly().GetManifestResourceStream("AutoModpack.jar"))using(var dest=File.Create(modWithDirectory(mod)))resource.CopyTo(dest); }
        // AutoModpack may replace its bootstrap jar during a server-controlled update.
        if(firstMod && Hash(mod,"SHA256")!=ModHash)throw new IOException("AutoModpack invalido.");
        WriteServerList();
        Write(Path.Combine(Root,"ready.json"),new { minecraft=MC,neoforge=NF,created=DateTime.UtcNow.ToString("o") });
        Report("Pronto. Entre no servidor para receber o modpack.");
    }
    public async Task InstallJava() {
        Directory.CreateDirectory(Root);
        if(!File.Exists(Java)) {
            Report("Baixando Java 21...");
            var meta=Arr(Json.DeserializeObject(await Http.GetStringAsync("https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse")));
            var pack=Obj(Obj(Obj(meta[0])["binary"])["package"]); string zip=Path.Combine(Root,"downloads","java21.zip");
            await Download((string)pack["link"],zip,(string)pack["checksum"],"SHA256");
            string staging=Path.Combine(Root,"runtime-extract"); Directory.CreateDirectory(staging); Extract(zip,staging);
            string source=Directory.GetDirectories(staging).First(p=>File.Exists(Path.Combine(p,"bin","java.exe")));
            CopyTree(source,Path.Combine(Root,"runtime"));
        }
    }
    static string modWithDirectory(string file) {Directory.CreateDirectory(Path.GetDirectoryName(file));return file;}
    async Task RunInstaller(string jar) {
        var info=new ProcessStartInfo(Java,"-jar "+Quote(jar)+" --installClient "+Quote(Game)) {UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Root,RedirectStandardOutput=true,RedirectStandardError=true};
        using(var p=Process.Start(info)) {
            var stdout=p.StandardOutput.ReadToEndAsync(); var stderr=p.StandardError.ReadToEndAsync(); await Task.Run(()=>p.WaitForExit());
            File.WriteAllText(Path.Combine(Root,"neoforge-install.log"),(await stdout)+Environment.NewLine+(await stderr));
            if(p.ExitCode!=0 || !File.Exists(VersionFile(Version)))throw new Exception("O NeoForge nao terminou a instalacao. Confira neoforge-install.log na pasta do launcher.");
        }
    }
    async Task GetLibraries(Dictionary<string,object> version) {
        if(!version.ContainsKey("libraries"))return;
        foreach(var lib in Arr(version["libraries"]).Select(Obj)) {
            if(!Allowed(lib)||!lib.ContainsKey("downloads"))continue;
            var downloads=Obj(lib["downloads"]);
            if(downloads.ContainsKey("artifact")) {var a=Obj(downloads["artifact"]); if(a.ContainsKey("url") && !string.IsNullOrEmpty((string)a["url"]))await Download((string)a["url"],Under(Path.Combine(Game,"libraries"),(string)a["path"]),a.ContainsKey("sha1")?(string)a["sha1"]:null);}
            if(lib.ContainsKey("natives")) {var natives=Obj(lib["natives"]); if(natives.ContainsKey("windows") && downloads.ContainsKey("classifiers")) {string classifier=((string)natives["windows"]).Replace("${arch}","64");var all=Obj(downloads["classifiers"]);if(all.ContainsKey(classifier)){var a=Obj(all[classifier]);await Download((string)a["url"],Under(Path.Combine(Game,"libraries"),(string)a["path"]),(string)a["sha1"]);}}}
        }
    }
    static bool Allowed(Dictionary<string,object> node) {
        if(!node.ContainsKey("rules"))return true; bool allow=false;
        foreach(var r in Arr(node["rules"]).Select(Obj)) {
            bool matches=true;
            if(r.ContainsKey("os")) {var os=Obj(r["os"]);if(os.ContainsKey("name") && (string)os["name"]!="windows")matches=false;if(os.ContainsKey("arch") && (string)os["arch"]!="x86_64" && (string)os["arch"]!="amd64")matches=false;if(os.ContainsKey("version") && !Regex.IsMatch(Environment.OSVersion.Version.ToString(),(string)os["version"]))matches=false;}
            if(r.ContainsKey("features"))foreach(var feature in Obj(r["features"]))if(Convert.ToBoolean(feature.Value))matches=false;
            if(matches)allow=(string)r["action"]=="allow";
        } return allow;
    }
    public static string OfflineUuid(string name) { using(var md5=MD5.Create()) {var b=md5.ComputeHash(Encoding.UTF8.GetBytes("OfflinePlayer:"+name));b[6]=(byte)((b[6]&15)|48);b[8]=(byte)((b[8]&63)|128);return BitConverter.ToString(b).Replace("-","").ToLowerInvariant();} }
    public List<string> BuildOfflineArguments(string nick,int ram) {
        if(!Regex.IsMatch(nick,"^[A-Za-z0-9_]{3,16}$"))throw new Exception("Use um nickname de 3 a 16 letras, numeros ou _.");
        if(ram<2||ram>24)throw new Exception("RAM invalida.");
        var vanilla=Read(VersionFile(MC));var neo=Read(VersionFile(Version));
        var merged=new Dictionary<string,Dictionary<string,object>>();
        foreach(var lib in Arr(vanilla["libraries"]).Concat(Arr(neo["libraries"])).Select(Obj)) {
            if(!Allowed(lib))continue;string name=(string)lib["name"];var pieces=name.Split(':');string key=pieces[0]+":"+pieces[1]+(pieces.Length>3?":"+pieces[3]:""); merged[key]=lib;
        }
        var libraries=Path.Combine(Game,"libraries");var natives=Path.Combine(Game,"natives");Directory.CreateDirectory(natives);var classpath=new List<string>();
        foreach(var lib in merged.Values) {
            if(!lib.ContainsKey("downloads"))continue;var dl=Obj(lib["downloads"]);
            if(dl.ContainsKey("artifact")) {var a=Obj(dl["artifact"]);string p=Under(libraries,(string)a["path"]);if(!File.Exists(p))throw new IOException("Biblioteca ausente: "+Path.GetFileName(p));classpath.Add(p);if(((string)lib["name"]).Contains(":natives-windows"))ExtractNative(p,natives);}
            if(lib.ContainsKey("natives")) {var n=Obj(lib["natives"]);if(n.ContainsKey("windows") && dl.ContainsKey("classifiers")){var c=Obj(dl["classifiers"]);string classifier=((string)n["windows"]).Replace("${arch}","64");if(c.ContainsKey(classifier))ExtractNative(Under(libraries,(string)Obj(c[classifier])["path"]),natives);}}
        }
        classpath.Add(Path.Combine(Game,"versions",MC,MC+".jar"));
        var replacements=new Dictionary<string,string> {
            {"auth_player_name",nick},{"version_name",Version},{"game_directory",Game},{"assets_root",Path.Combine(Game,"assets")},{"assets_index_name",(string)Obj(vanilla["assetIndex"])["id"]},{"auth_uuid",OfflineUuid(nick)},{"auth_access_token","0"},{"clientid",""},{"auth_xuid",""},{"user_type","legacy"},{"version_type","release"},{"natives_directory",natives},{"launcher_name","HollowSMP"},{"launcher_version","1.0.0"},{"classpath",string.Join(";",classpath)},{"library_directory",libraries},{"classpath_separator",";"},{"user_properties","{}"}
        };
        Func<string,string> expand=s=> {foreach(var pair in replacements)s=s.Replace("${"+pair.Key+"}",pair.Value);if(s.Contains("${"))throw new Exception("Argumento nao reconhecido: "+s);return s;};
        var args=new List<string>{"-Xms1G","-Xmx"+ram+"G","-Dfile.encoding=UTF-8"};
        foreach(var v in new[]{vanilla,neo})args.AddRange(Arguments(v,"jvm").Select(expand));
        // The vanilla jar is inherited under its original filename in this launcher.
        // NeoForge supplies the patched Minecraft module and must ignore that jar.
        args.Add("-DignoreList=client-extra,"+Version+".jar,"+MC+".jar");
        args.Add((string)neo["mainClass"]);
        foreach(var v in new[]{vanilla,neo})args.AddRange(Arguments(v,"game").Select(expand));
        return args;
    }
    static IEnumerable<string> Arguments(Dictionary<string,object> version,string type) {
        if(!version.ContainsKey("arguments"))yield break;var args=Obj(version["arguments"]);if(!args.ContainsKey(type))yield break;
        foreach(var a in Arr(args[type])) {if(a is string){yield return (string)a;continue;}var node=Obj(a);if(!Allowed(node))continue;var value=node["value"];if(value is string)yield return (string)value;else foreach(var x in Arr(value))yield return (string)x;}
    }
    static void ExtractNative(string jar,string target) {using(var z=ZipFile.OpenRead(jar))foreach(var e in z.Entries)if(e.FullName.EndsWith(".dll",StringComparison.OrdinalIgnoreCase)){var file=Under(target,e.FullName);Directory.CreateDirectory(Path.GetDirectoryName(file));e.ExtractToFile(file,true);}}
    public static string Quote(string s) {
        var b=new StringBuilder("\"");int slashes=0;
        foreach(char c in s) {if(c=='\\'){slashes++;continue;}if(c=='\"')b.Append('\\',slashes*2+1).Append(c);else b.Append('\\',slashes).Append(c);slashes=0;}
        return b.Append('\\',slashes*2).Append('"').ToString();
    }
    public int LaunchOffline(string nick,int ram) {
        var args=BuildOfflineArguments(nick,ram);var file=Path.Combine(Root,"game-args.txt");
        File.WriteAllLines(file,args.Select(a=>"\""+a.Replace("\\","\\\\").Replace("\"","\\\"")+"\""),new UTF8Encoding(false));
        string log=Path.Combine(Root,"game-launch.log");
        var info=new ProcessStartInfo(Java,"@"+Quote(file)){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Game,RedirectStandardOutput=true,RedirectStandardError=true};
        var p=new Process{StartInfo=info,EnableRaisingEvents=true};var gate=new object();
        DataReceivedEventHandler write=(s,e)=> {if(e.Data!=null)lock(gate)File.AppendAllText(log,e.Data+Environment.NewLine);};
        File.WriteAllText(log,"Hollow SMP — "+DateTime.Now.ToString("s")+Environment.NewLine);
        p.OutputDataReceived+=write;p.ErrorDataReceived+=write;p.Exited+=(s,e)=> {int code=p.ExitCode;lock(gate)File.AppendAllText(log,"Exit code: "+code+Environment.NewLine);Report(code==0?"Minecraft fechado. Pronto para jogar novamente.":"O jogo encerrou. Confira game-launch.log em Abrir pasta.");};
        p.Start();p.BeginOutputReadLine();p.BeginErrorReadLine();
        Report("Minecraft iniciado. Abra Multijogador e escolha Hollow SMP.");
        return p.Id;
    }
    public void RegisterOfficial(int ram,string testHome=null) {
        if(testHome==null && Process.GetProcesses().Any(p=>p.ProcessName.Equals("MinecraftLauncher",StringComparison.OrdinalIgnoreCase)))throw new Exception("Feche o Minecraft Launcher antes de registrar o perfil Hollow SMP.");
        var home=testHome??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),".minecraft");
        var profileFiles=new[]{"launcher_profiles.json","launcher_profiles_microsoft_store.json"}.Select(p=>Path.Combine(home,p)).Where(File.Exists).ToArray();
        if(profileFiles.Length==0)throw new Exception("Abra o Minecraft Launcher oficial, faca login uma vez e feche-o. Depois clique novamente aqui.");
        CopyTree(Path.Combine(Game,"libraries"),Path.Combine(home,"libraries"));CopyTree(Path.Combine(Game,"versions"),Path.Combine(home,"versions"));
        foreach(var f in profileFiles) {
            var root=Read(f);if(!root.ContainsKey("profiles"))root["profiles"]=new Dictionary<string,object>();var profiles=Obj(root["profiles"]);
            profiles["hollow-smp"]=new Dictionary<string,object>{{"name","Hollow SMP"},{"type","custom"},{"created",DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")},{"lastVersionId",Version},{"gameDir",Game},{"javaDir",Java},{"javaArgs","-Xmx"+ram+"G -Xms1G -Dfile.encoding=UTF-8"},{"icon","Grass"}};
            if(!File.Exists(f+".before-hollow.bak"))File.Copy(f,f+".before-hollow.bak");Write(f,root);
        }
    }
    public void OpenOfficial() {
        var candidates=new[]{Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),"Minecraft Launcher","MinecraftLauncher.exe"),Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"Minecraft Launcher","MinecraftLauncher.exe")};
        string exe=candidates.FirstOrDefault(File.Exists);if(exe!=null){Process.Start(exe);return;}
        // Microsoft Store launcher identity (minecraft:// opens Bedrock instead).
        var storeData=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Packages","Microsoft.4297127D64EC6_8wekyb3d8bbwe");
        if(Directory.Exists(storeData)){Process.Start("explorer.exe","shell:AppsFolder\\Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft");return;}
        throw new Exception("Nao encontrei o Minecraft Launcher oficial. Use o botao para baixa-lo, faca login e tente novamente.");
    }
    static void CopyTree(string source,string target) {foreach(var f in Directory.GetFiles(source,"*",SearchOption.AllDirectories)){var dest=Under(target,f.Substring(source.TrimEnd('\\').Length+1));Directory.CreateDirectory(Path.GetDirectoryName(dest));if(!File.Exists(dest)||Hash(f,"SHA256")!=Hash(dest,"SHA256"))File.Copy(f,dest,true);}}
    void WriteServerList() {
        string file=Path.Combine(Game,"servers.dat");if(File.Exists(file))return;
        using(var ms=new MemoryStream())using(var w=new BinaryWriter(ms,Encoding.UTF8)) {
            w.Write((byte)10);NBTString(w,"");w.Write((byte)9);NBTString(w,"servers");w.Write((byte)10);BEInt(w,1);
            w.Write((byte)8);NBTString(w,"name");NBTString(w,"Hollow SMP");w.Write((byte)8);NBTString(w,"ip");NBTString(w,Server);w.Write((byte)0);w.Write((byte)0);
            Atomic(file,ms.ToArray());
        }
    }
    static void NBTString(BinaryWriter w,string s){var b=Encoding.UTF8.GetBytes(s);w.Write((byte)(b.Length>>8));w.Write((byte)b.Length);w.Write(b);}
    static void BEInt(BinaryWriter w,int n){w.Write(new[]{(byte)(n>>24),(byte)(n>>16),(byte)(n>>8),(byte)n});}
    public static void SelfTest(string output) {
        var checks=new List<string>();
        if(OfflineUuid("Notch")!="b50ad385829d3141a2167e7d7539ba7f")throw new Exception("UUID offline incorreto.");checks.Add("UUID offline compativel com Minecraft: OK");
        if(Allowed(Obj(Json.DeserializeObject("{\"rules\":[{\"action\":\"allow\",\"os\":{\"name\":\"linux\"}}]}"))))throw new Exception("Regra de SO invalida.");checks.Add("Bibliotecas por sistema operacional: OK");
        if(Allowed(Obj(Json.DeserializeObject("{\"rules\":[{\"action\":\"allow\",\"features\":{\"is_demo_user\":true}}]}"))))throw new Exception("Feature invalida.");checks.Add("Argumentos opcionais: OK");
        try { Under(Path.GetTempPath(),"../escape.txt");throw new Exception("Caminho inseguro aceito."); }catch(IOException){} checks.Add("Protecao de caminhos no ZIP e manifesto: OK");
        using(var s=Assembly.GetExecutingAssembly().GetManifestResourceStream("AutoModpack.jar"))using(var sha=SHA256.Create())if(BitConverter.ToString(sha.ComputeHash(s)).Replace("-","").ToLowerInvariant()!=ModHash)throw new Exception("Recurso AutoModpack incorreto.");checks.Add("SHA256 do AutoModpack incorporado: OK");
        var t=Path.Combine(Path.GetDirectoryName(output),"self-test-instance");var e=new Engine(t);Directory.CreateDirectory(e.Game);e.WriteServerList();
        byte[] original=File.ReadAllBytes(Path.Combine(e.Game,"servers.dat"));e.WriteServerList();if(!original.SequenceEqual(File.ReadAllBytes(Path.Combine(e.Game,"servers.dat"))))throw new Exception("Servers.dat alterado.");checks.Add("Lista de servidores criada e preservada: OK");
        File.WriteAllLines(output,checks);
    }
}

}
