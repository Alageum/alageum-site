import AccountFrame from '@/components/account/AccountFrame';
import EmailRecoveryForm from '@/components/account/EmailRecoveryForm';
export default function Page() { return <AccountFrame title="Восстановление пароля" description="Укажите email вашего аккаунта. Мы отправим ссылку для нового пароля, если восстановление доступно."><EmailRecoveryForm /></AccountFrame>; }
