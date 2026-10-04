"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Download, FileUp, UploadCloud } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { csvValue, parseCsv, type CsvRow } from "@/lib/import/csv";

type Branch = { branch_id: string; branch_name: string; is_headquarters: boolean };
type ImportRow = { name: string; sku?: string; barcode?: string; sale_price?: string; cost_price?: string; stock_quantity?: string; category?: string; unit?: string; description?: string };
const aliases = {
  name: ["nome", "name", "produto", "product"], sku: ["sku", "codigo", "código", "codigo interno", "código interno"], barcode: ["barcode", "ean", "gtin", "codigo de barras", "código de barras"], sale_price: ["preco", "preço", "preco de venda", "preço de venda", "sale_price", "price"], cost_price: ["custo", "preco de custo", "preço de custo", "cost_price"], stock_quantity: ["estoque", "stock", "quantidade", "stock_quantity"], category: ["categoria", "category"], unit: ["unidade", "unit"], description: ["descricao", "descrição", "description"],
} as const;
const decimal = (value: string) => { const normalized = value.trim(); return Number(normalized.includes(",") ? normalized.replace(/\./g, "").replace(",", ".") : normalized); };

export default function ProductImportPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [mapped, setMapped] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [mode, setMode] = useState<"products" | "prices">("products");
  const [updateExisting, setUpdateExisting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const prepare = (input: CsvRow[]) => input.map((row) => Object.fromEntries(Object.entries(aliases).map(([field, fieldAliases]) => [field, csvValue(row, [...fieldAliases])])) as ImportRow);
  const validation = useMemo(() => { const seen = new Set<string>(); return mapped.map((row, index) => { const errors: string[] = []; if (mode === "products" && !row.name?.trim()) errors.push("nome obrigatório"); if (!row.sku?.trim() && !row.barcode?.trim()) errors.push("SKU ou código de barras obrigatório"); const identity = (row.barcode || row.sku || "").trim().toLowerCase(); if (identity && seen.has(identity)) errors.push("duplicado no arquivo"); if (identity) seen.add(identity); for (const field of ["sale_price", "cost_price", "stock_quantity"] as const) { if (row[field] && (!Number.isFinite(decimal(row[field])) || decimal(row[field]) < 0)) errors.push(`${field} inválido`); } return { index, errors }; }); }, [mapped, mode]);
  const validRows = useMemo(() => mapped.filter((_, index) => !validation[index]?.errors.length), [mapped, validation]);

  async function loadBranches() { const { data } = await supabase.rpc("get_my_branches"); const next = (data ?? []) as Branch[]; setBranches(next); if (!branchId && next[0]) setBranchId(next[0].branch_id); }
  async function onFile(file?: File) { if (!file) return; setError(""); if (!file.name.toLowerCase().endsWith(".csv")) { setError("Nesta etapa, importe um arquivo CSV. XLSX será adicionado em uma próxima evolução."); return; } const parsed = parseCsv(await file.text()); setFileName(file.name); setRows(parsed); setMapped(prepare(parsed)); await loadBranches(); }
  async function submit() { if (!branchId) { setError("Selecione a filial que receberá o estoque importado."); return; } if (!validRows.length) { setError("Corrija as linhas inválidas antes de importar."); return; } setBusy(true); setError(""); setMessage(""); const payload = validRows.map((row) => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== "").map(([key, value]) => [key, ["sale_price", "cost_price", "stock_quantity"].includes(key) ? decimal(value as string) : value]))); const { data, error: rpcError } = await supabase.rpc("import_products_batch", { p_branch_id: branchId, p_rows: payload, p_mode: mode, p_update_existing: updateExisting, p_file_name: fileName }); if (rpcError) setError(rpcError.message); else { const result = data as { inserted: number; updated: number; skipped: number; errors: Array<{ line: number; message: string }> }; setMessage(`${result.inserted} inserido(s), ${result.updated} atualizado(s), ${result.skipped} ignorado(s). ${result.errors.length} linha(s) com erro.`); } setBusy(false); }
  function downloadModel() { const content = "nome;sku;barcode;preco_venda;preco_custo;estoque;categoria;unidade;descricao\nCafé 500g;CAF-001;7890000000000;18,90;12,00;10;Mercearia;UN;Produto de exemplo\n"; const url = URL.createObjectURL(new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "modelo-produtos-meucaixa.csv"; anchor.click(); URL.revokeObjectURL(url); }

  return <div className="page"><div className="page-header"><div><Link className="report-link" href="/dashboard/produtos"><ArrowLeft size={15} /> Produtos</Link><span className="eyebrow">CATÁLOGO</span><h1>Importar produtos</h1><p>Importe produtos ou atualize preços em lote. O estoque é lançado na filial escolhida com histórico operacional.</p></div><button className="button secondary" onClick={downloadModel}><Download size={15} /> Baixar modelo CSV</button></div>
    {error && <div className="error">{error}</div>}{message && <div className="success">{message}</div>}
    <div className="panel"><h2><UploadCloud size={19} /> 1. Escolha o arquivo</h2><p>CSV separado por vírgula ou ponto e vírgula. XLSX ainda não está habilitado nesta versão.</p><label className="button secondary"><FileUp size={15} /> Selecionar CSV<input hidden type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} /></label>{fileName && <p><strong>{fileName}</strong> · {rows.length} linha(s) encontrada(s)</p>}</div>
    {mapped.length > 0 && <><div className="panel"><h2>2. Regras da importação</h2><div className="form-grid"><label>Filial do estoque<select className="field" value={branchId} onChange={(e) => setBranchId(e.target.value)}>{branches.map((branch) => <option key={branch.branch_id} value={branch.branch_id}>{branch.is_headquarters ? "Matriz · " : ""}{branch.branch_name}</option>)}</select></label><label>Modo<select className="field" value={mode} onChange={(e) => setMode(e.target.value as "products" | "prices")}><option value="products">Produtos completos</option><option value="prices">Somente preços</option></select></label><label className="report-check"><input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} /> Atualizar produtos existentes</label></div><p>{mode === "prices" ? "Use SKU ou código de barras + preço de venda. Estoque, nome e custo serão preservados." : "Produtos existentes são ignorados por padrão; marque atualizar para alterar cadastro e preço."}</p></div><div className="panel"><h2>3. Revisão</h2><p>{validRows.length} linha(s) pronta(s) · {validation.filter((item) => item.errors.length).length} com erro</p><div className="report-table-wrap"><table className="report-table"><thead><tr><th>Linha</th><th>Nome</th><th>SKU / EAN</th><th>Preço</th><th>Estoque</th><th>Validação</th></tr></thead><tbody>{mapped.slice(0, 100).map((row, index) => <tr key={index}><td>{index + 2}</td><td>{row.name || "—"}</td><td>{row.sku || row.barcode || "—"}</td><td>{row.sale_price || "—"}</td><td>{row.stock_quantity || "—"}</td><td>{validation[index]?.errors.length ? validation[index].errors.join(", ") : "OK"}</td></tr>)}</tbody></table></div><button className="button primary" onClick={() => void submit()} disabled={busy || !validRows.length}>{busy ? "Importando..." : `Importar ${validRows.length} linha(s)`}</button></div></>}
  </div>;
}
