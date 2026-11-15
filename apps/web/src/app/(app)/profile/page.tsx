import { redirect } from 'next/navigation';

/** O perfil virou a aba Você (#387). Links antigos e favoritos continuam chegando. */
export default function ProfilePage() {
  redirect('/you');
}
