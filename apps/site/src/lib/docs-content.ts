/**
 * Conteúdo da rota /docs, nas duas línguas (issue #113).
 *
 * As duas versões saem da MESMA estrutura de propósito. A alternativa — uma
 * página por idioma, escrita à mão — diverge no primeiro ajuste: alguém
 * acrescenta um exemplo em português, esquece o inglês, e a versão EN vira uma
 * tradução parcial sem ninguém perceber. Aqui, esquecer o `en` é erro de tipo.
 *
 * O público é quem chegou pelo diretório de conectores e quer saber o que dá
 * para pedir. Não é o dev que chega pelo GitHub — esse tem `docs/MCP.md`.
 * Por isso nada aqui menciona MCP, OAuth, tool ou endpoint.
 */

export type Lang = 'pt' | 'en';

interface Bilingual {
  pt: string;
  en: string;
}

export interface DocSection {
  icon: string;
  title: Bilingual;
  intro: Bilingual;
  /** Frases que a pessoa pode dizer, na língua dela. */
  examples: { pt: string[]; en: string[] };
}

export const SECTIONS: DocSection[] = [
  {
    icon: 'lucide:apple',
    title: { pt: 'Nutrição', en: 'Nutrition' },
    intro: {
      pt: 'Registre o que comeu falando normalmente. Os alimentos vêm da tabela TACO, feita para comida brasileira, então "arroz cozido" e "feijão carioca" existem com os valores certos.',
      en: 'Log what you ate in plain language. Foods come from the Brazilian TACO table, so local dishes are covered with accurate values.',
    },
    examples: {
      pt: [
        'Comi 200 g de frango grelhado e uma xícara de arroz no almoço',
        'Quantas calorias eu comi hoje?',
        'Estou batendo minha meta de proteína essa semana?',
        'Troca o arroz do almoço por batata doce',
        'Quanto de fibra eu comi ontem?',
      ],
      en: [
        'I had 200 g of grilled chicken and a cup of rice for lunch',
        'How many calories have I had today?',
        'Am I hitting my protein goal this week?',
        'Swap the rice at lunch for sweet potato',
        'How much fiber did I have yesterday?',
      ],
    },
  },
  {
    icon: 'lucide:dumbbell',
    title: { pt: 'Treino', en: 'Training' },
    intro: {
      pt: 'Comece um treino, registre as séries conforme faz, e finalize. Funciona para musculação (carga, repetições, RPE) e para cardio (tempo, distância, frequência cardíaca).',
      en: 'Start a workout, log sets as you go, and finish. Works for lifting (load, reps, RPE) and for cardio (time, distance, heart rate).',
    },
    examples: {
      pt: [
        'Começando o treino de push',
        'Supino 4 séries de 8 com 70 kg',
        'Qual foi minha última carga no agachamento?',
        'Corri 5 km em 27 minutos',
        'Cria um plano de treino de pernas com agachamento, leg press e stiff',
        'Terminei o treino',
      ],
      en: [
        'Starting my push workout',
        'Bench press, 4 sets of 8 at 70 kg',
        'What was my last squat weight?',
        'I ran 5 km in 27 minutes',
        'Create a leg day plan with squats, leg press and stiff-leg deadlift',
        'I finished the workout',
      ],
    },
  },
  {
    icon: 'lucide:chart-line',
    title: { pt: 'Progresso', en: 'Progress' },
    intro: {
      pt: 'Pergunte sobre o seu histórico. As respostas vêm dos seus registros, não de estimativa.',
      en: 'Ask about your history. Answers come from your own records, not from estimates.',
    },
    examples: {
      pt: [
        'Quanto eu progredi no supino nos últimos 3 meses?',
        'Pesei 78,4 kg hoje',
        'Como está minha média de passos esse mês?',
        'Quantos treinos eu fiz nas últimas 4 semanas?',
        'Bebi 500 ml de água',
        'Qual meu recorde no levantamento terra?',
      ],
      en: [
        'How much have I progressed on bench press in the last 3 months?',
        'I weighed 78.4 kg today',
        'How are my average steps this month?',
        'How many workouts did I do in the last 4 weeks?',
        'I drank 500 ml of water',
        "What's my deadlift personal record?",
      ],
    },
  },
  {
    icon: 'lucide:target',
    title: { pt: 'Metas', en: 'Goals' },
    intro: {
      pt: 'Defina metas de peso, composição corporal ou frequência, e acompanhe o quanto falta.',
      en: 'Set goals for weight, body composition or frequency, and track how far you are.',
    },
    examples: {
      pt: [
        'Quero chegar a 75 kg até dezembro',
        'Minha meta é treinar 4 vezes por semana',
        'Como estão minhas metas?',
        'Define minha meta de proteína em 160 g por dia',
      ],
      en: [
        'I want to reach 75 kg by December',
        'My goal is to train 4 times a week',
        'How are my goals going?',
        'Set my protein goal to 160 g per day',
      ],
    },
  },
  {
    icon: 'lucide:shield-check',
    title: { pt: 'Seus dados', en: 'Your data' },
    intro: {
      pt: 'Você pode levar seus dados embora ou apagar a conta pedindo ao próprio Claude. Sem formulário e sem espera.',
      en: 'You can take your data with you or delete your account by asking Claude. No forms, no waiting.',
    },
    examples: {
      pt: ['Exporta todos os meus dados', 'Quero apagar minha conta'],
      en: ['Export all my data', 'I want to delete my account'],
    },
  },
];

export const COPY = {
  title: {
    pt: 'O que dá para pedir',
    en: 'What you can ask',
  },
  metaDescription: {
    pt: 'Guia de uso do Fatia pelo Claude: o que você pode pedir sobre nutrição, treino, progresso e metas.',
    en: 'Guide to using Fatia with Claude: what you can ask about nutrition, training, progress and goals.',
  },
  lede: {
    pt: 'Depois de conectar, é só falar. Você não precisa decorar comando nenhum — estes são exemplos, não uma lista fechada.',
    en: 'Once connected, just talk. There are no commands to memorize — these are examples, not a closed list.',
  },
  notConnected: {
    pt: 'Ainda não conectou?',
    en: 'Not connected yet?',
  },
  notConnectedCta: {
    pt: 'Veja como conectar',
    en: 'See how to connect',
  },
  tipsTitle: {
    pt: 'Duas coisas que ajudam',
    en: 'Two things that help',
  },
  tips: {
    pt: [
      'Fale a quantidade quando souber. "Comi frango" vira uma estimativa; "comi 180 g de frango" vira um registro.',
      'Corrija na conversa. Se errou a quantidade ou o horário, é só dizer — não precisa apagar e refazer.',
    ],
    en: [
      'Give amounts when you know them. "I had chicken" becomes an estimate; "I had 180 g of chicken" becomes a record.',
      'Correct things in the conversation. Wrong amount or time? Just say so — no need to delete and redo.',
    ],
  },
  privacyTitle: {
    pt: 'Sobre privacidade',
    en: 'About privacy',
  },
  privacyBody: {
    pt: 'O Fatia não tem chave de API de IA. O processamento roda na sua assinatura do Claude — não cobramos por isso e não repassamos seus dados a nenhum provedor de IA. Sem analytics, sem pixel de anúncio.',
    en: 'Fatia holds no AI API key. Processing runs on your own Claude subscription — we do not charge for it and do not pass your data to any AI provider. No analytics, no ad pixels.',
  },
  otherLang: {
    pt: 'English',
    en: 'Português',
  },
} as const;
