"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function DashboardNav({items}:{items:readonly (readonly [string,string])[]}){
 const pathname=usePathname();
 return <nav>{items.map(([label,href])=>{
  const active=href==="/dashboard"?pathname==="/dashboard":pathname===href||pathname.startsWith(href+"/");
  return <Link href={href} key={href} className={active?"sidebar-nav-active":""} aria-current={active?"page":undefined}>{label}</Link>;
 })}</nav>;
}