// Post-script (run -readOnly): create functions at the given addresses in memory only, decompile them.
// args: <file with hex addresses, one per line> <outdir>. Writes <outdir>/<addr>.c and <outdir>/sizes.tsv
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.address.*;
import ghidra.program.model.listing.Function;
import java.io.*;
import java.nio.file.*;
public class DecompileAt extends GhidraScript {
    @Override public void run() throws Exception {
        String[] a = getScriptArgs();
        File dir = new File(a[1]); dir.mkdirs();
        DecompInterface d = new DecompInterface();
        d.openProgram(currentProgram);
        PrintWriter sz = new PrintWriter(new FileWriter(new File(dir, "sizes.tsv")));
        for (String line : Files.readAllLines(Paths.get(a[0]))) {
            line = line.trim(); if (line.isEmpty()) continue;
            Address ad = toAddr(Long.parseLong(line, 16));
            Function f = getFunctionAt(ad);
            if (f == null) { disassemble(ad); f = createFunction(ad, null); }
            if (f == null) { sz.println(line + "\t-1"); continue; }
            sz.println(line + "\t" + f.getBody().getNumAddresses());
            DecompileResults r = d.decompileFunction(f, 30, monitor);
            try (PrintWriter w = new PrintWriter(new FileWriter(new File(dir, String.format("%08x.c", ad.getOffset()))))) {
                if (r.decompileCompleted()) w.println(r.getDecompiledFunction().getC());
                else w.println("// decompile failed: " + r.getErrorMessage());
            }
        }
        sz.close(); d.dispose();
    }
}
