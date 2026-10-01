import { createClient } from "@/lib/supabase/client";
import type { POSProduct } from "./types";

type ProductRow = {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  unit: string;
  sale_price: number | string;
  cost_price: number | string;
  stock_quantity: number | string;
  minimum_stock: number | string;
};

function normalizeProduct(row: ProductRow): POSProduct {
  return {
    ...row,
    sale_price: Number(row.sale_price),
    cost_price: Number(row.cost_price),
    stock_quantity: Number(row.stock_quantity),
    minimum_stock: Number(row.minimum_stock),
  };
}

export async function searchProducts(
  branchId: string,
  query = "",
  limit = 12
): Promise<POSProduct[]> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("search_pos_products", {
    p_branch_id: branchId,
    p_query: query.trim(),
    p_limit: Math.min(Math.max(limit, 1), 50),
  });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as ProductRow[]).map(normalizeProduct);
}

/**
 * Scanner USB envia código + Enter.
 * Primeiro tenta correspondência exata; se não encontrar, mantém a busca textual.
 */
export async function findProductByCode(
  branchId: string,
  code: string
): Promise<POSProduct | null> {
  const products = await searchProducts(branchId, code.trim(), 10);

  const normalized = code.trim().toLowerCase();

  return (
    products.find(
      (product) =>
        product.barcode?.trim().toLowerCase() === normalized ||
        product.sku?.trim().toLowerCase() === normalized
    ) ?? null
  );
}
