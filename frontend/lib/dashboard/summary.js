export const dashboardSections = [
 { path:'/orders', href:'/b2b/orders', permission:'order.read', label:'Заказы' },
 { path:'/documents', href:'/b2b/documents', permission:'document.read', label:'Документы' },
 { path:'/finance/invoices', href:'/b2b/finance', permission:'finance.read', label:'Счета' },
 { path:'/quotes?mine=true', href:'/b2b/quotes', permission:'quote.read', label:'Мои запросы КП' },
 { path:'/support/tickets', href:'/b2b/support', permission:'ticket.read', label:'Обращения' },
];
export function summaryTotal(page) {
 if (!page || !Array.isArray(page.items) || !Number.isSafeInteger(page.total) || page.total < 0 || page.page !== 1) throw Error('Некорректный ответ раздела');
 return page.total;
}
