import React, { useEffect, useRef, useState } from "react";

type SignaturePadProps = {
  onSave?: (signatureBase64: string) => void;
};

const DeliveryAppSignaturePad: React.FC<SignaturePadProps> = ({ onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // -----------------------------
    // Retina / iPhone scaling fix
    // -----------------------------
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);

    // -----------------------------
    // Canvas styling
    // -----------------------------
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#111827"; // dark background
    ctx.fillRect(0, 0, rect.width, rect.height);

    let drawing = false;

    const getPosition = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: e.clientX - r.left,
        y: e.clientY - r.top,
      };
    };

    // -----------------------------
    // Pointer event handlers
    // -----------------------------
    const handlePointerDown = (e: PointerEvent) => {
      e.preventDefault();
      drawing = true;
      const { x, y } = getPosition(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!drawing) return;
      e.preventDefault();
      const { x, y } = getPosition(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    };

    const handlePointerUp = () => {
      if (!drawing) return;
      drawing = false;
      const dataUrl = canvas.toDataURL("image/png");
      setSignature(dataUrl);
      onSave?.(dataUrl);
    };

    // -----------------------------
    // Register pointer events
    // -----------------------------
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [onSave]);

  // -----------------------------
  // Clear signature
  // -----------------------------
  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, rect.width, rect.height);

    setSignature(null);
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <p className="text-sm text-slate-300 mb-2">
        Sign below to confirm delivery
      </p>

      <canvas
        ref={canvasRef}
        className="w-full h-32 border-2 border-slate-600 rounded bg-slate-900"
        style={{
          touchAction: "none", // CRITICAL for iOS
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
      />

      <div className="flex justify-between mt-3">
        <button
          type="button"
          onClick={clearSignature}
          className="px-3 py-1 text-sm rounded bg-slate-700 text-white"
        >
          Clear
        </button>

        {signature && (
          <span className="text-green-400 text-sm self-center">
            ✔ Signature captured
          </span>
        )}
      </div>
    </div>
  );
};

export default DeliveryAppSignaturePad;
