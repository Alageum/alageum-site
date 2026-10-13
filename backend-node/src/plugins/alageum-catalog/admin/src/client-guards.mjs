export function errorMessage(error) {
  const body = error?.response?.data?.error || error?.response?.data || {};
  if (body.code === "catalog_version_conflict")
    return "This product changed. Reload the product before saving again. Your edits have not been saved.";
  if ([401, 403].includes(error?.status || error?.response?.status)) return "Your CMS account does not have access to manage this catalog. Sign in again or contact your administrator.";
  if (Array.isArray(body.details)) return body.details.slice(0, 3).map((detail) => `${detail.loc?.join(".") || "Product"}: ${detail.msg}`).join("; ");
  return body.message || error?.message || "The request failed. Please try again.";
}

export function accountKey(token) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return typeof payload.userId === "string" && /^[1-9][0-9]*$/.test(payload.userId) ? payload.userId : null;
  } catch { return null; }
}
export function mutationOptions(token) {
  return { headers: { Authorization: `Bearer ${token}` }, validateStatus: (status) => status === 401 };
}
export function acceptMutationResponse(response) {
  if (response.data?.error) {
    const failure = new Error(response.data.error.message || "CMS session expired");
    failure.status = response.data.error.status || 401;
    failure.response = { data: response.data };
    throw failure;
  }
  return response;
}
