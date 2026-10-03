"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Barcode, Search } from "lucide-react";
import { findProductByCode, searchProducts } from "@/lib/pos/products";
import type { POSProduct } from "@/lib/pos/types";
import BarcodeScanner from "@/components/BarcodeScanner";

export type ProductSearchHandle = { focus: () => void };
type Props = { branchId: string; onAdd: (product: POSProduct, quantity?: number) => void; onError: (message: string) => void };

function parseScannerInput(value: string) {
  const match = value.trim().match(/^(\d+)\s*\*\s*(.+)$/);
  if (!match) return { quantity: 1, query: value.trim() };
  const quantity = Number(match[1]);
  return { quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1, query: match[2].trim() };
}

const ProductSearch = forwardRef<ProductSearchHandle, Props>(function ProductSearch({ branchId, onAdd, onError }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<POSProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [camera, setCamera] = useState(false);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));
  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const value = query.trim();
    if (!value) { setSuggestions([]); return; }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const parsed = parseScannerInput(value);
        setSuggestions(await searchProducts(branchId, parsed.query, 8));
      } catch (error) {
        onError(error instanceof Error ? error.message : "Erro ao buscar produtos.");
      } finally { setLoading(false); }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [branchId, query, onError]);

  async function handleEnter() {
    const value = query.trim();
    if (!value) return;
    const parsed = parseScannerInput(value);
    setLoading(true);
    onError("");
    try {
      const exact = await findProductByCode(branchId, parsed.query);
      const product = exact ?? suggestions[0];
      if (!product) { onError("Produto não encontrado."); return; }
      if (product.stock_quantity <= 0) { onError("Produto sem estoque nesta filial."); return; }
      onAdd(product, parsed.quantity);
      setQuery(""); setSuggestions([]);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Não foi possível buscar o produto.");
    } finally { setLoading(false); }
  }

  return (
    <div className="pos-search-wrap">
      <div className="pos-search-box">
        <Search size={20} />
        <input ref={inputRef} value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); void handleEnter(); }
            if (event.key === "Escape") { setQuery(""); setSuggestions([]); inputRef.current?.focus(); }
          }}
          placeholder="Código de barras, SKU ou nome do produto" autoComplete="off" aria-label="Buscar produto" />
        <button type="button" className="pos-search-hint" onClick={() => setCamera(true)} title="Ler com a câmera"><Barcode size={15} /> Câmera</button>
      </div>
      {(loading || suggestions.length > 0) && (
        <div className="pos-suggestions">
          {loading && <div className="pos-suggestion-empty">Buscando...</div>}
          {!loading && suggestions.map((product) => (
            <button key={product.id} type="button" className="pos-suggestion"
              onClick={() => { onAdd(product, 1); setQuery(""); setSuggestions([]); window.setTimeout(() => inputRef.current?.focus(), 0); }}>
              <span><strong>{product.name}</strong><small>{product.barcode || product.sku || "Sem código"} · estoque {product.stock_quantity}</small></span>
              <b>R$ {product.sale_price.toFixed(2).replace(".", ",")}</b>
            </button>
          ))}
        </div>
      )}
      {camera && <BarcodeScanner onClose={() => setCamera(false)} onDetected={(value) => { setCamera(false); setQuery(value); window.setTimeout(() => void handleEnter(), 0); }} />}
    </div>
  );
});
export default ProductSearch;
