"use client";

import { Minus, Plus, Trash2, Tag } from "lucide-react";
import type { CartItem, DiscountType } from "@/lib/pos/types";
import { getCartItemDiscount, getCartItemSubtotal, getCartItemTotal } from "@/lib/pos/sales";

type Props = {
  items: CartItem[];
  onQuantity: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
  onDiscount: (id: string, type: DiscountType, value: number) => void;
};
const money = (value: number) => "R$ " + value.toFixed(2).replace(".", ",");

export default function Cart({ items, onQuantity, onRemove, onDiscount }: Props) {
  return (
    <div className="pos-cart">
      <div className="pos-cart-header"><div><span className="eyebrow">ITENS DA VENDA</span><h2>Carrinho</h2></div><span className="pos-count">{items.reduce((n, item) => n + item.quantity, 0)} itens</span></div>
      <div className="pos-cart-list">
        {!items.length && <div className="pos-empty-cart"><span>O carrinho está vazio</span><small>Leia um código ou pesquise um produto.</small></div>}
        {items.map((item) => {
          const subtotal = getCartItemSubtotal(item);
          const discount = getCartItemDiscount(item);
          const total = getCartItemTotal(item);
          return (
            <div className="pos-cart-item" key={item.product.id}>
              <div className="pos-cart-item-main">
                <div><strong>{item.product.name}</strong><small>{money(item.product.sale_price)} / {item.product.unit}</small></div>
                <button type="button" className="icon-button danger-icon" title="Remover item" onClick={() => onRemove(item.product.id)}><Trash2 size={16} /></button>
              </div>
              <div className="pos-cart-item-bottom">
                <div className="qty-control">
                  <button type="button" onClick={() => onQuantity(item.product.id, item.quantity - 1)}><Minus size={14} /></button>
                  <strong>{item.quantity}</strong>
                  <button type="button" disabled={item.quantity >= item.product.stock_quantity} onClick={() => onQuantity(item.product.id, item.quantity + 1)}><Plus size={14} /></button>
                </div>
                <button type="button" className="item-discount-button" onClick={() => {
                  const type = item.discountType === "none" ? "percent" : item.discountType;
                  onDiscount(item.product.id, type, item.discountValue);
                }}><Tag size={13} />{discount > 0 ? "-" + money(discount) : "Desconto"}</button>
                <div className="pos-item-price">{discount > 0 && <small>{money(subtotal)}</small>}<strong>{money(total)}</strong></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
