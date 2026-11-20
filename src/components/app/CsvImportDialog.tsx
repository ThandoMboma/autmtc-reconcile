import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { downloadCsv, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, parseCsv, previewRows, type PreviewRow } from "@/lib/domain/csv";
import { guessMapping, type ImportSchema } from "@/lib/domain/import-schemas";
import { cn } from "@/lib/utils";

type Step = "upload" | "map" | "done";
const NONE = "__none";

export function CsvImportDialog<T>({
  open,
  onOpenChange,
  schema,
  existingKeys,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schema: ImportSchema<T>;
  existingKeys: Set<string>;
  onImport: (items: T[]) => { added: number; skipped: number };
}) {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [grid, setGrid] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [result, setResult] = useState<{ added: number; skipped: number; invalid: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("upload");
    setFileName("");
    setGrid([]);
    setMapping({});
    setFileError(null);
    setErrorsOnly(false);
    setResult(null);
  }

  async function handleFile(file: File) {
    setFileError(null);
    if (file.size > MAX_IMPORT_BYTES) return setFileError("This file is larger than 5 MB. Split it into smaller statements and import each one.");
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) return setFileError("Choose a .csv, .tsv or .txt file exported from your bank or accounting system.");
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) return setFileError("The file needs a header row and at least one data row.");
      if (rows.length - 1 > MAX_IMPORT_ROWS) return setFileError(`This file has ${rows.length - 1} rows; the limit is ${MAX_IMPORT_ROWS.toLocaleString()} per import.`);
      setFileName(file.name);
      setGrid(rows);
      setMapping(guessMapping(rows[0] ?? [], schema.fields));
      setStep("map");
    } catch (e) {
      setFileError(`We couldn't read this file. ${(e as Error).message}`);
    }
  }

  const header = grid[0] ?? [];
  const missingRequired = schema.fields.filter((f) => f.required && mapping[f.key] == null);
  const mappingError = missingRequired.length
    ? `Map the required field${missingRequired.length > 1 ? "s" : ""}: ${missingRequired.map((f) => f.label).join(", ")}.`
    : schema.validateMapping?.(mapping) ?? null;

  const preview = useMemo(() => {
    if (!grid.length || mappingError) return null;
    try {
      const rows = previewRows(grid, mapping, schema.validate);
      const batch = Date.now().toString(36);
      let duplicates = 0;
      const seen = new Set(existingKeys);
      const annotated = rows.map((r, i) => {
        if (r.errors.length) return { ...r, duplicate: false, item: null as T | null };
        const item = schema.build(r.values, batch, i);
        const key = schema.duplicateKey(item);
        const duplicate = seen.has(key);
        if (duplicate) duplicates++;
        seen.add(key);
        return { ...r, duplicate, item };
      });
      const invalid = annotated.filter((r) => r.errors.length).length;
      return { rows: annotated, invalid, valid: annotated.length - invalid - duplicates, duplicates, error: null as string | null };
    } catch (e) {
      return { rows: [], invalid: 0, valid: 0, duplicates: 0, error: (e as Error).message };
    }
  }, [grid, mapping, mappingError, schema, existingKeys]);

  const shown = (preview?.rows ?? []).filter((r) => !errorsOnly || r.errors.length || r.duplicate).slice(0, 200);

  function confirm() {
    if (!preview) return;
    const items = preview.rows.filter((r) => !r.errors.length && !r.duplicate && r.item).map((r) => r.item as T);
    const out = onImport(items);
    setResult({ added: out.added, skipped: out.skipped + preview.duplicates, invalid: preview.invalid });
    setStep("done");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setTimeout(reset, 200);
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden p-0">
        <div className="flex max-h-[92vh] flex-col">
          <DialogHeader className="border-b border-border px-6 py-5">
            <div className="eyebrow">CSV import · Step {step === "upload" ? 1 : step === "map" ? 2 : 3} of 3</div>
            <DialogTitle className="font-serif text-xl">{schema.title}</DialogTitle>
            <DialogDescription>
              {step === "upload" && "Upload a CSV export. Nothing is imported until you review and confirm the rows."}
              {step === "map" && `Match the columns in ${fileName} to AUTMTC Reconcile fields, then review the validated rows.`}
              {step === "done" && "Import finished."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step === "upload" && (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const f = e.dataTransfer.files[0];
                    if (f) void handleFile(f);
                  }}
                  className={cn(
                    "flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-muted/50 px-6 py-14 text-center transition-colors hover:bg-accent/60",
                    dragging && "border-info bg-info-soft",
                  )}
                >
                  <div className="flex size-11 items-center justify-center rounded-full bg-card text-info shadow-sm">
                    <Upload className="size-5" />
                  </div>
                  <div className="mt-4 text-sm font-semibold">Drop a CSV file here, or click to browse</div>
                  <div className="mt-1 text-xs text-muted-foreground">Comma, semicolon or tab separated · up to 5 MB · {MAX_IMPORT_ROWS.toLocaleString()} rows</div>
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                    e.target.value = "";
                  }}
                />
                {fileError && (
                  <div className="flex items-start gap-2 rounded-md bg-destructive-soft px-3 py-2.5 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" /> {fileError}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3">
                  <div className="text-xs text-muted-foreground">
                    Dates: <span className="font-medium text-foreground">YYYY-MM-DD</span> or <span className="font-medium text-foreground">DD/MM/YYYY</span>. Amounts in ZAR, e.g. <span className="font-figure text-foreground">1 234,56</span> or <span className="font-figure text-foreground">1234.56</span>.
                  </div>
                  <Button variant="outline" size="sm" onClick={() => downloadCsv(`${schema.id}-template.csv`, schema.template)}>
                    <Download /> Download template
                  </Button>
                </div>
              </div>
            )}

            {step === "map" && (
              <div className="space-y-6">
                <div>
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <FileSpreadsheet className="size-4 text-info" /> Column mapping
                    <span className="font-normal text-muted-foreground">· {grid.length - 1} data rows found</span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {schema.fields.map((f) => (
                      <div key={f.key} className="rounded-md border border-border p-3">
                        <div className="mb-1.5 flex items-center justify-between text-xs">
                          <span className="font-medium">{f.label}</span>
                          {f.required ? <span className="text-destructive">Required</span> : <span className="text-muted-foreground">Optional</span>}
                        </div>
                        <Select
                          value={mapping[f.key] != null ? String(mapping[f.key]) : NONE}
                          onValueChange={(v) =>
                            setMapping((m) => {
                              const next = { ...m };
                              if (v === NONE) delete next[f.key];
                              else next[f.key] = Number(v);
                              return next;
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs" aria-label={`Column for ${f.label}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>— Not mapped —</SelectItem>
                            {header.map((h, i) => (
                              <SelectItem key={i} value={String(i)}>
                                {h || `Column ${i + 1}`} <span className="text-muted-foreground">· e.g. {grid[1]?.[i] || "—"}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {f.hint && <div className="mt-1.5 text-[11px] text-muted-foreground">{f.hint}</div>}
                      </div>
                    ))}
                  </div>
                </div>

                {mappingError || preview?.error ? (
                  <div className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2.5 text-sm text-warning">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" /> {mappingError ?? preview?.error}
                  </div>
                ) : (
                  preview && (
                    <div>
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">Review</span>
                        <Badge variant="success">{preview.valid} ready to import</Badge>
                        {preview.invalid > 0 && <Badge variant="danger">{preview.invalid} with errors</Badge>}
                        {preview.duplicates > 0 && <Badge variant="warning">{preview.duplicates} already in workspace</Badge>}
                        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                          <Switch checked={errorsOnly} onCheckedChange={setErrorsOnly} /> Show only rows needing attention
                        </label>
                      </div>
                      <div className="overflow-x-auto rounded-md border border-border">
                        <table className="w-full text-xs">
                          <thead className="bg-muted text-left text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 font-medium">Row</th>
                              {schema.fields.filter((f) => mapping[f.key] != null).map((f) => (
                                <th key={f.key} className="px-3 py-2 font-medium">{f.label}</th>
                              ))}
                              <th className="px-3 py-2 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {shown.map((r: PreviewRow & { duplicate: boolean }) => (
                              <tr key={r.record} className={cn("border-t border-border", r.errors.length && "bg-destructive-soft/50")}>
                                <td className="px-3 py-2 font-figure text-muted-foreground">{r.record}</td>
                                {schema.fields.filter((f) => mapping[f.key] != null).map((f) => (
                                  <td key={f.key} className="max-w-[220px] truncate px-3 py-2">{r.values[f.key]}</td>
                                ))}
                                <td className="px-3 py-2">
                                  {r.errors.length ? (
                                    <div className="space-y-0.5 text-destructive">{r.errors.map((e) => <div key={e}>{e}</div>)}</div>
                                  ) : r.duplicate ? (
                                    <span className="text-warning">Already imported — will be skipped</span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="size-3.5" /> Valid</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                            {!shown.length && (
                              <tr><td colSpan={99} className="px-3 py-6 text-center text-muted-foreground">No rows to show.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      {(preview.rows.length > shown.length) && (
                        <div className="mt-2 text-[11px] text-muted-foreground">Showing {shown.length} of {preview.rows.length} rows. Counts above cover the whole file.</div>
                      )}
                    </div>
                  )
                )}
              </div>
            )}

            {step === "done" && result && (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
                  <CheckCircle2 className="size-6" />
                </div>
                <div className="mt-4 font-serif text-xl">{result.added} row{result.added === 1 ? "" : "s"} imported</div>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  {result.skipped > 0 && `${result.skipped} duplicate${result.skipped === 1 ? " was" : "s were"} skipped. `}
                  {result.invalid > 0 && `${result.invalid} row${result.invalid === 1 ? "" : "s"} with errors ${result.invalid === 1 ? "was" : "were"} not imported. `}
                  New receipts appear in Reconciliation as suggestions only — nothing is marked as paid until you approve it.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border bg-muted/40 px-6 py-4">
            {step === "map" && (
              <>
                <Button variant="ghost" onClick={reset}>Choose another file</Button>
                <Button onClick={confirm} disabled={!preview || !!preview.error || preview.valid === 0}>
                  Import {preview?.valid ?? 0} valid row{preview?.valid === 1 ? "" : "s"}
                </Button>
              </>
            )}
            {step === "upload" && <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>}
            {step === "done" && <Button onClick={() => { onOpenChange(false); setTimeout(reset, 200); }}>Done</Button>}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
