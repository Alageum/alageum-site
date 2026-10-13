import { test, expect } from '@playwright/test';
import { photoPublicDto } from '../tests/helpers/photography-api-fixture.mjs';

async function checkPhoto(page, id) {
  const photo=page.locator(`[data-product-photograph="${id}"]`).first();
  await expect(photo).toBeVisible();
  await expect.poll(()=>photo.locator('img').evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
  return photo;
}
async function noOverflow(page) { expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true); }

test('product photo loads with honest source caption and technical evidence preserved',async({page},info)=>{
  await page.goto('/catalog/tmg-630');
  const photo=await checkPhoto(page,'distribution-transformers');
  await expect(photo).toContainText('Производственное фото');
  await expect(photo.getByRole('link',{name:'Источник фотографии'})).toHaveAttribute('href',/alageum\.com/);
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  await noOverflow(page);
  await page.screenshot({path:info.outputPath('product-photograph.png'),fullPage:false});
  await photo.screenshot({path:info.outputPath('product-photograph-detail.png')});
  await page.getByRole('tab',{name:'Характеристики'}).click();
  await expect(page.getByRole('tabpanel')).toContainText('Технические характеристики');
});

test('catalog thumbnails retain searching, comparison and selection',async({page},info)=>{
  await page.goto('/catalog?q=ТМГ-630');
  await checkPhoto(page,'distribution-transformers');
  const row=page.locator('tr[data-product-id]').filter({has:page.locator('[data-product-photograph="distribution-transformers"]')}).first();
  await expect(row).toBeVisible();
  await row.getByRole('checkbox').check();
  await expect(page.locator('.comparison-tray')).toBeVisible();
  await row.getByRole('button',{name:/В подборку/}).click();
  await expect(page.locator('.catalog-status')).toContainText('добавлен');
  await noOverflow(page);
  await row.screenshot({path:info.outputPath('catalog-photo-row.png')});
});

test('family selector still resets and selected technical record stays exact',async({page})=>{
  await page.goto('/catalog/tr2026-family-tmg-standard');
  await checkPhoto(page,'distribution-transformers');
  const select=page.getByRole('combobox',{name:'Запись для просмотра'});
  await select.selectOption('alageum-tmg-standard-16');
  await expect(page.locator('[data-selected-member]')).toHaveAttribute('data-selected-member','alageum-tmg-standard-16');
  await select.selectOption('');
  await expect(page.locator('[data-selected-member]')).toHaveCount(0);
  await noOverflow(page);
});

test('unmapped record retains technical fallback without a guessed photo',async({page})=>{
  await page.goto('/catalog/cat-bdrm');
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  await expect(page.locator('[data-product-photograph]')).toHaveCount(0);
  await expect(page.locator('[data-product-visual]')).toBeVisible();
});

test('live Node contract gets photo while edited media or variants revoke mapping',async({page})=>{
  const record=photoPublicDto('alageum-tmg-standard-16');
  await page.route('**/api/v1/catalog/products**',route=>route.fulfill({json:{total:1,items:[record]}}));
  await page.goto(`/catalog/${record.public_key}?source=api`);
  await checkPhoto(page,'distribution-transformers');
  record.media=[{kind:'image',path:'/catalog-products/cat-bdrm.webp',alt:'Owner image'}];
  await page.reload();
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  await expect(page.locator('[data-product-photograph]')).toHaveCount(0);
  record.media=photoPublicDto(record.public_key).media;
  record.specs.variantSpecs=[{label:'Номинальная мощность',value:'99999',unit:'кВА'}];
  await page.reload();
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  await expect(page.locator('[data-product-photograph]')).toHaveCount(0);
});

test('verified KSO and TM examples are decoded and labelled as series photos',async({page},info)=>{
  for(const [route,id] of [['kso-2-10','aemz-kso2-10-series'],['alageum-tm-standard-630','aemz-tm-series']]){
    await page.goto(`/catalog/${route}`);
    const photo=await checkPhoto(page,id);
    await expect(photo).toContainText('Фото серии');
    await noOverflow(page);
    await photo.screenshot({path:info.outputPath(`${id}.png`)});
  }
});

test('capture unchanged PR45 product baseline for photo comparison',async({page},info)=>{
  await page.goto('http://127.0.0.1:3105/catalog/tmg-630');
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  await page.screenshot({path:info.outputPath('pr45-product-before.png'),fullPage:false});
});
