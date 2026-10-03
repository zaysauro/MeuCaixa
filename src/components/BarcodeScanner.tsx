"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

type Props = { onDetected: (value: string) => void; onClose: () => void };

export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastValueRef = useRef("");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [detected, setDetected] = useState("");
  const [status, setStatus] = useState("Preparando a câmera...");
  const [diagnostics, setDiagnostics] = useState("Inicializando leitor linear EAN/UPC...");

  function stop() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function start(deviceId?: string) {
    stop();
    setDetected("");
    setStatus("Aponte o código de barras para a área de leitura.");
    try {
      const reader = new BrowserMultiFormatReader();
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      setCameras(devices);
      const selected = deviceId || devices.find((device) => /back|rear|environment|trás/i.test(device.label))?.deviceId || devices[0]?.deviceId;
      if (!selected) throw new Error("Nenhuma câmera encontrada.");
      setCameraId(selected);
      setDiagnostics(`${devices.length} câmera(s) encontrada(s). Motor ZXing ativo.`);
      controlsRef.current = await reader.decodeFromVideoDevice(selected, videoRef.current!, (result, error) => {
        if (!result || detected || lastValueRef.current === result.getText()) return;
        lastValueRef.current = result.getText();
        controlsRef.current?.stop();
        setDetected(result.getText());
        setStatus(`Código detectado (${result.getBarcodeFormat()}).`);
        setDiagnostics(`Leitura confirmada: ${result.getBarcodeFormat()}.`);
        if ("vibrate" in navigator) navigator.vibrate?.(80);
        try { new AudioContext().close(); } catch { /* feedback opcional */ }
        void error;
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível iniciar a câmera.");
      setDiagnostics("Verifique a permissão da câmera, HTTPS e se existe uma webcam disponível.");
    }
  }

  useEffect(() => { void start(); return stop; }, []);

  function useCode() {
    if (!detected) return;
    const value = detected;
    stop();
    onDetected(value);
  }

  function close() { stop(); onClose(); }

  return <div className="modal-backdrop"><div className="modal barcode-scanner-modal">
    <div className="modal-head"><div><h2>Ler código de barras</h2><p>{status}</p></div><button type="button" className="icon-button" onClick={close} aria-label="Fechar leitor"><X size={18} /></button></div>
    <div className="barcode-camera-frame"><video ref={videoRef} autoPlay muted playsInline /><div className="barcode-scan-line" aria-hidden="true" /></div>
    {cameras.length > 1 && <label className="field-label">Câmera<select className="field" value={cameraId} onChange={(event) => void start(event.target.value)}>{cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Câmera ${index + 1}`}</option>)}</select></label>}
    {detected ? <div className="barcode-detected"><strong>✓ Código detectado</strong><code>{detected}</code><div className="modal-actions"><button type="button" className="button secondary" onClick={() => void start(cameraId)}>Ler novamente</button><button type="button" className="button primary" onClick={useCode}>Usar este código</button></div></div> : <p className="barcode-diagnostics">{diagnostics}</p>}
    <button type="button" className="button secondary" onClick={close}>Cancelar</button>
  </div></div>;
}
