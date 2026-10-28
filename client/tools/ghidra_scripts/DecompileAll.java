// Post-script: decompile every real function (no thunks, no Unwind@/Catch@ stubs) into <outdir>/<addr>.c.
// Resumable: skips files that exist. Writes <outdir>/DONE at the end. args: <outdir>
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.Function;
import java.io.*;
public class DecompileAll extends GhidraScript {
    @Override public void run() throws Exception {
        File dir = new File(getScriptArgs()[0]);
        dir.mkdirs();
        DecompInterface d = new DecompInterface();
        d.openProgram(currentProgram);
        int done = 0, failed = 0, skipped = 0;
        for (Function f : currentProgram.getListing().getFunctions(true)) {
            if (f.isThunk() || f.isExternal() || f.getName().startsWith("Unwind@") || f.getName().startsWith("Catch@")) continue;
            File out = new File(dir, String.format("%08x.c", f.getEntryPoint().getOffset()));
            if (out.exists()) { skipped++; continue; }
            DecompileResults r = d.decompileFunction(f, 30, monitor);
            try (PrintWriter w = new PrintWriter(new FileWriter(out))) {
                if (r.decompileCompleted()) w.println(r.getDecompiledFunction().getC());
                else { w.println("// decompile failed: " + r.getErrorMessage()); failed++; }
            }
            if (++done % 500 == 0) { println("decompiled " + done); d.flushCache(); }
        }
        d.dispose();
        try (PrintWriter w = new PrintWriter(new FileWriter(new File(dir, "DONE")))) {
            w.println("done=" + done + " failed=" + failed + " skipped=" + skipped);
        }
        println("decompiled " + done + ", failed " + failed + ", skipped " + skipped);
    }
}
