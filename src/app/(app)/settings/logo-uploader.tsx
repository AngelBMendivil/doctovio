"use client";

import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { updateLogoAction, type ActionState } from "@/lib/actions/settings";

const MAX_BYTES = 500 * 1024; // 500 KB
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/**
 * Recorta los márgenes vacíos del logotipo (transparentes, o blancos si la imagen
 * no tiene canal alfa). Así el logo queda pegado al borde aunque el archivo
 * original traiga aire alrededor. Si algo falla, devuelve la imagen original.
 */
function trimMargins(src: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(src);
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) return resolve(src);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(src);
      ctx.drawImage(img, 0, 0);

      let data: Uint8ClampedArray;
      try {
        data = ctx.getImageData(0, 0, w, h).data;
      } catch {
        return resolve(src); // canvas "tainted"
      }

      // Si la imagen usa transparencia, el vacío es alfa; si no, es blanco.
      let hasAlpha = false;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 250) {
          hasAlpha = true;
          break;
        }
      }
      const isBlank = (i: number) =>
        hasAlpha ? data[i + 3] < 12 : data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245;

      let top = h;
      let left = w;
      let right = -1;
      let bottom = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (isBlank((y * w + x) * 4)) continue;
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
      if (right < left || bottom < top) return resolve(src); // imagen vacía
      const nw = right - left + 1;
      const nh = bottom - top + 1;
      if (nw === w && nh === h) return resolve(src); // ya venía recortada

      const out = document.createElement("canvas");
      out.width = nw;
      out.height = nh;
      const octx = out.getContext("2d");
      if (!octx) return resolve(src);
      octx.drawImage(canvas, left, top, nw, nh, 0, 0, nw, nh);
      resolve(out.toDataURL("image/png"));
    };
    img.src = src;
  });
}

function SubmitButton({ label, disabled }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending || disabled}>
      {pending ? "Guardando..." : label}
    </Button>
  );
}

export function LogoUploader({ current }: { current: string | null }) {
  const [state, formAction] = useFormState(updateLogoAction, null as ActionState);
  const [preview, setPreview] = useState<string | null>(current);
  const [dataUrl, setDataUrl] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const onPick = (file?: File) => {
    setError("");
    if (!file) return;
    if (!TYPES.includes(file.type)) {
      setError("Formato no válido. Usa PNG, JPG, WEBP o SVG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("La imagen pesa más de 500 KB. Usa una más ligera.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const result = String(reader.result || "");
      // El SVG es vectorial: no se rasteriza, se usa tal cual.
      const trimmed = file.type === "image/svg+xml" ? result : await trimMargins(result);
      if (trimmed.length > 700_000) {
        setError("La imagen es muy grande. Usa una de máximo 500 KB.");
        return;
      }
      setDataUrl(trimmed);
      setPreview(trimmed);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Logotipo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[10px] text-muted-foreground">Sin logo</span>
          )}
        </div>

        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(e) => onPick(e.target.files?.[0])}
            className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:opacity-90"
          />
          <p className="text-xs text-muted-foreground">
            PNG, JPG, WEBP o SVG · máximo 500 KB · se recomienda fondo transparente.
          </p>
        </div>
      </div>

      {error && <p className="text-xs text-red-700">{error}</p>}
      {state && !state.ok && <p className="text-xs text-red-700">{state.message}</p>}
      {state?.ok && <p className="text-xs text-green-700">✓ {state.message}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <form action={formAction}>
          <input type="hidden" name="logo" value={dataUrl} />
          <SubmitButton label="Guardar logotipo" disabled={!dataUrl} />
        </form>

        {current && (
          <form action={formAction}>
            <input type="hidden" name="remove" value="1" />
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              className="text-red-600 hover:bg-red-50"
              onClick={() => {
                setPreview(null);
                setDataUrl("");
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              Eliminar logotipo
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
