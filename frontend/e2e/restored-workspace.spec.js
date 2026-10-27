import { expect, test } from '@playwright/test';
const product={id:'11111111-1111-4111-8111-111111111111',public_key:'live-fixture-630',slug:'live-fixture-630',sku:'LIVE630',translations:{ru:{name:'Live fixture 630'}},specs:{power:630,voltage:10,technicalSpecs:[]},attributes:[],comparable:true,category_public_key:'transformers'};
async function mockCatalog(page){await page.route('**/api/v1/catalog/products?**',route=>route.fulfill({json:{items:[product],total:1,page:1,page_size:100}}));}
test('catalog home and assistant share live source and selection',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await mockCatalog(page);
 await page.goto('/catalog/home?source=api');await expect(page.locator('.parts-product')).toHaveCount(1);
 await page.getByRole('button',{name:'В подборку Live fixture 630'}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('alageum.catalog.api-selection.v1')||'[]'))).toEqual([{id:product.public_key,databaseId:product.id,quantity:1}]);
 await page.goto('/ai?source=api');await expect(page.getByRole('status').filter({hasText:'Найдено позиций: 1'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Открыть подходящие позиции →'})).toHaveAttribute('href',/source=api/);expect(errors).toEqual([]);
});
test('live catalog failure never substitutes bundled products',async({page})=>{
 await page.route('**/api/v1/catalog/products?**',route=>route.fulfill({status:503,json:{error:{code:'unavailable'}}}));
 await page.goto('/catalog/home?source=api');await expect(page.getByRole('alert').filter({hasText:'Справочные товары не подставляются'})).toBeVisible();await expect(page.locator('.parts-product')).toHaveCount(0);
});
test('investment intent is not an equipment submission or fake success',async({page})=>{
 await page.goto('/inquiry?source=api&intent=investment');await expect(page.locator('#inquiry-intent')).toHaveValue('investment');
 await expect(page.locator('fieldset').filter({hasText:'Состав оборудования'})).toHaveCount(0);
 await expect(page.getByText('Эта форма формирует текст в браузере и не отправляет данные на сервер.',{exact:false})).toBeVisible();
});
