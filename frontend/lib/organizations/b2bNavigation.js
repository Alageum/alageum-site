import {supportAccess} from '../support/model.js';

const links = [
  ['/b2b', 'Обзор'],
  ['/b2b/orders', 'Заказы', 'order.read'],
  ['/b2b/documents', 'Документы', 'document.read'],
  ['/b2b/finance', 'Финансы', 'finance.read'],
  ['/b2b/quotes', 'Запросы КП', 'quote.read'],
  ['/b2b/support', 'Поддержка', 'ticket.read'],
  ['/b2b/profile', 'Профиль'],
  ['/b2b/members', 'Участники', 'organization.manage_users'],
  ['/b2b/access-requests', 'Заявки на доступ', 'organization.manage_users'],
];

export function b2bNavigation(permissions) {
  return links.filter(([href, , permission]) => href === '/b2b/support'
    ? supportAccess(permissions).visible
    : !permission || permissions?.includes(permission));
}
