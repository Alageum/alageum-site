import { mutationOptions } from "./client-guards.mjs";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function acceptPreviewResponse(response, entry) {
  if (response.status !== 200) {
    const error = new Error("The image preview could not be loaded");
    error.status = response.status;
    throw error;
  }
  const blob = response.data;
  const mime = response.headers?.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (!(blob instanceof Blob) || blob.size === 0 || !imageTypes.has(mime) || mime !== entry.mime || blob.type !== mime) {
    throw new Error("The preview response was not the expected image");
  }
  return blob;
}

// Pinned @strapi/admin 5.56.0 supports Blob GET responses. Accept 401 in the
// native client and reject it here, outside its automatic auth retry. Never put
// a credential in a URL, and never refresh/replay a preview across identities.
export function startMediaPreview({ get, productId, entry, token, onState, createObjectURL = (blob) => URL.createObjectURL(blob), revokeObjectURL = (url) => URL.revokeObjectURL(url) }) {
  const controller = new AbortController();
  let active = true;
  let objectURL = null;
  onState({ loading: true, url: "", error: null });
  const promise = (async () => {
    try {
      const response = await get(`/alageum-catalog/products/${encodeURIComponent(productId)}/media-preview/${encodeURIComponent(entry.id)}`, {
        ...mutationOptions(token), responseType: "blob", signal: controller.signal,
      });
      if (!active) return;
      const blob = acceptPreviewResponse(response, entry);
      objectURL = createObjectURL(blob);
      onState({ loading: false, url: objectURL, error: null });
    } catch (error) {
      if (active) onState({ loading: false, url: "", error });
    }
  })();
  return {
    promise,
    cancel() {
      active = false;
      controller.abort();
      if (objectURL) { revokeObjectURL(objectURL); objectURL = null; }
    },
  };
}
