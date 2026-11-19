'use client';

import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { MealPhotoScreen } from '@/components/nutrition/meal-photo-screen';

/** Foto do prato (#385): o menu da IA abre aqui. No navegador, o arquivo faz o papel da câmera. */
export default function MealPhotoPage() {
  useTopBarTitle('Foto do prato');
  return <MealPhotoScreen />;
}
