"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Printer, RotateCcw, Store } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import ProductSearch, { type ProductSearchHandle } from "./components/ProductSearch";
import Cart from "./components/Cart";
import SaleSummary from "./components/SaleSummary";
import DiscountModal from "./components/DiscountModal";
import CustomerModal from "./components/CustomerModal";
import SellerModal from "./components/SellerModal";
import PaymentModal from "./components/PaymentModal";
import SaleReceipt from "./components/SaleReceipt";
import { usePOSShortcuts } from "./hooks/usePOSShortcuts";
import { getCartTotals, completePOSSale } from "@/lib/pos/sales";
import { getPOSOrganization } from "@/lib/pos/customers";
import type { CartItem, POSBranch, POSCustomer, POSProduct, PaymentInput, POSSeller } from "@/lib/pos/types";
import { createClient } from "@/lib/supabase/client";

function money(value: number) {
  return "R$ " + value.toFixed(2).replace(".", ",");
}

export default function VendasPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const searchBranch = searchParams.get("branch");
  const searchRef = useRef<ProductSearchHandle>(null);

  const [organizationId, setOrganizationId] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [branches, setBranches] = useState<POSBranch[]>([]);
  const [branchId, setBranchId] = useState(searchBranch || "");
  const [branchName, setBranchName] = useState("");
  const [sellerName, setSellerName] = useState("Usuário atual");
  const [seller, setSeller] = useState<POSSeller | null>(null);
  const [sellerOpen, setSellerOpen] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<POSCustomer | null>(null);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [customerOpen, setCustomerOpen] = useState(false);
  const [globalDiscountOpen, setGlobalDiscountOpen] = useState(false);
  const [itemDiscountId, setItemDiscountId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPayments, setPendingPayments] = useState<PaymentInput[]>([]);
  const [completed, setCompleted] = useState<{
    saleId: string;
    total: number;
    subtotal: number;
    discount: number;
    change: number;
    payments: PaymentInput[];
  } | null>(null);

  const totals = useMemo(() => getCartTotals(cart, globalDiscount), [cart, globalDiscount]);

  const loadPOS = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const [org, branchesResult, userResult] = await Promise.all([
        getPOSOrganization(),
        supabase.rpc("get_my_branches"),
        supabase.auth.getUser(),
      ]);

      if (branchesResult.error) throw new Error(branchesResult.error.message);

      const rows = (branchesResult.data ?? []) as POSBranch[];
      setOrganizationId(org.organizationId);
      setOrganizationName(org.organizationName);
      setBranches(rows);

      const wanted = searchBranch ? rows.find((branch) => branch.branch_id === searchBranch) : undefined;
      const selected = wanted ?? rows.find((branch) => branch.branch_id === org.branchId) ?? rows[0];

      if (!selected) throw new Error("Nenhuma filial disponível para este usuário.");

      setBranchId(selected.branch_id);
      setBranchName(selected.branch_name);

      const user = userResult.data.user;
      setSellerName(
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        user?.email ||
        "Usuário atual"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o PDV.");
    } finally {
      setLoading(false);
    }
  }, [searchBranch]);

  useEffect(() => { void loadPOS(); }, [loadPOS]);

  function addProduct(product: POSProduct, quantity = 1) {
    setError("");
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) {
        const next = Math.min(existing.quantity + quantity, product.stock_quantity);
        return current.map((item) => item.product.id === product.id ? { ...item, quantity: next } : item);
      }
      return [...current, { product, quantity: Math.min(quantity, product.stock_quantity), discountType: "none", discountValue: 0 }];
    });
  }

  function updateQuantity(id: string, quantity: number) {
    setCart((current) => {
      if (quantity <= 0) return current.filter((item) => item.product.id !== id);
      return current.map((item) =>
        item.product.id === id
          ? { ...item, quantity: Math.min(quantity, item.product.stock_quantity) }
          : item
      );
    });
    setError("");
  }

  function removeItem(id: string) {
    const item = cart.find((entry) => entry.product.id === id);
    if (!item) return;
    if (!window.confirm("Remover " + item.product.name + " da venda?")) return;
    setCart((current) => current.filter((entry) => entry.product.id !== id));
  }

  function updateItemDiscount(id: string, type: "none" | "amount" | "percent", value: number) {
    setCart((current) => current.map((item) =>
      item.product.id === id ? { ...item, discountType: type, discountValue: value } : item
    ));
    setItemDiscountId(null);
  }

  function openPayment() {
    if (!cart.length) {
      setError("Adicione pelo menos um produto antes de finalizar.");
      searchRef.current?.focus();
      return;
    }
    setError("");
    setPaymentOpen(true);
  }

  function handlePayment(payments: PaymentInput[]) {
    setPendingPayments(payments);
    setPaymentOpen(false);
    setConfirmOpen(true);
  }

  async function confirmSale() {
    setSaving(true);
    setError("");
    try {
      const result = await completePOSSale({
        branchId,
        items: cart,
        payments: pendingPayments,
        customer,
        globalDiscount,
      });

      setCompleted({ ...result, payments: pendingPayments });
      setConfirmOpen(false);
      setCart([]);
      setCustomer(null);
      setGlobalDiscount(0);
      setPendingPayments([]);
    } catch (err) {
      setConfirmOpen(false);
      setError(err instanceof Error ? err.message : "Não foi possível concluir a venda.");
    } finally {
      setSaving(false);
    }
  }

  function newSale() {
    setCompleted(null);
    setError("");
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  function handleEscape() {
    if (confirmOpen) { setConfirmOpen(false); return; }
    if (paymentOpen) { setPaymentOpen(false); return; }
    if (customerOpen) { setCustomerOpen(false); return; }
    if (globalDiscountOpen) { setGlobalDiscountOpen(false); return; }
    if (itemDiscountId) { setItemDiscountId(null); return; }
    searchRef.current?.focus();
  }

  function changeBranch(id: string) {
    const branch = branches.find((item) => item.branch_id === id);
    if (!branch) return;
    setBranchId(id);
    setBranchName(branch.branch_name);
    setCart([]);
    setCustomer(null);
    setGlobalDiscount(0);
    setError("");
    router.replace("/dashboard/vendas?branch=" + encodeURIComponent(id));
  }

  usePOSShortcuts({
    onSearch: () => searchRef.current?.focus(),
    onCustomer: () => setCustomerOpen(true),
    onDiscount: () => { if (cart.length) setGlobalDiscountOpen(true); },
    onPayment: openPayment,
    onEscape: handleEscape,
    onConfirm: openPayment,
  });

  if (loading) {
    return <div className="page"><div className="panel pos-loading">Carregando ponto de venda...</div></div>;
  }

  if (completed) {
    return (
      <div className="page pos-page">
        <div className="pos-completed">
          <div className="pos-completed-icon"><CheckCircle2 size={42} /></div>
          <span className="eyebrow">VENDA CONCLUÍDA</span>
          <h1>Venda registrada</h1>
          <p>Venda #{completed.saleId.slice(0, 8).toUpperCase()} registrada com sucesso.</p>
          <div className="completed-total">{money(completed.total)}</div>
          <div className="completed-grid">
            <div><small>Subtotal</small><strong>{money(completed.subtotal)}</strong></div>
            <div><small>Descontos</small><strong>{money(completed.discount)}</strong></div>
            <div><small>Troco</small><strong>{money(completed.change)}</strong></div>
          </div>
          <div className="completed-actions">
            <button className="button secondary" type="button" onClick={() => window.print()}><Printer size={17} /> Imprimir / PDF</button>
            <button className="button primary" type="button" onClick={newSale}><RotateCcw size={17} /> Nova venda</button>
          </div>
          <SaleReceipt
            saleId={completed.saleId}
            total={completed.total}
            subtotal={completed.subtotal}
            discount={completed.discount}
            payments={completed.payments}
            change={completed.change}
            companyName={organizationName}
            branchName={branchName}
          />
        </div>
      </div>
    );
  }

  const itemDiscount = itemDiscountId ? cart.find((item) => item.product.id === itemDiscountId) : null;

  return (
    <div className="page pos-page">
      <div className="pos-header">
        <div>
          <span className="eyebrow">PONTO DE VENDA</span>
          <h1>Vendas</h1>
          <p>PDV rápido para balcão, loja e caixa.</p>
        </div>
        <div className="pos-branch-control">
          <Store size={17} />
          <select value={branchId} onChange={(event) => changeBranch(event.target.value)}>
            {branches.map((branch) => <option key={branch.branch_id} value={branch.branch_id}>{branch.branch_name}</option>)}
          </select>
        </div>
      </div>

      <div className="pos-layout">
        <main className="pos-main">
          <ProductSearch ref={searchRef} branchId={branchId} onAdd={addProduct} onError={setError} />
          {error && <div className="error pos-error">{error}</div>}
          <Cart items={cart} onQuantity={updateQuantity} onRemove={removeItem}
            onDiscount={(id, type, value) => setItemDiscountId(id)} />
        </main>

        <section className="pos-side">
          <SaleSummary
            subtotal={totals.subtotal}
            discount={totals.discount}
            total={totals.total}
            customer={customer}
            sellerName={sellerName}
            onCustomer={() => setCustomerOpen(true)}
            onDiscount={() => setGlobalDiscountOpen(true)}
          />
          <button type="button" className="button primary pos-pay-button" disabled={!cart.length || saving} onClick={openPayment}>
            F9 · Receber {money(totals.total)}
          </button>
        </section>
      </div>

      <div className="pos-shortcuts">
        <span><b>F2</b> Buscar</span><span><b>F4</b> Cliente</span><span><b>F8</b> Desconto</span><span><b>F9</b> Pagamento</span><span><b>ESC</b> Voltar</span><span><b>ENTER</b> Confirmar</span>
      </div>

      {sellerOpen && <SellerModal organizationId={organizationId} selectedId={seller?.user_id ?? null} onSelect={(selected) => { setSeller(selected); setSellerName(selected.full_name); }} onClose={() => setSellerOpen(false)} />}
      {customerOpen && <CustomerModal organizationId={organizationId} selected={customer} onSelect={setCustomer} onClose={() => setCustomerOpen(false)} />}
      {globalDiscountOpen && <DiscountModal title="Desconto na venda" initialType="amount" initialValue={globalDiscount} maxAmount={Math.max(totals.subtotal - totals.itemDiscount, 0)} onClose={() => setGlobalDiscountOpen(false)} onConfirm={(type, value) => { setGlobalDiscount(type === "amount" ? value : (totals.subtotal - totals.itemDiscount) * value / 100); setGlobalDiscountOpen(false); }} />}
      {itemDiscount && <DiscountModal title={itemDiscount.product.name} initialType={itemDiscount.discountType} initialValue={itemDiscount.discountValue} maxAmount={itemDiscount.product.sale_price * itemDiscount.quantity} onClose={() => setItemDiscountId(null)} onConfirm={(type, value) => updateItemDiscount(itemDiscount.product.id, type, value)} />}
      {paymentOpen && <PaymentModal total={totals.total} onClose={() => setPaymentOpen(false)} onConfirm={handlePayment} />}

      {confirmOpen && (
        <div className="pos-modal-backdrop">
          <div className="pos-modal confirm-sale-modal">
            <div className="pos-modal-header"><div><span className="eyebrow">CONFIRMAÇÃO</span><h2>Registrar esta venda?</h2></div><button type="button" className="modal-close" onClick={() => setConfirmOpen(false)}>×</button></div>
            <div className="confirm-sale-total">{money(totals.total)}</div>
            <p>{cart.length} produto(s) · {customer?.name ?? "Consumidor final"} · {pendingPayments.length} pagamento(s)</p>
            <div className="actions"><button type="button" className="button secondary" onClick={() => setConfirmOpen(false)}>Voltar</button><button type="button" className="button primary" disabled={saving} onClick={() => void confirmSale()}>{saving ? "Registrando..." : "Confirmar venda · Enter"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
