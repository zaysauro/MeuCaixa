"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export default function BarcodeScanner({ onDetected, onClose }: { onDetected: (value: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [message, setMessage] = useState("Aponte a câmera para o código de barras.");
  useEffect(() => {
    let timer = 0;
    let detector: any = null;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) { setMessage("Este navegador não permite acesso à câmera. Digite o código manualmente."); return; }
      try {
        stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
        if (video.current) video.current.srcObject = stream.current;
        if (!("BarcodeDetector" in window)) { setMessage("A leitura automática não está disponível neste navegador. Digite o código manualmente."); return; }
        const Detector = (window as Window & { BarcodeDetector: any }).BarcodeDetector;
        detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"] });
        const scan = async () => { if (video.current && detector) { const hits = await detector.detect(video.current); if (hits[0]?.rawValue) { onDetected(hits[0].rawValue); return; } } timer = window.setTimeout(scan, 250); };
        timer = window.setTimeout(scan, 500);
      } catch { setMessage("Não foi possível abrir a câmera. Confira a permissão ou digite o código manualmente."); }
    }
    void start();
    return () => { window.clearTimeout(timer); stream.current?.getTracks().forEach((track) => track.stop()); };
  }, [onDetected]);
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><h2>Ler código de barras</h2><button type="button" className="icon-button" onClick={onClose}><X size={18} /></button></div><video ref={video} autoPlay muted playsInline style={{ width: "100%", maxHeight: 320, objectFit: "cover" }} /><p>{message}</p></div></div>;
}
