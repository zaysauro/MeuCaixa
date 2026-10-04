"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Alert={branch_id:string;product_id:string;product_name:string;stock_quantity:number;minimum_stock:number;alert_started_at:string};

export default function StockAlertBanner({alerts,organizationId}:{alerts:Alert[];organizationId:string}){
 const [visible,setVisible]=useState(true); const [busy,setBusy]=useState(false); const router=useRouter(); const supabase=createClient();
 if(!visible||!alerts.length)return null;
 async function dismiss(e:React.MouseEvent){
  e.preventDefault();e.stopPropagation();if(busy)return;setBusy(true);
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setBusy(false);return;}
  const rows=alerts.map(a=>({organization_id:organizationId,user_id:user.id,branch_id:a.branch_id,product_id:a.product_id,alert_started_at:a.alert_started_at}));
  const {error}=await supabase.from("stock_alert_dismissals").upsert(rows,{onConflict:"user_id,branch_id,product_id,alert_started_at"});
  if(!error){setVisible(false);router.refresh();}else setBusy(false);
 }
 return <a href="/dashboard/estoque" className="stock-alert-banner">
   <div><strong>Atenção ao estoque</strong><p>{alerts.length} produto(s) chegaram ao limite de reposição ou estão esgotados. Abra o Estoque para conferir o que precisa ser comprado.</p></div>
   <button type="button" className="stock-alert-close" onClick={dismiss} disabled={busy} aria-label="Fechar alerta de estoque"><X size={17}/></button>
 </a>;
}