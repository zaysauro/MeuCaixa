import { ImageResponse } from "next/og";

export const alt = "MeuCaixa — venda, estoque e caixa em um só sistema";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ background: "#111714", color: "white", width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, fontFamily: "Arial" }}>
      <div style={{ color: "#72d495", fontSize: 30, fontWeight: 700 }}>Kumo · MeuCaixa</div>
      <div style={{ fontSize: 72, fontWeight: 800, marginTop: 28 }}>Venda, estoque e caixa</div>
      <div style={{ fontSize: 42, color: "#dbe4de", marginTop: 12 }}>em um só sistema.</div>
      <div style={{ fontSize: 28, color: "#aab5af", marginTop: 44 }}>A partir de R$ 59,90 por mês.</div>
    </div>,
    { ...size },
  );
}
