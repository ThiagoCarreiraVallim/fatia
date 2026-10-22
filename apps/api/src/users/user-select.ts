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
} as const;
