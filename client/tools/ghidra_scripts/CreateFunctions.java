// Post-script: disassemble and create a function at each address in the given file (one hex address per line).
import ghidra.app.script.GhidraScript;
import ghidra.app.cmd.function.CreateFunctionCmd;
import ghidra.program.model.address.Address;
import java.nio.file.*;
public class CreateFunctions extends GhidraScript {
    @Override public void run() throws Exception {
        int made = 0, had = 0;
        for (String line : Files.readAllLines(Paths.get(getScriptArgs()[0]))) {
            if (line.isBlank()) continue;
            Address a = toAddr(Long.parseLong(line.trim(), 16));
            if (getFunctionContaining(a) != null && getFunctionAt(a) == null) { had++; }
            if (getFunctionAt(a) != null) continue;
            disassemble(a);
            if (new CreateFunctionCmd(a).applyTo(currentProgram, monitor)) made++;
        }
        println("created " + made + " functions; " + had + " addresses were inside existing functions");
        analyzeChanges(currentProgram);
    }
}
