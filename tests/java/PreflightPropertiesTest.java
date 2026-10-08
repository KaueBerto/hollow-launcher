import java.nio.file.*;import java.util.*;
import pl.skidam.automodpack_core.update.*;
import pl.skidam.automodpack_core.utils.HashUtils;
public final class PreflightPropertiesTest {
 public static void main(String[] args)throws Exception {
  Path game=Path.of(args[0]);System.setProperty("hollow.preflight.game",game.toString());ClientStorage storage=ClientStorage.open(game);
  var method=ReviewedUpdatePlan.class.getDeclaredMethod("sameProjected",List.class,List.class);method.setAccessible(true);
  String[] values={"# old timestamp\nsensitivity=0.5\nkey.jump=SPACE\n","# new timestamp\nkey.jump=SPACE\nsensitivity=0.5\n","# changed value\nkey.jump=SPACE\nsensitivity=0.9\n"};
  var rows=new ArrayList<UpdatePlan.ProjectedFile>();
  for(String text:values){byte[] data=text.getBytes(java.nio.charset.StandardCharsets.ISO_8859_1);String sha=HashUtils.sha1(data);Path object=storage.objectFile(sha);Files.createDirectories(object.getParent());Files.write(object,data);rows.add(new UpdatePlan.ProjectedFile(UpdatePlan.Root.GAME_DIR,"config/test.properties",true,sha,data.length));}
  if(!(boolean)method.invoke(null,List.of(rows.get(0)),List.of(rows.get(1))))throw new AssertionError("Comments were not equivalent");
  if((boolean)method.invoke(null,List.of(rows.get(0)),List.of(rows.get(2))))throw new AssertionError("Changed preference was accepted");
  var foreign=new UpdatePlan.ProjectedFile(UpdatePlan.Root.PROJECTION,"config/test.properties",true,rows.get(1).expectedHash(),rows.get(1).expectedSize());
  if((boolean)method.invoke(null,List.of(rows.get(0)),List.of(foreign)))throw new AssertionError("Changed root accepted");
  System.out.println("Java: timestamp-only changes accepted; real settings and root changes rejected");
 }
}
