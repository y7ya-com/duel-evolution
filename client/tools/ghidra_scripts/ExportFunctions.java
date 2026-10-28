// Post-script: one JSON line per function: addr, size, name, namespace, thunk, callers, callees, referenced strings.
import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;
import ghidra.program.model.address.*;
import ghidra.program.model.data.StringDataInstance;
import java.io.*;
import java.util.*;
public class ExportFunctions extends GhidraScript {
    static String esc(String s) {
        StringBuilder b = new StringBuilder();
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20 || c > 0x7e) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.toString();
    }
    @Override public void run() throws Exception {
        String out = getScriptArgs()[0];
        Listing listing = currentProgram.getListing();
        ReferenceManager refs = currentProgram.getReferenceManager();
        try (PrintWriter w = new PrintWriter(new FileWriter(out))) {
            for (Function f : listing.getFunctions(true)) {
                AddressSetView body = f.getBody();
                Set<String> strs = new TreeSet<>();
                for (Address a : refs.getReferenceSourceIterator(body, true)) {
                    for (Reference r : refs.getReferencesFrom(a)) {
                        Data d = listing.getDataAt(r.getToAddress());
                        if (d != null && d.hasStringValue() && strs.size() < 12) {
                            Object v = d.getValue();
                            if (v != null) strs.add(v.toString().length() > 120 ? v.toString().substring(0, 120) : v.toString());
                        }
                    }
                }
                StringBuilder callees = new StringBuilder();
                for (Function c : f.getCalledFunctions(monitor)) callees.append(callees.length() > 0 ? "," : "").append('"').append(c.getEntryPoint()).append('"');
                int callers = f.getCallingFunctions(monitor).size();
                StringBuilder s = new StringBuilder();
                for (String x : strs) s.append(s.length() > 0 ? "," : "").append('"').append(esc(x)).append('"');
                w.printf("{\"a\":\"%s\",\"size\":%d,\"name\":\"%s\",\"ns\":\"%s\",\"thunk\":%b,\"callers\":%d,\"callees\":[%s],\"strings\":[%s]}%n",
                    f.getEntryPoint(), body.getNumAddresses(), esc(f.getName()), esc(f.getParentNamespace().getName(true)),
                    f.isThunk(), callers, callees, s);
            }
        }
        println("exported to " + out);
    }
}
