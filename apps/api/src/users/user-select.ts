/** O perfil que o app e o MCP leem e devolvem. Sem `logtoSub`, que é de infraestrutura. */
export const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  timezone: true,
  heightCm: true,
  sex: true,
  birthDate: true,
  activityLevel: true,
  objective: true,
  onboardedAt: true,
  // Você (#387).
  nickname: true,
  bio: true,
  avatarVisibility: true,
  keepMealPhotos: true,
  whatsapp: true,
  whatsappOptIn: true,
  loadUnit: true,
  distanceUnit: true,
  // A foto sai como URL assinada (`ProfileService`), nunca a chave do bucket.
  avatarFile: true,
} as const;
