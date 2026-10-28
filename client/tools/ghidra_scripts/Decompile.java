// Post-script (run with -process -noanalysis): decompile the functions at the given addresses into one C file.
// args: <out.c> <addr> [addr...]
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.Function;
import java.io.*;
public class Decompile extends GhidraScript {
    @Override public void run() throws Exception {
        String[] args = getScriptArgs();
        DecompInterface d = new DecompInterface();
        d.openProgram(currentProgram);
        try (PrintWriter w = new PrintWriter(new FileWriter(args[0]))) {
            for (int i = 1; i < args.length; i++) {
                Function f = getFunctionAt(toAddr(args[i]));
                if (f == null) { w.println("// no function at " + args[i]); continue; }
                DecompileResults r = d.decompileFunction(f, 60, monitor);
                w.println("// ==== " + f.getEntryPoint() + " " + f.getName(true) + " (" + f.getBody().getNumAddresses() + " bytes)");
                w.println(r.decompileCompleted() ? r.getDecompiledFunction().getC() : "// failed: " + r.getErrorMessage());
            }
        }
        d.dispose();
    }
}
