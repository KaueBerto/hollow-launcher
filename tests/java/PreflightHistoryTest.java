import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import pl.skidam.automodpack_core.config.*;
import pl.skidam.automodpack_core.modpack.generation.*;
import pl.skidam.automodpack_core.modpack.group.*;
import pl.skidam.automodpack_core.update.*;
import pl.skidam.automodpack_core.utils.HashUtils;
public final class PreflightHistoryTest {
 static ModpackJsons.CompleteModpackContentFields policy(String path) {
  var f=new ModpackJsons.CompleteModpackContentFields();f.modpackId="hollow1";f.modpackName="Test";
  var g=new ModpackJsons.CompleteModpackContentFields.ModpackGroupFields();g.required=true;g.defaultSelected=true;
  g.files=Map.of(path,new ModpackJsons.CompleteModpackContentFields.GroupFileFields("1","mod",false,"a".repeat(40),null));
  f.categories=Map.of("Base",Map.of("base",g));return f;
 }
 static String put(ClientStorage s,Object f)throws Exception {
  byte[] bytes=ConfigTools.COMPACT.toJson(f).getBytes(java.nio.charset.StandardCharsets.UTF_8);
  String hash=HashUtils.sha1(bytes);Path p=s.objectFile(hash);Files.createDirectories(p.getParent());Files.write(p,bytes);return hash;
 }
 static void rejected(Throwing f)throws Exception {try{f.run();}catch(java.io.IOException expected){return;}throw new AssertionError("Unsafe fallback was accepted");}
 interface Throwing {void run()throws Exception;}
 public static void main(String[] args)throws Exception {
  Path game=Path.of(args[0]);ClientStorage s=ClientStorage.open(game);
  var old=GroupManifestValidator.validate(policy("mods/old.jar"));var next=GroupManifestValidator.validate(policy("mods/new.jar"));
  String oldHash=put(s,policy("mods/old.jar")),headHash=put(s,policy("mods/new.jar"));
  var first=new JournalEntry(1,ContentTree.tokenOf(old),oldHash,Instant.EPOCH,"",-1,List.of());
  var gap=new JournalEntry(2,"b".repeat(40),"c".repeat(40),Instant.EPOCH,"",-1,List.of());
  var head=new JournalEntry(3,ContentTree.tokenOf(next),headHash,Instant.EPOCH,"",-1,List.of());
  Path mirror=s.historyJournalFile("hollow1");Files.createDirectories(mirror.getParent());var journal=Journal.open(mirror);journal.append(first);journal.append(gap);journal.append(head);
  s.writeActiveState("hollow1",first.contentToken(),OwnershipLedger.materialize(OwnershipLedger.empty("hollow1"),old).toFields());
  var store=new ClientGenerationStore(s);
  rejected(()->store.document("hollow1",head));
  System.setProperty("hollow.preflight.game",game.toString());
  var recovered=store.document("hollow1",head);
  if(recovered.ownershipLedger().entries().get("mods/old.jar").currentStatus()!=OwnershipLedger.Status.TOMBSTONE)throw new AssertionError("Old mod ownership was lost");
  if(recovered.ownershipLedger().entries().get("mods/new.jar").currentStatus()!=OwnershipLedger.Status.PRESENT)throw new AssertionError("New mod not present");
  s.writeActiveState("hollow1",head.contentToken(),recovered.ownershipLedger().toFields());
  rejected(()->store.document("hollow1",gap));
  rejected(()->store.document("other01",head));
  System.out.println("Java: forward history gap recovered; removed mods tracked; backwards and foreign fallback rejected");
 }
}
