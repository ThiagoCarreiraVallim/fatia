import { Redirect } from 'expo-router';

/** O perfil virou a aba Você (#387). Links antigos e avisos continuam chegando. */
export default function ProfileScreen() {
  return <Redirect href="/you" />;
}
