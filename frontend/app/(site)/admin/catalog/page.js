import CatalogAdmin from '@/components/admin/CatalogAdmin';
import './catalog-admin.css';
export const metadata = { title: 'Управление каталогом', robots: { index: false, follow: false } };
export default function CatalogAdminPage() { return <CatalogAdmin />; }
