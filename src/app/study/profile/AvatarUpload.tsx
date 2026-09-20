"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { removeAvatar, saveAvatar } from "@/lib/messages/actions";
import { Avatar } from "@/components/ui/Avatar";

const MAX_INPUT_BYTES = 12 * 1024 * 1024; // guard before we even decode
const OUTPUT_SIZE = 400;

/**
 * Squares, shrinks and re-encodes the picture in the browser before upload.
 *
 * Worth the code: a phone photo is several megabytes, which would hit both the
 * bucket's 2 MB ceiling and the server action body limit, and every avatar ends up
 * the same shape and weight (~40 KB) however it arrived. It also means the upload
 * is always a JPEG at a fixed path, so the server can derive the location itself.
 */
async function toSquareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not process that image.");
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE
  );
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85)
  );
  if (!blob) throw new Error("Your browser could not process that image.");
  return blob;
}

export function AvatarUpload({
  userId,
  name,
  currentUrl,
}: {
  userId: string;
  name: string | null;
  currentUrl: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  async function onPick(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError("That image is very large — pick one under 12 MB.");
      return;
    }

    setBusy(true);
    try {
      const blob = await toSquareJpeg(file);
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(`${userId}/avatar.jpg`, blob, {
          upsert: true,
          contentType: "image/jpeg",
          cacheControl: "3600",
        });
      if (uploadError) throw new Error(uploadError.message);

      setPreview(URL.createObjectURL(blob));
      startTransition(async () => {
        const result = await saveAvatar();
        if (result && "error" in result) setError(result.error);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That picture could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  function onRemove() {
    setError(null);
    setPreview(null);
    startTransition(async () => {
      const result = await removeAvatar();
      if (result && "error" in result) setError(result.error);
    });
  }

  const working = busy || pending;
  const shown = preview ?? currentUrl;

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} url={shown} seed={userId} size={64} />

      <div className="min-w-0">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onPick(file);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={working}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg border border-brand-700 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
          >
            {working ? "Uploading…" : shown ? "Change picture" : "Upload a picture"}
          </button>
          {shown ? (
            <button
              type="button"
              disabled={working}
              onClick={onRemove}
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-card-foreground disabled:opacity-50"
            >
              Remove
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          JPG, PNG, WebP or GIF. It&apos;s cropped to a square and resized for you.
        </p>
        {error ? (
          <p role="alert" className="mt-1 text-xs text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
