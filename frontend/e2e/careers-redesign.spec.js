import fs from "node:fs";
import os from "node:os";
import { test, expect } from "@playwright/test";
import path from "node:path";
const evidence = path.resolve(process.env.CAREER_EVIDENCE_DIR || "../docs/career/screenshots");
test("candidate journey and local resume", async ({ page }, info) => {
  const errors = [];
  const posts = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.method() === "POST" && /career|resume|application/.test(r.url()))
      posts.push(r.url());
  });
  await page.goto("/careers");
  await expect(page.locator("h1")).toContainText("Работа в");
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: `${evidence}/${info.project.name}-home.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page
    .locator(".career-home-hero .site-actions")
    .getByRole("link", { name: "Смотреть вакансии" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Вакансии уточняйте у HR",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Посмотреть архив вакансий" }).click();
  await expect(page.locator(".career-job")).toHaveCount(2);
  await page.getByRole("searchbox").fill("несуществующая профессия");
  await expect(
    page.getByRole("heading", { name: "По вашему запросу вакансий нет" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Посмотреть архив вакансий" }).click();
  await page
    .getByRole("button", { name: "Строительство", exact: true })
    .click();
  await expect(page.locator(".career-job")).toHaveCount(1);
  await page
    .locator(".career-job")
    .getByRole("link", { name: "Задачи и требования" })
    .click();
  await expect(page.locator(".eco-notice").first()).toContainText(
    "Архивная публикация.",
  );
  await page.getByRole("link", { name: "Спросить о вакансии" }).click();
  await page
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  expect(
    await page
      .locator("input[name=name]")
      .evaluate((e) => e.validity.valueMissing),
  ).toBeTruthy();
  await page.locator("input[name=name]").fill("Тестовый кандидат");
  await page.locator("input[name=email]").fill("candidate@example.test");
  await page.locator("input[name=consent]").check();
  await page.locator("input[type=file]").setInputFiles({
    name: "invalid.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("fixture"),
  });
  await expect(page.locator(".career [role=alert]")).toContainText("PDF");
  const large = path.join(os.tmpdir(), `career-large-${info.project.name}.pdf`);
  fs.writeFileSync(large, Buffer.alloc(5 * 1024 * 1024 + 1));
  await page.locator("input[type=file]").setInputFiles(large);
  fs.unlinkSync(large);
  await expect(page.locator(".career [role=alert]")).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "resume.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% synthetic fixture only"),
  });
  await page
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Отклик не отправлен");
  await page.reload();
  await expect(page.locator("input[name=name]")).toHaveValue(
    "Тестовый кандидат",
  );
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать сохранённое резюме" })
    .click();
  expect((await download).suggestedFilename()).toBe("resume.pdf");
  await page.getByRole("button", { name: "Подготовить письмо HR" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Отклик ещё не отправлен",
  );
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: `${evidence}/${info.project.name}-apply.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Удалить черновик", exact: true })
    .click();
  await expect(page.locator("input[name=name]")).toHaveValue("");
  await expect(page.getByRole("status")).toContainText("удалены");
  expect(posts).toEqual([]);
  expect(errors).toEqual([]);
});
test("redirects, languages, internship, reduced motion and 404", async ({
  page,
}, info) => {
  for (const [old, target] of [
    ["about", "/careers"],
    ["team", "/careers#workplaces"],
    ["workplaces", "/careers#workplaces"],
    ["learning", "/careers#learning"],
    ["process", "/careers/apply#preparation"],
  ]) {
    await page.goto(`/careers/${old}`);
    await expect(page).toHaveURL(new RegExp(target + "$"));
  }
  for (const [locale, title] of [
    ["en", "Working at"],
    ["kk", "Жұмыс орны"],
  ]) {
    await page.goto(`/${locale}/careers`);
    await expect(page.locator("h1")).toContainText(title);
    await page.goto(`/${locale}/careers/learning`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/careers#learning$`));
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/careers/internships");
  expect(
    await page
      .locator(".career-intro")
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: `${evidence}/${info.project.name}-internships.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Перейти к заполнению" }).click();
  await expect(page.locator("select[name=position]")).toHaveValue("internship");
  const response = await page.goto("/careers/vacancies/not-a-job");
  expect(response.status()).toBe(404);
});
test("storage failure is explicit", async ({ page }) => {
  await page.goto("/careers/apply");
  await page.locator("input[name=name]").fill("Тест");
  await page.locator("input[name=email]").fill("fixture@example.test");
  await page.locator("input[name=consent]").check();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw Error("test denied");
    };
  });
  await page
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  await expect(page.locator(".career [role=alert]")).toContainText(
    "не разрешил сохранить",
  );
  await expect(page.locator(".eco-result")).toHaveCount(0);
});

test("internship information and a separate student draft", async ({
  page,
}) => {
  await page.goto("/careers/internships");
  await expect(
    page.getByRole("heading", {
      name: "Стажировки для студентов",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".career-program-directions > div")).toHaveCount(4);
  await expect(page.locator(".career-program-overview img")).toHaveCount(2);
  await page
    .getByRole("link", { name: "Заполнить отклик", exact: true })
    .click();
  await expect(page).toHaveURL(/careers\/apply\?type=internship$/);
  await expect(
    page.getByRole("heading", { name: "Отклик на стажировку", exact: true }),
  ).toBeVisible();
  await page.locator("input[name=name]").fill("Тестовый студент");
  await page.locator("input[name=email]").fill("student@example.test");
  await page.locator("input[name=consent]").check();
  await page
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  expect(
    await page
      .locator("input[name=education]")
      .evaluate((e) => e.validity.valueMissing),
  ).toBeTruthy();
  await page
    .locator("input[name=education]")
    .fill("Тестовый вуз, электротехника, 3 курс");
  await page
    .locator("input[name=interest]")
    .fill("Конструкторская документация");
  await page.locator("input[name=availability]").fill("Период уточняется");
  await page
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Отклик не отправлен");
  await page.reload();
  await expect(page.locator("input[name=education]")).toHaveValue(
    "Тестовый вуз, электротехника, 3 курс",
  );
  await expect(page.locator("input[name=interest]")).toHaveValue(
    "Конструкторская документация",
  );
  await expect(page.locator("input[name=availability]")).toHaveValue(
    "Период уточняется",
  );
  await page
    .getByRole("button", { name: "Удалить черновик", exact: true })
    .click();
  await expect(page.locator("input[name=education]")).toHaveValue("");
  await page
    .getByRole("link", { name: "О программе стажировки", exact: true })
    .click();
  await expect(page).toHaveURL(/careers\/internships$/);
});
