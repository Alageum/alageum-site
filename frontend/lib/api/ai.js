import { apiFetch } from "./client";
export const sendMessage = (data) => apiFetch("/ai/chat", { method: "POST", body: JSON.stringify(data) });
export const executeTool = (data) => apiFetch("/ai/tools/execute", { method: "POST", body: JSON.stringify(data) });

