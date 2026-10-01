export type POSProduct = {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  unit: string;
  sale_price: number;
  cost_price: number;
  stock_quantity: number;
  minimum_stock: number;
};

export type POSCustomer = {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
};

export type DiscountType = "none" | "amount" | "percent";

export type CartItem = {
  product: POSProduct;
  quantity: number;
  discountType: DiscountType;
  discountValue: number;
};

export type PaymentMethod =
  | "cash"
  | "pix"
  | "credit_card"
  | "debit_card"
  | "other";

export type PaymentInput = {
  method: PaymentMethod;
  amount: number;
  /**
   * Valor recebido fisicamente pelo operador.
   * Usado para calcular troco; o valor enviado à venda é "amount".
   */
  receivedAmount?: number;
};

export type SaleItemInput = {
  product_id: string;
  quantity: number;
  discount_type: DiscountType;
  discount_value: number;
};

export type SaleResult = {
  saleId: string;
  total: number;
  subtotal: number;
  discount: number;
  change: number;
};

export type POSBranch = {
  organization_id: string;
  organization_name: string;
  branch_id: string;
  branch_name: string;
  role: string;
};

export type POSOrganization = {
  organization_id: string;
  organization_name: string;
  branch_id: string | null;
  branch_name: string | null;
  role: string;
};
