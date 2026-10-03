"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

type Props = { onDetected: (value: string) => void; onClose: () => void };

function cameraErrorMessage(error: unknown) {
  if (!(error instanceof DOMException)) return error instanceof Error ? error.message : "Não foi possível iniciar a câmera.";
  switch (error.name) {
    case "NotAllowedError": return "Permissão para usar a câmera foi negada. Autorize o acesso à câmera nas configurações do navegador e tente novamente.";
    case "NotFoundError": return "Nenhuma câmera foi encontrada neste dispositivo.";
    case "NotReadableError": return "A câmera está sendo usada por outro aplicativo.";
    case "OverconstrainedError": return "A câmera selecionada não está disponível. Tente outra câmera.";
    case "SecurityError": return "O navegador bloqueou o acesso à câmera por motivos de segurança.";
    default: return error.message || "Não foi possível iniciar a câmera.";
  }
}

export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef(0);
  const lastValueRef = useRef("");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [detected, setDetected] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [status, setStatus] = useState("Clique em Abrir câmera para começar.");
  const [diagnostics, setDiagnostics] = useState("A câmera só será solicitada após sua confirmação.");

  function stop() {
    requestRef.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = streamRef.current || (videoRef.current?.srcObject as MediaStream | null);
    stream?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  }

  async function listCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((device) => device.kind === "videoinput");
    setCameras(videoDevices);
    console.debug("barcode camera: video devices", videoDevices.length);
    return videoDevices;
  }

  async function start(deviceId?: string) {
    stop();
    setDetected("");
    lastValueRef.current = "";
    setStatus("Solicitando acesso à câmera...");
    setDiagnostics("Aguardando permissão do navegador...");
    const requestId = requestRef.current;

    if (!window.isSecureContext) {
      setStatus("A câmera precisa de uma conexão segura (HTTPS) para funcionar.");
      setDiagnostics("Abra o sistema em uma URL HTTPS e tente novamente.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Este navegador não permite acesso à câmera.");
      setDiagnostics("Use uma versão atual do Chrome, Safari ou outro navegador compatível.");
      return;
    }

    try {
      const permission = await navigator.permissions?.query({ name: "camera" as PermissionName }).catch(() => null);
      console.debug("barcode camera: start requested", {
        permission: permission?.state ?? "unavailable",
        isSecureContext: window.isSecureContext,
        mediaDevices: Boolean(navigator.mediaDevices),
      });

      let constraints: MediaStreamConstraints = deviceId
        ? { video: { deviceId: { exact: deviceId } } }
        : { video: { facingMode: { ideal: "environment" } } };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        if (!deviceId && error instanceof DOMException && ["NotFoundError", "OverconstrainedError"].includes(error.name)) {
          constraints = { video: true };
          console.debug("barcode camera: environment constraint failed, using fallback", { errorName: error.name, message: error.message });
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } else {
          throw error;
        }
      }

      if (requestId !== requestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Elemento de vídeo não encontrado.");
      video.setAttribute("playsinline", "true");
      video.muted = true;
      video.srcObject = stream;
      console.debug("barcode camera: stream obtained and srcObject assigned", {
        readyState: video.readyState,
        trackSettings: stream.getVideoTracks()[0]?.getSettings(),
      });
      await video.play();
      console.debug("barcode camera: video.play success", { readyState: video.readyState, width: video.videoWidth, height: video.videoHeight });

      const devices = await listCameras();
      const activeDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId || deviceId || devices[0]?.deviceId || "";
      setCameraId(activeDeviceId);
      setCameraOpen(true);
      setStatus("Aponte o código de barras para a área de leitura.");
      setDiagnostics(`${devices.length || 1} câmera(s) disponível(is). Motor ZXing ativo.`);

      const reader = new BrowserMultiFormatReader();
      controlsRef.current = await reader.decodeFromStream(stream, video, (result, error) => {
        if (error && !result) return;
        if (!result || lastValueRef.current === result.getText()) return;
        lastValueRef.current = result.getText();
        controlsRef.current?.stop();
        setCameraOpen(false);
        setDetected(result.getText());
        setStatus(`Código detectado (${result.getBarcodeFormat()}).`);
        setDiagnostics(`Leitura confirmada: ${result.getBarcodeFormat()}.`);
        if ("vibrate" in navigator) navigator.vibrate?.(80);
        try { new AudioContext().close(); } catch { /* feedback opcional */ }
      });
      console.debug("barcode camera: ZXing started");
    } catch (error) {
      console.error("barcode camera: start failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : String(error),
        constraint: deviceId ? "deviceId" : "facingMode: environment",
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraOpen(false);
      setStatus(cameraErrorMessage(error));
      setDiagnostics("Verifique a permissão da câmera, HTTPS e se existe uma webcam disponível.");
    }
  }

  useEffect(() => stop, []);

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
    {cameras.length > 1 && cameraOpen && <label className="field-label">Câmera<select className="field" value={cameraId} onChange={(event) => void start(event.target.value)}>{cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Câmera ${index + 1}`}</option>)}</select></label>}
    {detected ? <div className="barcode-detected"><strong>✓ Código detectado</strong><code>{detected}</code><div className="modal-actions"><button type="button" className="button secondary" onClick={() => void start(cameraId)}>Ler novamente</button><button type="button" className="button primary" onClick={useCode}>Usar este código</button></div></div> : <>
      <p className="barcode-diagnostics">{diagnostics}</p>
      {!cameraOpen && <button type="button" className="button primary barcode-open-camera" onClick={() => void start(cameraId || undefined)}><Camera size={17} />Abrir câmera</button>}
    </>}
    <button type="button" className="button secondary" onClick={close}>Cancelar</button>
  </div></div>;
}
