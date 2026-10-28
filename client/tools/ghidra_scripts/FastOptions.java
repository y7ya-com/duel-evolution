// Pre-script: skip the slow decompiler-driven analyzers; we only need functions, refs, RTTI.
import ghidra.app.script.GhidraScript;
public class FastOptions extends GhidraScript {
    @Override public void run() throws Exception {
        setAnalysisOption(currentProgram, "Decompiler Parameter ID", "false");
        setAnalysisOption(currentProgram, "Decompiler Switch Analysis", "true");
        setAnalysisOption(currentProgram, "Stack", "false");
    }
}
