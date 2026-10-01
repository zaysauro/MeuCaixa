export type ReceiptItem = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
};

export type ReceiptPayment = {
  id: string;
  method: "cash" | "pix" | "credit_card" | "debit_card" | "other";
  amount: number;
  received_amount: number | null;
  change_amount: number;
};

export type ReceiptSettings = {
  width: "80mm" | "58mm";
  footer_text: string;
  show_cnpj: boolean;
  show_address: boolean;
  show_seller: boolean;
  show_customer: boolean;
  auto_print: boolean;
  logo_url: string | null;
};

export type SaleReceiptData = {
  sale: {
    id: string;
    sale_number: number;
    organization_id: string;
    branch_id: string;
    status: "completed" | "cancelled";
    subtotal: number;
    discount: number;
    total: number;
    created_at: string;
    organization_name: string | null;
    branch_name: string | null;
    branch_code: string | null;
    address_line: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
    phone: string | null;
    seller_name: string | null;
    customer_name: string | null;
    customer_document: string | null;
    customer_phone: string | null;
  };
  items: ReceiptItem[];
  payments: ReceiptPayment[];
  settings: ReceiptSettings;
};

export type ReceiptLogType = "original" | "reprint" | "preview" | "pdf" | "share";
