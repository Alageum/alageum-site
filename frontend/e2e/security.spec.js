import { expect, test } from "@playwright/test";
import { installBrowserSession } from "./helpers/browser-session";

const API = (process.env.E2E_API_URL || `${process.env.E2E_BASE_URL || "http://localhost:3000"}/api/v1`).replace(/\/$/, "");
const loginCache = new Map();

async function login(request, email, password = "ChangeMe123!") {
  if (loginCache.has(email)) return loginCache.get(email);
  const response = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(response.ok()).toBeTruthy();
  const pair = await response.json();
  loginCache.set(email, pair);
  return pair;
}

async function profile(request, pair) {
  const response = await request.get(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${pair.access_token}` },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function headers(request, email) {
  const pair = await login(request, email);
  const me = await profile(request, pair);
  return {
    pair,
    me,
    values: {
      Authorization: `Bearer ${pair.access_token}`,
      "X-Organization-ID": me.organization.id,
    },
  };
}

async function browserLogin(page, email = "buyer@demo.example") {
  await page.goto("/");
  const session = await installBrowserSession(page, { email, password: "ChangeMe123!" });
  const response = await page.request.get(new URL("/api/v1/auth/me", page.url()).href, {
    headers: { "X-Browser-Session": session.browser_session },
  });
  expect(response.status()).toBe(200);
  const me = await response.json();
  await page.evaluate((session) => {
    sessionStorage.setItem("alageum_session", JSON.stringify(session));
    window.dispatchEvent(new Event("alageum:session-changed"));
  }, { ...session, organization_id: me.organization.id });
  return { session, me };
}

test("login through UI", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("buyer@demo.example");
  await page.getByLabel("Пароль", { exact: true }).fill("ChangeMe123!");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/b2b$/);
  await expect(page.getByTestId("active-organization").getByText("Demo Industrial Company", { exact: true })).toBeVisible();
});

test("foreign order and document are hidden", async ({ request }) => {
  const tenantA = await headers(request, "buyer@demo.example");
  const tenantB = await headers(request, "accountant@demo.example");
  const ordersB = await request.get(`${API}/orders`, { headers: tenantB.values });
  const foreignOrder = (await ordersB.json()).items[0].id;
  const orderResponse = await request.get(`${API}/orders/${foreignOrder}`, {
    headers: tenantA.values,
  });
  expect(orderResponse.status()).toBe(404);
  const documentsB = await request.get(`${API}/documents`, { headers: tenantB.values });
  const foreignDocument = (await documentsB.json()).items[0];
  const documentResponse = await request.get(`${API}/documents/${foreignDocument.id}`, {
    headers: tenantA.values,
  });
  expect(documentResponse.status()).toBe(404);
  const fileResponse = await request.get(`${API}/files/${foreignDocument.latest_file_id}`, {
    headers: tenantA.values,
  });
  expect(fileResponse.status()).toBe(404);
});

test("RFQ and ticket creation through UI", async ({ page }) => {
  await browserLogin(page);
  await page.goto("/catalog?source=api");
  await page.getByRole("button", { name: "В подборку +", exact: true }).first().click();
  await page.goto("/inquiry?source=api");
  await page.getByRole("spinbutton").fill("2");
  await page.getByLabel("Сообщение (необязательно)").fill("Playwright RFQ");
  await page.getByRole("button", { name: "Сохранить запрос КП", exact: true }).click();
  await expect(page).toHaveURL(/\/b2b\/quotes\/[0-9a-f-]+$/);
  await expect(page.getByRole("status")).toContainText("Запрос сохранён в базе");
  await page.reload();
  await expect(page.getByText("Playwright RFQ", { exact: true })).toBeVisible();
  await page.goto("/b2b/support");
  const ticketForm = page.getByRole("form", { name: "Новое обращение", exact: true });
  await ticketForm.getByLabel("Категория", { exact: true }).selectOption({ index: 1 });
  await ticketForm.getByLabel("Тема", { exact: true }).fill("Playwright ticket");
  await ticketForm.getByLabel("Сообщение", { exact: true }).fill("Deterministic E2E message");
  await ticketForm.getByRole("button", { name: "Создать обращение", exact: true }).click();
  await expect(ticketForm.getByRole("status")).toContainText("Обращение создано");
});

test("AI read isolation and scoped write confirmation", async ({ request }) => {
  const tenantA = await headers(request, "buyer@demo.example");
  const tenantB = await headers(request, "accountant@demo.example");
  const ownOrders = await request.get(`${API}/orders`, { headers: tenantA.values });
  const foreignOrders = await request.get(`${API}/orders`, { headers: tenantB.values });
  const ownOrder = (await ownOrders.json()).items[0];
  const foreignOrder = (await foreignOrders.json()).items[0];
  const chat = await request.post(`${API}/ai/chat`, {
    headers: tenantA.values,
    data: { message: "E2E conversation" },
  });
  const conversationId = (await chat.json()).conversation_id;
  const own = await request.post(`${API}/ai/tools/execute`, {
    headers: tenantA.values,
    data: {
      conversation_id: conversationId,
      tool: "get_order",
      arguments: { order_id: ownOrder.id },
    },
  });
  expect(own.ok()).toBeTruthy();
  const foreign = await request.post(`${API}/ai/tools/execute`, {
    headers: tenantA.values,
    data: {
      conversation_id: conversationId,
      tool: "get_order",
      arguments: { order_id: foreignOrder.id },
    },
  });
  expect(foreign.status()).toBe(404);
  const categories = await request.get(`${API}/support/categories`, { headers: tenantA.values });
  const category = (await categories.json()).items[0];
  const write = {
    conversation_id: conversationId,
    tool: "create_ticket",
    arguments: { category_id: category.id, subject: "AI E2E", message: "Confirmed" },
  };
  const proposed = await request.post(`${API}/ai/tools/execute`, {
    headers: tenantA.values,
    data: write,
  });
  expect(proposed.status()).toBe(409);
  const confirmationId = (await proposed.json()).error.details.confirmation_id;
  const confirmation = await request.post(`${API}/ai/tools/confirm/${confirmationId}`, {
    headers: tenantA.values,
  });
  expect(confirmation.ok()).toBeTruthy();
  const executed = await request.post(`${API}/ai/tools/execute`, {
    headers: tenantA.values,
    data: { ...write, confirmation_id: confirmationId },
  });
  expect(executed.ok()).toBeTruthy();
});

test("persisted legacy bearer cannot restore a browser session even with an existing cookie", async ({ page }) => {
  const auth = await browserLogin(page);
  let refreshes = 0;
  page.on("request", request => { if (request.url() === `${API}/auth/refresh`) refreshes++; });
  await page.evaluate((session) => {
    sessionStorage.setItem("alageum_session", JSON.stringify(session));
  }, {
    access_token: "invalid",
    refresh_token: "invalid",
    organization_id: auth.me.organization.id,
  });
  await page.goto("/b2b/orders");
  await expect(page.getByText("Войдите, чтобы открыть B2B кабинет.")).toBeVisible();
  expect(refreshes).toBe(0);
});

