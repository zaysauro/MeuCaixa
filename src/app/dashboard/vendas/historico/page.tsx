"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, History, RotateCcw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSalesHistory, type SalesHistoryRow } from "@/lib/receipt/history";

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function date(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function VendasHistoricoPage() {
  const router = useRouter();
  const params = useSearchParams();
  const branchId = params.get("branch");
  const [rows, setRows] = useState<SalesHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await getSalesHistory({ branchId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o histórico.");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="page sales-history-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">VENDAS</span>
          <h1>Histórico</h1>
          <p>Consulte vendas e reabra o comprovante salvo no banco.</p>
        </div>
        <button className="button secondary" type="button" onClick={() => router.push("/dashboard/vendas")}>
          Nova venda
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="panel sales-history-panel">
        {loading ? (
          <div className="empty-state">Carregando histórico...</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <History size={30} />
            <strong>Nenhuma venda encontrada</strong>
            <span>As vendas concluídas aparecerão aqui.</span>
          </div>
        ) : (
          <div className="sales-history-list">
            {rows.map((sale) => (
              <button
                key={sale.sale_id}
                className="sales-history-row"
                type="button"
                onClick={() =>
                  router.push(
                    "/dashboard/vendas?receipt=" +
                      encodeURIComponent(sale.sale_id) +
                      (branchId ? "&branch=" + encodeURIComponent(branchId) : "")
                  )
                }
              >
                <span className="sales-history-main">
                  <strong>#{String(sale.sale_number).padStart(6, "0")}</strong>
                  <small>{date(sale.created_at)} · {sale.branch_name ?? "Filial"}</small>
                </span>
                <span className="sales-history-customer">
                  {sale.customer_name ?? "Consumidor final"}
                  <small>{sale.seller_name ?? "Operador"}</small>
                </span>
                <span className={"sales-history-status " + sale.status}>
                  {sale.status === "cancelled" ? "CANCELADA" : "CONCLUÍDA"}
                </span>
                <strong className="sales-history-total">{money(sale.total)}</strong>
                <Eye size={17} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sales-history-footer">
        <RotateCcw size={15} />
        <span>O comprovante histórico é reconstruído a partir dos dados gravados na venda.</span>
      </div>
    </div>
  );
}
