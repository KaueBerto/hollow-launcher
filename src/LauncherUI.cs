using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace HollowSMP {
static class MinecraftFont {
    static readonly PrivateFontCollection collection=new PrivateFontCollection();
    static readonly List<IntPtr> fontMemory=new List<IntPtr>();
    [DllImport("gdi32.dll")] static extern IntPtr AddFontMemResourceEx(IntPtr memory,uint size,IntPtr reserved,ref uint count);
    static MinecraftFont(){foreach(var name in new[]{"Monocraft.ttf","Monocraft-Bold.ttf"})using(var stream=typeof(MinecraftFont).Assembly.GetManifestResourceStream(name)){var bytes=new byte[stream.Length];int offset=0;while(offset<bytes.Length){int n=stream.Read(bytes,offset,bytes.Length-offset);if(n==0)throw new IOException("Fonte incompleta.");offset+=n;}var data=Marshal.AllocHGlobal(bytes.Length);fontMemory.Add(data);Marshal.Copy(bytes,0,data,bytes.Length);collection.AddMemoryFont(data,bytes.Length);uint count=0;if(AddFontMemResourceEx(data,(uint)bytes.Length,IntPtr.Zero,ref count)==IntPtr.Zero)throw new IOException("Não foi possível carregar a fonte.");}}
    public static Font Make(float points){return new Font(collection.Families[0],(float)Math.Round(points*4f/3f),FontStyle.Bold,GraphicsUnit.Pixel);}
}
static class PixelText {
    public static void Draw(Graphics g,string text,Font font,Rectangle area,Color color,bool center){DrawAligned(g,text,font,area,color,center?StringAlignment.Center:StringAlignment.Near);}
    public static void DrawAligned(Graphics g,string text,Font font,Rectangle area,Color color,StringAlignment alignment){var saved=g.Save();try{g.SetClip(area,CombineMode.Intersect);g.TextRenderingHint=TextRenderingHint.SingleBitPerPixelGridFit;using(var format=new StringFormat(StringFormat.GenericTypographic)){format.Alignment=alignment;format.LineAlignment=StringAlignment.Center;format.FormatFlags=StringFormatFlags.NoWrap;format.Trimming=StringTrimming.EllipsisCharacter;using(var brush=new SolidBrush(color))g.DrawString(text,font,brush,area,format);}}finally{g.Restore(saved);}}
    public static void VerifyClipping(){using(var image=new Bitmap(200,100))using(var g=Graphics.FromImage(image))using(var font=MinecraftFont.Make(22)){g.Clear(Color.Lime);g.TranslateTransform(80,50);g.SetClip(new Rectangle(0,0,40,20));Draw(g,"HOLLOW LAUNCHER",font,new Rectangle(0,0,200,40),Color.White,false);int changed=0;for(int y=0;y<100;y++)for(int x=0;x<200;x++)if(image.GetPixel(x,y).ToArgb()!=Color.Lime.ToArgb()){changed++;if(x<80||x>=120||y<50||y>=70)throw new Exception("Texto saiu da área do controle.");}if(changed==0)throw new Exception("Texto não foi desenhado no teste.");}}
}
sealed class PixelLabel : Label {
    public PixelLabel(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer,true);}
    protected override void OnPaint(PaintEventArgs e){var alignment=TextAlign==ContentAlignment.MiddleRight?StringAlignment.Far:TextAlign==ContentAlignment.MiddleCenter?StringAlignment.Center:StringAlignment.Near;PixelText.DrawAligned(e.Graphics,Text,Font,ClientRectangle,ForeColor,alignment);}
}
sealed class FloatingLogo : Control {
    readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer{Interval=33};
    readonly Stopwatch elapsed=Stopwatch.StartNew();
    public Image Image {get;set;} public double? PreviewPhase {get;set;}
    public FloatingLogo(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.SupportsTransparentBackColor,true);BackColor=Color.Transparent;TabStop=false;timer.Tick+=(s,e)=>Invalidate();}
    public void Animate(bool run){if(run && IsHandleCreated)timer.Start();else timer.Stop();}
    protected override void OnHandleCreated(EventArgs e){base.OnHandleCreated(e);timer.Start();}
    protected override void OnHandleDestroyed(EventArgs e){timer.Stop();base.OnHandleDestroyed(e);}
    protected override void OnPaint(PaintEventArgs e){if(Image==null)return;double phase=PreviewPhase??elapsed.Elapsed.TotalSeconds;float x=10f+(float)Math.Sin(phase*1.25)*2.5f,y=10f+(float)Math.Sin(phase)*4f;e.Graphics.InterpolationMode=InterpolationMode.HighQualityBicubic;e.Graphics.PixelOffsetMode=PixelOffsetMode.HighQuality;e.Graphics.DrawImage(Image,new RectangleF(x,y,335,335));}
    internal void VerifyMotion(){for(int i=0;i<100;i++){double t=i*.1;double x=10+Math.Sin(t*1.25)*2.5,y=10+Math.Sin(t)*4;if(x<0||y<0||x+335>Width||y+335>Height)throw new Exception("Logo fora da área da animação.");}if(!timer.Enabled)throw new Exception("Animação não iniciou.");}
    protected override void Dispose(bool disposing){if(disposing){timer.Stop();timer.Dispose();}base.Dispose(disposing);}
}
static class LauncherDialog {
    public static void Show(IWin32Window owner,string message,string title="Hollow SMP") { Display(owner,message,title,false); }
    public static bool Confirm(IWin32Window owner,string message,string title) { return Display(owner,message,title,true)==DialogResult.OK; }
    static DialogResult Display(IWin32Window owner,string message,string title,bool confirm) {
        using(var dialog=new Form()){dialog.Text=title;dialog.Font=MinecraftFont.Make(10);dialog.BackColor=Color.FromArgb(23,11,35);dialog.ForeColor=Color.FromArgb(240,220,255);dialog.FormBorderStyle=FormBorderStyle.None;dialog.StartPosition=owner==null?FormStartPosition.CenterScreen:FormStartPosition.CenterParent;dialog.ShowInTaskbar=false;dialog.ClientSize=new Size(540,240);
            var heading=new Label{Text=title,Font=MinecraftFont.Make(14),ForeColor=Color.FromArgb(222,136,255),Location=new Point(28,23),Size=new Size(480,29),UseCompatibleTextRendering=true};
            var body=new Label{Text=message,Font=MinecraftFont.Make(10),Location=new Point(28,68),AutoSize=true,MaximumSize=new Size(480,0),UseCompatibleTextRendering=true};dialog.Controls.Add(heading);dialog.Controls.Add(body);
            int bottom=68+body.PreferredHeight;dialog.ClientSize=new Size(540,Math.Max(220,bottom+100));
            var ok=new BlockButton{Text=confirm?"RESETAR":"OK",Font=MinecraftFont.Make(11),BackColor=Color.FromArgb(158,43,232),ForeColor=dialog.ForeColor,Location=new Point(362,dialog.ClientSize.Height-66),Size=new Size(150,40),DialogResult=DialogResult.OK};dialog.Controls.Add(ok);
            if(confirm){var cancel=new BlockButton{Text="CANCELAR",BackColor=Color.FromArgb(49,27,66),ForeColor=dialog.ForeColor,Location=new Point(190,dialog.ClientSize.Height-66),Size=new Size(150,40),DialogResult=DialogResult.Cancel};dialog.Controls.Add(cancel);dialog.AcceptButton=dialog.CancelButton=cancel;dialog.ActiveControl=cancel;}else dialog.AcceptButton=dialog.CancelButton=ok;
            dialog.Paint+=(s,e)=>{using(var p=new Pen(Color.FromArgb(105,47,143)))e.Graphics.DrawRectangle(p,0,0,dialog.Width-1,dialog.Height-1);};
            return owner==null?dialog.ShowDialog():dialog.ShowDialog(owner);
        }
    }
}
class TextAction : Control {
    protected bool Hovered;
    public TextAction(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.SupportsTransparentBackColor|ControlStyles.Selectable,true);BackColor=Color.Transparent;TabStop=true;Cursor=Cursors.Hand;AccessibleRole=AccessibleRole.PushButton;}
    public void PerformClick(){if(Enabled)OnClick(EventArgs.Empty);}
    protected override void OnMouseEnter(EventArgs e){Hovered=true;Invalidate();base.OnMouseEnter(e);}
    protected override void OnMouseLeave(EventArgs e){Hovered=false;Invalidate();base.OnMouseLeave(e);}
    protected override void OnGotFocus(EventArgs e){Invalidate();base.OnGotFocus(e);}
    protected override void OnLostFocus(EventArgs e){Invalidate();base.OnLostFocus(e);}
    protected override void OnKeyDown(KeyEventArgs e){if(e.KeyCode==Keys.Space||e.KeyCode==Keys.Enter){PerformClick();e.Handled=true;}base.OnKeyDown(e);}
    protected override void OnPaint(PaintEventArgs e){PixelText.Draw(e.Graphics,Text,Font,ClientRectangle,Hovered||Focused?Color.FromArgb(235,183,255):ForeColor,true);}
}
sealed class SquareChoice : TextAction {
    bool selected;
    public bool Checked {get{return selected;}set{if(selected!=value){selected=value;Invalidate();}}}
    public SquareChoice(){AccessibleRole=AccessibleRole.RadioButton;}
    protected override void OnPaint(PaintEventArgs e){var color=!Enabled?Color.FromArgb(93,79,111):Checked||Hovered||Focused?Color.FromArgb(224,154,255):ForeColor;PixelText.Draw(e.Graphics,Checked?"> "+Text:"  "+Text,Font,ClientRectangle,color,false);}
}
sealed class MinecraftSlider : Control {
    int selected=6;
    public int Minimum {get{return 2;}} public int Maximum {get{return 24;}}
    public event EventHandler ValueChanged;
    public int Value {get{return selected;}set{int next=Math.Max(Minimum,Math.Min(Maximum,value));if(next==selected)return;selected=next;Invalidate();if(ValueChanged!=null)ValueChanged(this,EventArgs.Empty);}}
    public MinecraftSlider(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.SupportsTransparentBackColor|ControlStyles.Selectable,true);BackColor=Color.Transparent;TabStop=true;Cursor=Cursors.Hand;AccessibleRole=AccessibleRole.Slider;AccessibleName="Memória do Minecraft em GB";}
    void SelectAt(int x){Value=Minimum+(int)Math.Round((Math.Max(10,Math.Min(Width-10,x))-10)*(double)(Maximum-Minimum)/Math.Max(1,Width-20));}
    protected override void OnMouseDown(MouseEventArgs e){base.OnMouseDown(e);if(Enabled&&e.Button==MouseButtons.Left){Focus();Capture=true;SelectAt(e.X);}}
    protected override void OnMouseMove(MouseEventArgs e){base.OnMouseMove(e);if(Enabled&&Capture)SelectAt(e.X);}
    protected override void OnMouseUp(MouseEventArgs e){base.OnMouseUp(e);Capture=false;}
    internal void VerifyDrag(){int saved=Value;OnMouseDown(new MouseEventArgs(MouseButtons.Left,1,0,Height/2,0));if(Value!=Minimum)throw new Exception("Limite esquerdo incorreto.");OnMouseMove(new MouseEventArgs(MouseButtons.Left,0,Width/2,Height/2,0));if(Value!=13)throw new Exception("Arraste intermediário incorreto.");OnMouseMove(new MouseEventArgs(MouseButtons.Left,0,Width+40,Height/2,0));if(Value!=Maximum)throw new Exception("Limite direito incorreto.");OnMouseUp(new MouseEventArgs(MouseButtons.Left,1,Width,Height/2,0));Value=saved;}
    protected override bool IsInputKey(Keys key){return key==Keys.Left||key==Keys.Right||key==Keys.Home||key==Keys.End||base.IsInputKey(key);}
    protected override void OnKeyDown(KeyEventArgs e){if(e.KeyCode==Keys.Left)Value--;else if(e.KeyCode==Keys.Right)Value++;else if(e.KeyCode==Keys.Home)Value=Minimum;else if(e.KeyCode==Keys.End)Value=Maximum;else{base.OnKeyDown(e);return;}e.Handled=true;}
    protected override void OnPaint(PaintEventArgs e){var g=e.Graphics;int y=Height/2,x=10+(Width-20)*(Value-Minimum)/(Maximum-Minimum);using(var b=new SolidBrush(Color.FromArgb(9,5,16)))g.FillRectangle(b,3,y-4,Width-6,8);using(var b=new SolidBrush(Color.FromArgb(61,28,89)))g.FillRectangle(b,5,y-2,Width-10,4);using(var b=new SolidBrush(Enabled?Color.FromArgb(174,57,243):Color.FromArgb(78,52,96)))g.FillRectangle(b,5,y-2,x-5,4);using(var b=new SolidBrush(Color.FromArgb(10,5,16)))g.FillRectangle(b,x-8,y-13,16,26);using(var b=new SolidBrush(Enabled?Color.FromArgb(145,91,181):Color.FromArgb(63,44,75)))g.FillRectangle(b,x-6,y-11,12,22);using(var b=new SolidBrush(Enabled?Color.FromArgb(218,172,249):Color.FromArgb(96,77,105)))g.FillRectangle(b,x-6,y-11,12,2);using(var b=new SolidBrush(Color.FromArgb(72,34,105)))g.FillRectangle(b,x-6,y+9,12,2);}
}
sealed class SquareRemember : CheckBox {
    public SquareRemember(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer,true);Cursor=Cursors.Hand;}
    protected override void OnPaint(PaintEventArgs e){using(var b=new SolidBrush(BackColor))e.Graphics.FillRectangle(b,ClientRectangle);ChoiceGlyph.Draw(e.Graphics,ClientRectangle,Text,Font,Enabled?ForeColor:Color.FromArgb(93,79,111),Checked,Focused && ShowFocusCues);}
}
static class ChoiceGlyph {
    public static void Draw(Graphics g,Rectangle bounds,string text,Font font,Color color,bool selected,bool focus){int y=(bounds.Height-16)/2;g.SmoothingMode=SmoothingMode.None;using(var b=new SolidBrush(Color.FromArgb(19,11,30)))g.FillRectangle(b,2,y,16,16);using(var p=new Pen(color,2))g.DrawRectangle(p,3,y+1,14,14);if(selected)using(var b=new SolidBrush(Color.FromArgb(207,93,255)))g.FillRectangle(b,7,y+5,6,6);PixelText.Draw(g,text,font,new Rectangle(29,0,bounds.Width-30,bounds.Height),color,false);if(focus)ControlPaint.DrawFocusRectangle(g,new Rectangle(25,3,bounds.Width-28,bounds.Height-6));}
}
sealed class BlockButton : Button {
    bool hover,pressed;
    public bool Borderless {get;set;}
    public BlockButton() {SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer,true);FlatStyle=FlatStyle.Flat;FlatAppearance.BorderSize=0;Cursor=Cursors.Hand;Font=MinecraftFont.Make(11);}
    protected override void OnMouseEnter(EventArgs e){hover=true;Invalidate();base.OnMouseEnter(e);}
    protected override void OnMouseLeave(EventArgs e){hover=pressed=false;Invalidate();base.OnMouseLeave(e);}
    protected override void OnMouseDown(MouseEventArgs e){pressed=true;Invalidate();base.OnMouseDown(e);}
    protected override void OnMouseUp(MouseEventArgs e){pressed=false;Invalidate();base.OnMouseUp(e);}
    protected override void OnPaint(PaintEventArgs e) {
        var g=e.Graphics;var area=ClientRectangle;var fill=Enabled?(hover?ControlPaint.Light(BackColor,.10f):BackColor):Color.FromArgb(41,38,46);
        if(Borderless){PixelText.Draw(g,Text,Font,area,hover?Color.FromArgb(235,183,255):ForeColor,true);return;}
        using(var b=new SolidBrush(Color.FromArgb(8,7,11)))g.FillRectangle(b,area);
        using(var b=new SolidBrush(fill))g.FillRectangle(b,2,2,Width-4,Height-4);
        using(var b=new SolidBrush(pressed?ControlPaint.Dark(fill,.3f):ControlPaint.Light(fill,.16f)))g.FillRectangle(b,2,2,Width-4,pressed?4:2);
        using(var b=new SolidBrush(ControlPaint.Dark(fill,.45f)))g.FillRectangle(b,2,Height-6,Width-4,4);
        PixelText.Draw(g,Text,Font,new Rectangle(2,pressed?3:0,Width-4,Height-3),Enabled?ForeColor:Color.FromArgb(123,118,133),true);
        if(Focused && ShowFocusCues)ControlPaint.DrawFocusRectangle(g,new Rectangle(6,6,Width-12,Height-13),ForeColor,fill);
    }
}

