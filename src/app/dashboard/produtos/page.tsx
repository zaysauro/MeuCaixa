"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BarcodeScanner from "@/components/BarcodeScanner";
import Link from "next/link";
import { Upload } from "lucide-react";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  cost_price: number;
  sale_price: number;
  stock_quantity: number;
  minimum_stock: number;
  active: boolean;
  supplier_id: string | null;
};

const UNITS = [
  { value: "UN", label: "Unidade (UN)" },
  { value: "KG", label: "Quilograma (KG)" },
  { value: "G", label: "Grama (G)" },
  { value: "L", label: "Litro (L)" },
  { value: "ML", label: "Mililitro (ML)" },
  { value: "CX", label: "Caixa (CX)" },
  { value: "PC", label: "Peça (PC)" },
  { value: "DZ", label: "Dúzia (DZ)" },
  { value: "M", label: "Metro (M)" },
  { value: "M2", label: "Metro quadrado (M²)" },
  { value: "M3", label: "Metro cúbico (M³)" },
];

const numberBR = (value: string) => {
  const clean = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
};

const moneyBR = (value: string) => numberBR(value);

const formatMoney = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);

const formatQuantity = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 3,
  }).format(Number(value) || 0);

const formatInputMoney = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatInputQuantity = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 3,
  }).format(Number(value) || 0);

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [unit, setUnit] = useState("UN");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [minimumStock, setMinimumStock] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editCost, setEditCost] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editName, setEditName] = useState("");
  const [editSku, setEditSku] = useState("");
  const [editBarcode, setEditBarcode] = useState("");
  const [editUnit, setEditUnit] = useState("UN");
  const [editStock, setEditStock] = useState("");
  const [editMinimumStock, setEditMinimumStock] = useState("");
  const [scannerTarget, setScannerTarget] = useState<"new" | "edit" | null>(null);
  const [duplicateProduct, setDuplicateProduct] = useState<Product | null>(null);
  const supabase = createClient();

  async function load() {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id,name,sku,barcode,unit,cost_price,sale_price,stock_quantity,minimum_stock,active"
      )
      .eq("active", true)
      .order("name");

    if (error) setMessage(error.code === "23505" || error.message.includes("product_barcode_already_exists") ? "Este código de barras já está cadastrado em outro produto." : error.message);
    else setProducts((data ?? []) as Product[]);
  }

  useEffect(() => {
    load();
    const incomingBarcode=searchParams.get("barcode");
    if(incomingBarcode){setBarcode(incomingBarcode);setMessage("Código lido no estoque. Cadastre o novo produto para continuar.");}
  }, []);

  function resetForm() {
    setName("");
    setSku("");
    setBarcode("");
    setUnit("UN");
    setCost("");
    setPrice("");
    setStock("");
    setMinimumStock("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setDuplicateProduct(null);

    const { data: org } = await supabase.rpc("get_my_organization");
    const organization_id = org?.[0]?.organization_id;

    if (!organization_id) {
      setMessage("Empresa não configurada.");
      setLoading(false);
      return;
    }

    if (barcode.trim()) {
      const { data: existing } = await supabase.from("products").select("id,name,sku,barcode,unit,cost_price,sale_price,stock_quantity,minimum_stock,active,supplier_id").eq("organization_id", organization_id).eq("active", true).ilike("barcode", barcode.trim()).maybeSingle();
      if (existing) {
        setDuplicateProduct(existing as Product);
        setMessage("Este código já está vinculado a outro produto.");
        setLoading(false);
        return;
      }
    }

    const { error } = await supabase.from("products").insert({
      organization_id,
      name: name.trim(),
      sku: sku.trim() || null,
      barcode: barcode.trim() || null,
      unit,
      cost_price: moneyBR(cost),
      sale_price: moneyBR(price),
      stock_quantity: numberBR(stock),
      minimum_stock: numberBR(minimumStock),
    });

    if (error) setMessage(error.message);
    else {
      resetForm();
      await load();
      setMessage("Produto cadastrado com sucesso.");
    }

    setLoading(false);
  }

  function startEdit(product: Product) {
    setEditing(product);
    setEditName(product.name);
    setEditSku(product.sku ?? "");
    setEditBarcode(product.barcode ?? "");
    setEditUnit(product.unit);
    setEditCost(formatInputMoney(product.cost_price));
    setEditPrice(formatInputMoney(product.sale_price));
    setEditStock(formatInputQuantity(product.stock_quantity));
    setEditMinimumStock(formatInputQuantity(product.minimum_stock));
    setMessage("");
  }

  function cancelEdit() {
    setEditing(null);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;

    setSavingEdit(true);
    setMessage("");

    const nextStock = numberBR(editStock);

    const { error } = await supabase
      .from("products")
      .update({
        name: editName.trim(),
        sku: editSku.trim() || null,
        barcode: editBarcode.trim() || null,
        unit: editUnit,
        cost_price: moneyBR(editCost),
        sale_price: moneyBR(editPrice),
        stock_quantity: nextStock,
        minimum_stock: numberBR(editMinimumStock),
      })
      .eq("id", editing.id);

    if (error) {
      setMessage(error.code === "23505" || error.message.includes("product_barcode_already_exists") ? "Este código de barras já está cadastrado em outro produto." : error.message);
    } else {
      setEditing(null);
      await load();
      setMessage("Produto atualizado. A alteração foi registrada no histórico.");
    }

    setSavingEdit(false);
  }

  async function deleteProduct(product: Product) {
    const confirmed = window.confirm(
      'Excluir "' +
        product.name +
        '"? O produto será retirado do catálogo, mas todo o histórico será preservado. Esta ação não apaga os registros operacionais.'
    );

    if (!confirmed) return;

    setLoading(true);
    setMessage("");

    const { error } = await supabase
      .from("products")
      .update({ active: false })
      .eq("id", product.id);

    if (error) {
      setMessage(error.message);
    } else {
      await load();
      setMessage("Produto excluído do catálogo. O histórico foi preservado.");
    }

    setLoading(false);
  }

  const activeCount = useMemo(() => products.length, [products]);

  async function handleScannerResult(value: string) {
    setBarcode(value);
    setMessage(`Código detectado: ${value}. Verificando cadastro...`);
    const { data: org } = await supabase.rpc("get_my_organization");
    const organizationId = org?.[0]?.organization_id;
    if (!organizationId) return;
    const { data: existing } = await supabase.from("products").select("id,name,sku,barcode,unit,cost_price,sale_price,stock_quantity,minimum_stock,active,supplier_id").eq("organization_id", organizationId).eq("active", true).ilike("barcode", value).maybeSingle();
    if (existing) {
      setDuplicateProduct(existing as Product);
      setMessage(`Este código de barras já está cadastrado: ${existing.name}.`);
    } else {
      setDuplicateProduct(null);
      setMessage(`Código detectado: ${value}. Este código ainda não está vinculado a um produto.`);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <span className="eyebrow">CATÁLOGO</span>
          <h1>Produtos</h1>
          <p>
            Cadastre, edite e controle os produtos da empresa em reais e nas
            unidades corretas.
          </p>
        </div>
        <Link className="button secondary" href="/dashboard/produtos/importar"><Upload size={15} /> Importar CSV</Link>
      </div>

      <div className="panel">
        <h2>Novo produto</h2>
        <p className="product-form-note">
          Valores monetários em BRL. Digite, por exemplo, <strong>12,50</strong>{" "}
          para R$ 12,50.
        </p>

        <form className="form-grid product-form" onSubmit={submit}>
          <label>
            Nome do produto
            <input
              className="field"
              placeholder="Ex.: Arroz 5 kg"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>

          <label>
            SKU
            <input
              className="field"
              placeholder="Código interno"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
          </label>

          <label>
            Código de barras
            <input
              className="field"
              placeholder="Código único na empresa"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
            />
            <button type="button" className="button secondary" onClick={() => setScannerTarget("new")}>Ler com câmera</button>
          </label>

          <label>
            Unidade
            <select
              className="field"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            >
              {UNITS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Preço de custo
            <input
              className="field"
              inputMode="decimal"
              placeholder="0,00"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </label>

          <label>
            Preço de venda
            <input
              className="field"
              inputMode="decimal"
              placeholder="0,00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </label>

          <label>
            Estoque inicial
            <input
              className="field"
              inputMode="decimal"
              placeholder="0"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </label>

          <label>
            Avisar quando estoque chegar a
            <input className="field" inputMode="decimal" placeholder="Ex.: 5" value={minimumStock} onChange={(e) => setMinimumStock(e.target.value)} />
            <small>Quando o saldo chegar neste valor ou abaixo, o sistema avisará que está na hora de repor.</small>
          </label>

          <div className="product-form-action">
            <button className="button primary" disabled={loading}>
              {loading ? "Salvando..." : "Cadastrar produto"}
            </button>
          </div>
        </form>

        {message && <div className={message.includes("sucesso") || message.includes("preservado") || message.includes("atualizado") ? "success" : "error"}>{message}</div>}
        {duplicateProduct && <div className="product-form-action"><button type="button" className="button secondary" onClick={() => startEdit(duplicateProduct)}>Abrir produto existente</button><a className="button secondary" href="/dashboard/estoque">Adicionar estoque</a></div>}
      </div>

      {editing && (
        <div className="panel product-edit-panel">
          <div className="product-edit-header">
            <div>
              <span className="eyebrow">EDIÇÃO</span>
              <h2>Editando produto</h2>
              <p>Alterações de cadastro e estoque ficam registradas no histórico operacional.</p>
            </div>
            <button className="button secondary" type="button" onClick={cancelEdit}>
              Cancelar
            </button>
          </div>

          <form className="form-grid product-form" onSubmit={saveEdit}>
            <label>
              Nome do produto
              <input className="field" value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </label>

            <label>
              SKU
              <input className="field" value={editSku} onChange={(e) => setEditSku(e.target.value)} />
            </label>

            <label>
              Código de barras
              <input className="field" value={editBarcode} onChange={(e) => setEditBarcode(e.target.value)} />
              <button type="button" className="button secondary" onClick={() => setScannerTarget("edit")}>Ler com câmera</button>
            </label>

            <label>
              Unidade
              <select className="field" value={editUnit} onChange={(e) => setEditUnit(e.target.value)}>
                {UNITS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Preço de custo
              <input className="field" inputMode="decimal" value={editCost} onChange={(e) => setEditCost(e.target.value)} required />
            </label>

            <label>
              Preço de venda
              <input className="field" inputMode="decimal" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} required />
            </label>

            <label>
              Estoque
              <input className="field" inputMode="decimal" value={editStock} onChange={(e) => setEditStock(e.target.value)} />
            </label>

            <label>
              Avisar quando estoque chegar a
              <input className="field" inputMode="decimal" value={editMinimumStock} onChange={(e) => setEditMinimumStock(e.target.value)} />
              <small>Alerta de reposição deste produto.</small>
            </label>

            <div className="product-form-action">
              <button className="button primary" disabled={savingEdit}>
                {savingEdit ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="panel">
        <div className="products-list-header">
          <div>
            <h2>
              Produtos cadastrados <span className="count">{activeCount}</span>
            </h2>
            <p>Produtos excluídos permanecem no histórico operacional.</p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>SKU</th>
                <th>Custo</th>
                <th>Venda</th>
                <th>Estoque</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    <small>{p.barcode || "Sem código de barras"}</small>
                  </td>
                  <td>{p.sku || "—"}</td>
                  <td>{formatMoney(p.cost_price)}</td>
                  <td>{formatMoney(p.sale_price)}</td>
                  <td
                    className={
                      Number(p.stock_quantity) <= Number(p.minimum_stock)
                        ? "low-stock"
                        : ""
                    }
                  >
                    {formatQuantity(p.stock_quantity)} {p.unit}
                  </td>
                  <td>
                    <div className="product-actions">
                      <button className="button secondary compact-button" type="button" onClick={() => startEdit(p)}>
                        Editar
                      </button>
                      <button className="button danger compact-button" type="button" onClick={() => deleteProduct(p)}>
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!products.length && (
                <tr>
                  <td colSpan={6}>Nenhum produto cadastrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {scannerTarget && <BarcodeScanner onClose={() => setScannerTarget(null)} onDetected={(value) => { setScannerTarget(null); if (scannerTarget === "new") void handleScannerResult(value); else setEditBarcode(value); }} />}
    </div>
  );
}
