import OrdersAccess from '@/components/orders/OrdersWorkspace';

export default async function OrderPage({ params }) {
  const { id } = await params;
  return <OrdersAccess id={id} />;
}
