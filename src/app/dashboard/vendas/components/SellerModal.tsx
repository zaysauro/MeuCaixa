"use client";

import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { POSSeller } from "@/lib/pos/types";

type Props = {
  organizationId: string;
  selectedId: string | null;
  onSelect: (seller: POSSeller) => void;
  onClose: () => void;
};

export default function SellerModal({ organizationId, selectedId, onSelect, onClose }: Props) {
  const [sellers, setSellers] = useState<POSSeller[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("search_pos_sellers", {
        p_organization_id: organizationId,
      });
      if (cancelled) return;
      if (rpcError) setError(rpcError.message);
      else setSellers((data ?? []) as POSSeller[]);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [organizationId]);

  return (
    <div className="pos-modal-backdrop" onMouseDown={onClose}>
      <div className="pos-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="pos-modal-header">
          <div><span className="eyebrow">VENDEDOR</span><h2>Selecionar vendedor</h2></div>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        {loading && <div className="pos-suggestion-empty">Carregando vendedores...</div>}
        {error && <div className="error">{error}</div>}
        {!loading && !error && (
          <div className="pos-customer-results">
            {sellers.map((seller) => (
              <button key={seller.user_id} type="button" className="pos-customer-result"
                onClick={() => { onSelect(seller); onClose(); }}>
                <UserRound size={18} />
                <span><strong>{seller.full_name}</strong><small>{seller.role}</small></span>
                {seller.user_id === selectedId && <b>Selecionado</b>}
              </button>
            ))}
            {!sellers.length && <div className="pos-suggestion-empty">Nenhum vendedor cadastrado.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
