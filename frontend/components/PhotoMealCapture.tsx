"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

export type MealPhotoDraft = {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
};

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const buttonClass = "min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:opacity-50";

export default function PhotoMealCapture({
  photo,
  onChange,
}: {
  photo: MealPhotoDraft | null;
  onChange: (photo: MealPhotoDraft | null) => void;
}) {
  const [camera, setCamera] = useState<"idle" | "opening" | "live">("idle");
  const [ready, setReady] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const stream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const operation = useRef(0);

  const releaseCamera = useCallback(() => {
    operation.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  const stopCamera = useCallback(() => {
    releaseCamera();
    setCamera("idle");
    setReady(false);
    setPreparing(false);
  }, [releaseCamera]);

  useEffect(() => {
    const hide = () => {
      if (document.hidden) stopCamera();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") stopCamera();
    };
    document.addEventListener("visibilitychange", hide);
    document.addEventListener("keydown", escape);
    window.addEventListener("pagehide", stopCamera);
    return () => {
      releaseCamera();
      document.removeEventListener("visibilitychange", hide);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("pagehide", stopCamera);
    };
  }, [releaseCamera, stopCamera]);

  const attachVideo = useCallback((element: HTMLVideoElement | null) => {
    video.current = element;
    if (element) element.srcObject = stream.current;
  }, []);

  async function openCamera() {
    stopCamera();
    setError("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("The live camera needs HTTPS or localhost in a supported browser. Try Use device camera or choose a photo instead.");
      return;
    }
    const id = ++operation.current;
    setCamera("opening");
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1600 }, height: { ideal: 1200 } },
      });
      // Permission can resolve after cancellation or navigation.
      if (id !== operation.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      media.getVideoTracks().forEach((track) => track.addEventListener("ended", stopCamera, { once: true }));
      setCamera("live");
    } catch (cause) {
      if (id !== operation.current) return;
      setCamera("idle");
      const name = cause instanceof DOMException ? cause.name : "";
      setError(name === "NotAllowedError"
        ? "Camera access was not allowed. Allow it in your browser settings, use your device camera, or choose a photo."
        : name === "NotFoundError"
          ? "No camera was found. Choose a photo from your device instead."
          : "The camera could not start. Close other apps using it, try your device camera, or choose a photo.");
    }
  }

  async function selectPhoto(file?: File) {
    if (!file) return;
    stopCamera();
    setError("");
    const id = ++operation.current;
    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      setError("Choose a photo smaller than 20 MB that is not empty.");
      return;
    }
    if (file.type ? !ACCEPTED_TYPES.includes(file.type) : !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
      setError("Choose a JPEG, PNG, or WebP photo. HEIC photos work only in browsers that can preview them.");
      return;
    }
    setPreparing(true);
    const url = URL.createObjectURL(file);
    let retained = false;
    try {
      const image = new window.Image();
      image.src = url;
      await image.decode();
      if (id !== operation.current) return;
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 50_000_000) {
        throw new Error("Choose a smaller photo, up to 50 megapixels.");
      }
      onChange({ file, previewUrl: url, width: image.naturalWidth, height: image.naturalHeight });
      retained = true;
    } catch (cause) {
      if (id !== operation.current) return;
      setError(cause instanceof Error && cause.message.startsWith("Choose a smaller")
        ? cause.message
        : /hei[cf]/i.test(file.type + file.name)
          ? "This browser cannot preview that HEIC photo. Take a photo here or choose a JPEG, PNG, or WebP copy."
          : "That photo could not be opened. Try another image or take a new photo.");
    } finally {
      if (!retained) URL.revokeObjectURL(url);
      if (id === operation.current) setPreparing(false);
    }
  }

  function capturePhoto() {
    const element = video.current;
    if (!element || !ready || preparing || !element.videoWidth) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(element.videoWidth, element.videoHeight));
    canvas.width = Math.round(element.videoWidth * scale);
    canvas.height = Math.round(element.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Could not capture this photo. Try your device camera instead.");
      return;
    }
    context.drawImage(element, 0, 0, canvas.width, canvas.height);
    setPreparing(true);
    const id = operation.current;
    canvas.toBlob((blob) => {
      if (id !== operation.current) return;
      if (!blob) {
        setPreparing(false);
        setError("Could not capture this photo. Please try again.");
        return;
      }
      void selectPhoto(new File([blob], "meal-photo.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  }

  function chooseFile(input: HTMLInputElement | null) {
    stopCamera();
    setError("");
    input?.click();
  }

  return (
    <section aria-labelledby="photo-heading" className="mt-6 space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="photo-heading" className="text-xl font-semibold text-green-950">Start with a meal photo</h2>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">Preview only</span>
        </div>
        <p className="mt-2 text-sm text-slate-600">Keep the whole plate in view and use good lighting. You will confirm the foods and portions before logging.</p>
      </div>

      <input ref={galleryInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden" aria-label="Choose meal photo" onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        void selectPhoto(file);
      }} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Take meal photo with device camera" onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        void selectPhoto(file);
      }} />

      {camera !== "idle" ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
          {camera === "opening" ? (
            <p role="status" className="p-8 text-center text-white">Waiting for camera access. Allow access in your browser to continue.</p>
          ) : (
            <video ref={attachVideo} autoPlay playsInline muted aria-label="Live meal camera" className="max-h-[55vh] w-full object-contain" onLoadedData={() => setReady(true)} onError={() => {
              stopCamera();
              setError("The camera preview could not play. Try your device camera instead.");
            }} />
          )}
          <div className="flex flex-wrap justify-center gap-3 p-4">
            {camera === "live" && <button type="button" onClick={capturePhoto} disabled={!ready || preparing} className="min-h-11 rounded-xl bg-green-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{preparing ? "Preparing photo…" : "Capture photo"}</button>}
            <button type="button" onClick={stopCamera} className={buttonClass}>Cancel camera</button>
          </div>
        </div>
      ) : photo ? (
        <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
          <Image src={photo.previewUrl} alt="Your meal photo preview" width={photo.width} height={photo.height} unoptimized className="max-h-96 w-full object-contain" />
          <figcaption className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            Photo selected. Check that your meal is clearly visible.
          </figcaption>
        </figure>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-green-200 bg-green-50/40 px-4 py-10 text-center">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 h-10 w-10 text-green-700">
            <path d="M8 5l1.5-2h5L16 5h4a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2h4z" />
            <circle cx="12" cy="12" r="4" />
          </svg>
          <p className="font-semibold text-green-950">A photo is your starting point</p>
          <p className="mt-1 text-sm text-slate-600">Take a picture now or choose one from your device.</p>
        </div>
      )}

      {camera === "idle" && (
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => void openCamera()} disabled={preparing} className="min-h-11 rounded-xl bg-green-700 px-5 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50">{photo ? "Retake photo" : "Take photo"}</button>
          <button type="button" onClick={() => chooseFile(galleryInput.current)} disabled={preparing} className={buttonClass}>{photo ? "Choose another photo" : "Choose from photos"}</button>
          {photo && <button type="button" onClick={() => {
            stopCamera();
            setError("");
            onChange(null);
          }} className={buttonClass}>Remove photo</button>}
        </div>
      )}
      <div>
        <button type="button" onClick={() => chooseFile(cameraInput.current)} disabled={preparing} className="min-h-11 text-left text-sm font-medium text-green-800 underline underline-offset-4 disabled:opacity-50">Use device camera</button>
        <p className="text-xs text-slate-500">An alternative for phones. Your browser may show a camera or file picker.</p>
      </div>
      {preparing && <p role="status" className="text-sm text-slate-600">Preparing your photo…</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <h3 className="font-semibold text-amber-950">Food recognition is coming next</h3>
        <p id="photo-recognition-note" className="mt-1 text-sm text-amber-900">For now, you can take and preview a photo. It is not analyzed or added to your log. Use USDA search, manual entry, or a saved recipe to log your meal.</p>
        <button type="button" disabled aria-describedby="photo-recognition-note" className="mt-3 min-h-11 rounded-xl bg-slate-200 px-4 py-3 text-sm font-semibold text-slate-600">Analyze photo · Coming soon</button>
      </div>
      <p className="text-xs text-slate-500">Your photo stays in this browser tab and is cleared when you leave or reload this page. Nothing is uploaded. JPEG, PNG, and WebP up to 20 MB; HEIC preview depends on your browser.</p>
    </section>
  );
}
