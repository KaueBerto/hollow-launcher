package pl.skidam.automodpack_core.client;
import java.nio.file.*;
import java.util.Set;
import pl.skidam.automodpack_core.Constants;
import pl.skidam.automodpack_core.loader.*;
import pl.skidam.automodpack_core.update.*;
public final class HollowPackPreflight {
 public static void main(String[] args) throws Exception {
  if(args.length<1||args.length>2)throw new IllegalArgumentException("Expected game directory and optional reviewed transaction");
  Path game=Path.of(args[0]).toAbsolutePath().normalize();
  Constants.MC_VERSION="1.21.1";Constants.LOADER="neoforge";Constants.LOADER_VERSION="21.1.253";Constants.AM_VERSION="5.0.0-rc.2";
  Constants.LOADER_MANAGER=new LoaderManagerService(){
   public ModPlatform getPlatformType(){return ModPlatform.NEOFORGE;}
   public boolean isModLoaded(String id){throw new UnsupportedOperationException("No game mods are loaded during preflight");}
   public String getLoaderVersion(){return "21.1.253";}
   public EnvironmentType getEnvironmentType(){return EnvironmentType.CLIENT;}
   public boolean isDevelopmentEnvironment(){return false;}
   public String getModVersion(String id){throw new UnsupportedOperationException("No game mods are loaded during preflight");}
  };
  ModpackLoaderService loader=new ModpackLoaderService(){
   public void loadModpack(ModpackLoadRequest request){throw new UnsupportedOperationException("Preflight cannot load Minecraft mods");}
   public Set<String> forceCopyServices(){return Set.of("META-INF/services/net.neoforged.neoforgespi.earlywindow.ImmediateWindowProvider");}
  };
  System.setProperty("hollow.preflight.game",game.toString());
  ClientStorage storage=ClientStorage.open(game);
  Path journal=args.length==2?Path.of(args[1]):storage.transactionFile();
  UpdateTransaction pending=UpdateTransaction.read(journal);
  if(pending==null){System.out.println("HOLLOW_PACK_READY");return;}

  UpdateTransactionExecutor.Execution result=UpdateAttempt.resume(storage,pending,loader,"neoforge");
  if(!result.success())throw new java.io.IOException("Update not applied: "+result.status()+" "+result.message());
  if(Files.exists(storage.transactionFile()))throw new java.io.IOException("Update is still pending");
  System.out.println("HOLLOW_PACK_READY");
 }
}