sealed class LauncherForm : Form {
    readonly Engine engine=new Engine();
    TextBox nick;Label ram,status,nickLabel,accountNote;BlockButton play;TextAction official,reset;MinecraftSlider memorySlider;ProgressBar progress;SquareChoice nicknameMode,microsoftMode;CheckBox remember;FloatingLogo floatingLogo;
    int mode=0,memoryGb=6,gamePid;bool busy;Image logo;
    readonly Color ink=Color.FromArgb(246,228,255),muted=Color.FromArgb(170,147,189),purple=Color.FromArgb(158,43,232),stone=Color.FromArgb(39,20,60),cardColor=Color.FromArgb(25,13,39);
    string Settings {get{return Path.Combine(engine.Root,"launcher-settings.json");}}
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr handle,int attribute,ref int value,int size);
    [DllImport("user32.dll")] static extern bool ReleaseCapture();
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr handle,int message,IntPtr wparam,IntPtr lparam);
    public LauncherForm() {
        Text="Hollow SMP";Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);ClientSize=new Size(860,484);FormBorderStyle=FormBorderStyle.None;MaximizeBox=false;StartPosition=FormStartPosition.CenterScreen;
        BackColor=Color.FromArgb(22,11,34);ForeColor=ink;Font=MinecraftFont.Make(10);DoubleBuffered=true;AutoScaleMode=AutoScaleMode.None;
        MouseDown+=(s,e)=>{if(e.Button==MouseButtons.Left && e.Y<65){ReleaseCapture();SendMessage(Handle,0xA1,new IntPtr(2),IntPtr.Zero);}};
        using(var stream=typeof(LauncherForm).Assembly.GetManifestResourceStream("HollowLogo.png"))using(var original=Image.FromStream(stream))logo=new Bitmap(original);
        var minimize=LinkAt(this,"-",777,10,34,32);minimize.Font=MinecraftFont.Make(15);minimize.Click+=(s,e)=>WindowState=FormWindowState.Minimized;
        var close=LinkAt(this,"x",814,10,34,32);close.Font=MinecraftFont.Make(15);close.Click+=(s,e)=>Close();
        reset=LinkAt(this,"Resetar",643,10,119,32);reset.Click+=async(s,e)=>await Reset();
        floatingLogo=new FloatingLogo{Image=logo,Location=new Point(455,58),Size=new Size(355,355)};Controls.Add(floatingLogo);
        Resize+=(s,e)=>floatingLogo.Animate(WindowState!=FormWindowState.Minimized);
        LabelAt(this,"HOLLOW LAUNCHER",70,116,380,48,22,true,Color.FromArgb(226,144,255));
        nickLabel=LabelAt(this,"",70,164,324,18,9,true,muted);
        var input=new Panel{Location=new Point(70,195),Size=new Size(308,47),BackColor=Color.FromArgb(16,7,26)};Controls.Add(input);
        nick=new TextBox{Location=new Point(16,12),Size=new Size(276,24),BorderStyle=BorderStyle.None,Font=MinecraftFont.Make(12),BackColor=input.BackColor,ForeColor=ink,MaxLength=16,Text="Aventureiro"};input.Controls.Add(nick);
        accountNote=LabelAt(input,"Conta Microsoft",16,0,276,47,12,false,muted);accountNote.Visible=false;
        nicknameMode=new SquareChoice{Text="Nickname",Location=new Point(676,405),Size=new Size(164,31),ForeColor=muted,Font=MinecraftFont.Make(10)};
        microsoftMode=new SquareChoice{Text="Microsoft",Location=new Point(676,441),Size=new Size(164,31),ForeColor=muted,Font=MinecraftFont.Make(10)};
        Controls.Add(nicknameMode);Controls.Add(microsoftMode);
        nicknameMode.Click+=(s,e)=>{if(!busy){mode=0;RefreshMode();}};microsoftMode.Click+=(s,e)=>{if(!busy){mode=1;RefreshMode();}};
        LabelAt(this,"MEMÓRIA",70,352,94,30,10,true,muted);
        ram=LabelAt(this,"6 GB",307,352,71,30,10,true,muted);ram.TextAlign=ContentAlignment.MiddleRight;
        memorySlider=new MinecraftSlider{Location=new Point(70,382),Size=new Size(308,30)};Controls.Add(memorySlider);
        memorySlider.ValueChanged+=(s,e)=>{memoryGb=memorySlider.Value;ram.Text=memoryGb+" GB";};
        play=ButtonAt(this,"INSTALAR E JOGAR",70,264,308,50,purple);play.ForeColor=ink;play.Font=MinecraftFont.Make(12);play.Click+=async(s,e)=>await Play();AcceptButton=play;
        remember=new SquareRemember{Text="Lembrar nickname",Checked=true,Location=new Point(70,322),Size=new Size(308,28),BackColor=Color.FromArgb(24,12,36),ForeColor=muted,FlatStyle=FlatStyle.Flat,Font=MinecraftFont.Make(10)};Controls.Add(remember);
        official=LinkAt(this,"Baixar launcher oficial",70,421,308,28);official.Visible=false;official.Click+=(s,e)=>Open("https://www.minecraft.net/download");
        status=LabelAt(this,"",70,451,583,27,9,false,muted);status.AutoEllipsis=true;
        progress=new ProgressBar{Location=new Point(70,444),Size=new Size(583,3),Style=ProgressBarStyle.Marquee,Visible=false};Controls.Add(progress);
        engine.Report=s=>{if(!IsDisposed && IsHandleCreated)BeginInvoke((Action)(()=>status.Text=busy?s:""));};
        try{if(File.Exists(Settings)){var saved=Engine.Read(Settings);nick.Text=(string)saved["nickname"];memoryGb=Math.Max(2,Math.Min(24,Convert.ToInt32(saved["ram"])));mode=Convert.ToInt32(saved["mode"])==1?1:0;if(saved.ContainsKey("remember"))remember.Checked=Convert.ToBoolean(saved["remember"]);}}catch{}
        RefreshMode();RefreshMemory();
        FormClosing+=(s,e)=>{if(busy){e.Cancel=true;status.Text="Aguarde a preparação terminar para fechar.";return;}Engine.Write(Settings,new {nickname=remember.Checked?nick.Text:"",ram=memoryGb,mode=mode,remember=remember.Checked});};
    }
    protected override void OnHandleCreated(EventArgs e){base.OnHandleCreated(e);try{int dark=1;DwmSetWindowAttribute(Handle,20,ref dark,4);}catch{}}
    internal void PreviewMicrosoft(){mode=1;RefreshMode();}
    internal void VerifyTypographyAndMotion(string output){if(!Font.Bold||!nick.Font.Bold||!play.Font.Bold)throw new Exception("Peso da fonte incorreto.");if(play.Left!=70||memorySlider.Left!=70||remember.Left!=70||play.Width!=308||memorySlider.Width!=308)throw new Exception("Elementos desalinhados.");floatingLogo.VerifyMotion();File.AppendAllText(output,"\nFonte negrito incorporada: OK\nMargens e larguras alinhadas: OK\nAnimação ativa e contida na área da logo: OK");}
    internal void VerifyMemory(string output){memorySlider.VerifyDrag();if(memoryGb!=memorySlider.Value||ram.Text!=memoryGb+" GB")throw new Exception("Valor da memória não acompanha a barra.");File.AppendAllText(output,"\nArraste da memória (2, 13 e 24 GB): OK\nValor exibido e selecionado sincronizados: OK");}
    internal void VerifySelectors(string output){mode=0;RefreshMode();for(int i=0;i<8;i++){microsoftMode.PerformClick();if(mode!=1||nicknameMode.Checked||!microsoftMode.Checked||nick.Visible||!accountNote.Visible)throw new Exception("Seleção Microsoft inconsistente.");nicknameMode.PerformClick();if(mode!=0||!nicknameMode.Checked||microsoftMode.Checked||!nick.Visible||accountNote.Visible)throw new Exception("Seleção Nickname inconsistente.");}bool saved=remember.Checked;remember.Checked=!saved;if(remember.Checked==saved)throw new Exception("Checkbox não alterna.");remember.Checked=saved;File.WriteAllText(output,"16 trocas entre modos: OK\nEstado exclusivo e campo correspondente: OK\nCheckbox de nickname: OK\nFonte embutida: "+Font.FontFamily.Name);}
    void RefreshMode(){nicknameMode.Checked=mode==0;microsoftMode.Checked=mode==1;nick.Visible=mode==0;nick.Enabled=!busy && mode==0;accountNote.Visible=mode==1;remember.Enabled=mode==0;nickLabel.Text="";official.Visible=mode==1;RefreshButton();}
    void RefreshMemory(){memorySlider.Value=memoryGb;memorySlider.Enabled=!busy;ram.Text=memoryGb+" GB";}
    void RefreshButton(){if(!busy)play.Text=engine.Ready?(mode==0?"JOGAR":"ABRIR MINECRAFT"):"INSTALAR E JOGAR";}
    async Task Play(){
        if(busy)return;string player=nick.Text.Trim();int selectedRam=memoryGb;bool microsoft=mode==1;
        if(!microsoft && !Regex.IsMatch(player,"^[A-Za-z0-9_]{3,16}$")){LauncherDialog.Show(this,"Use um nickname de 3 a 16 letras, números ou _.","Nickname");return;}
        if(gamePid!=0){try{Process.GetProcessById(gamePid);LauncherDialog.Show(this,"O Minecraft já está aberto.");return;}catch{gamePid=0;}}
        busy=true;official.Visible=false;play.Text="PREPARANDO...";reset.Enabled=remember.Enabled=play.Enabled=nicknameMode.Enabled=microsoftMode.Enabled=nick.Enabled=false;progress.Visible=true;RefreshMemory();
        try{
            if(!engine.Ready)await Task.Run(async()=>await engine.Install());
            if(microsoft){await Task.Run(()=>engine.RegisterOfficial(selectedRam));engine.OpenOfficial();status.Text="No launcher oficial, selecione Hollow SMP e clique em Jogar.";}
            else gamePid=await Task.Run(()=>engine.LaunchOffline(player,selectedRam));
        }catch(Exception ex){ShowError(ex);}
        finally{FinishPreparation();}
    }
    async Task Reset(){
        if(busy)return;
        if(gamePid!=0){try{using(var game=Process.GetProcessById(gamePid))if(!game.HasExited){LauncherDialog.Show(this,"Feche o Minecraft antes de resetar.");return;}}catch(ArgumentException){gamePid=0;}}
        if(!LauncherDialog.Confirm(this,"Apagar a instalação local do Hollow?\n\nIsso remove mods, configurações, mundos salvos, screenshots e preferências. Não há como desfazer.\n\nO launcher vai baixar a base do jogo novamente. Ao entrar no servidor, o AutoModpack baixa o modpack.\n\nFeche o Minecraft antes de continuar.","Resetar Hollow"))return;
        busy=true;official.Visible=false;play.Text="RESETANDO...";reset.Enabled=remember.Enabled=play.Enabled=nicknameMode.Enabled=microsoftMode.Enabled=nick.Enabled=false;progress.Visible=true;RefreshMemory();
        try{
            await Task.Run(()=>engine.ResetInstallation());
            gamePid=0;mode=0;memoryGb=6;remember.Checked=true;nick.Text="Aventureiro";
            play.Text="PREPARANDO...";await Task.Run(async()=>await engine.Install());
            LauncherDialog.Show(this,"Instalação renovada. Clique em Jogar e entre no servidor para receber o modpack.","Reset concluído");
        }catch(Exception ex){ShowError(ex);}finally{FinishPreparation();}
    }
    void FinishPreparation(){busy=false;status.Text="";reset.Enabled=play.Enabled=nicknameMode.Enabled=microsoftMode.Enabled=true;progress.Visible=false;RefreshMode();RefreshMemory();}
    void ShowError(Exception ex){try{Directory.CreateDirectory(engine.Root);File.WriteAllText(Path.Combine(engine.Root,"launcher-error.log"),ex.ToString());}catch{}LauncherDialog.Show(this,ex.Message+"\n\nDetalhes: %LOCALAPPDATA%\\HollowSMP\\launcher-error.log");}
    Label LabelAt(Control parent,string text,int x,int y,int width,int height,float size,bool block,Color color){var l=new PixelLabel{Text=text,Location=new Point(x,y),Size=new Size(width,height),ForeColor=color,BackColor=Color.Transparent,Font=MinecraftFont.Make(size),UseCompatibleTextRendering=true};parent.Controls.Add(l);return l;}
    BlockButton ButtonAt(Control parent,string text,int x,int y,int width,int height,Color bg){var b=new BlockButton{Text=text,Location=new Point(x,y),Size=new Size(width,height),BackColor=bg,ForeColor=ink};parent.Controls.Add(b);return b;}
    TextAction LinkAt(Control parent,string text,int x,int y,int width,int height){var b=new TextAction{Text=text,Location=new Point(x,y),Size=new Size(width,height),ForeColor=muted,Font=MinecraftFont.Make(9)};parent.Controls.Add(b);return b;}
    static void Open(string target){Process.Start(new ProcessStartInfo(target){UseShellExecute=true});}
    protected override void Dispose(bool disposing){if(disposing && logo!=null){logo.Dispose();logo=null;}base.Dispose(disposing);}
    protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);var g=e.Graphics;
        using(var gradient=new LinearGradientBrush(ClientRectangle,Color.FromArgb(19,10,29),Color.FromArgb(38,16,57),25))g.FillRectangle(gradient,ClientRectangle);
        var random=new Random(37);for(int i=0;i<130;i++){int x=random.Next(430,860),y=random.Next(484);using(var b=new SolidBrush(Color.FromArgb(random.Next(8,24),195,98,244)))g.FillRectangle(b,x,y,1,1);}
        using(var glow=new GraphicsPath()){glow.AddEllipse(441,42,391,381);using(var b=new PathGradientBrush(glow)){b.CenterColor=Color.FromArgb(32,201,44,240);b.SurroundColors=new[]{Color.FromArgb(0,201,44,240)};g.FillPath(b,glow);}}
        using(var p=new Pen(Color.FromArgb(60,26,82)))g.DrawRectangle(p,0,0,Width-1,Height-1);
    }
}
}
