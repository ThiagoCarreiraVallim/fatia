import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Busca na web pelo Brave Search (backup de agosto, 48cb4a4).
 *
 * Quatro decisões estão embutidas aqui, e valem mais que o código:
 *
 * 1. **Só a consulta sai.** Sem id de usuário, sem Bearer, sem cookie, sem
 *    nada da conversa além do texto que o modelo montou para pesquisar. O que
 *    o Brave recebe é indistinguível de uma busca anônima — mesmo critério do
 *    `off-food.service.ts`, e pelo mesmo motivo: o produto trata dado de saúde.
 * 2. **Uma implementação concreta, sem interface.** Trocar de buscador é
 *    reescrever este arquivo. Uma abstração com um implementador só produziria
 *    o dublê de forma inventada que já custou caro neste repositório.
 * 3. **A chave vazia é degradação nomeada, não erro.** Instância sem
 *    `BRAVE_SEARCH_API_KEY` simplesmente não tem busca web; o resto do chat
 *    continua inteiro, como o reconhecimento por foto já faz sem `AGENT_BASE_URL`.
 * 4. **Falha do Brave nunca derruba o turno.** Ela volta como erro nomeado, o
 *    agente a entrega ao modelo como resultado de tool com falha, e a conversa
 *    segue — ver `tool_end` com `output-error` no `events.py`.
 */

const BRAVE_BASE_URL = 'https://api.search.brave.com/res/v1/web/search';

/**
 * `result_filter=web` corta as verticais que este serviço nunca lê.
 *
 * Não é cosmético: medido contra a API real, a mesma consulta devolve 21,4 kB
 * com `discussions`/`videos`/`faq` juntos e **6,2 kB** sem eles. Como o que sai
 * daqui são três campos por resultado, tudo isso seria baixado e descartado.
 *
 * `extra_snippets=false` pelo mesmo motivo — o `description` já é o trecho que
 * o modelo lê, e os extras só engordariam o resultado que volta no prompt.
 */
const FILTRO = { result_filter: 'web', extra_snippets: 'false' } as const;

/**
 * `pt-br`, e **não** `pt`. Medido: `search_lang=pt` é recusado com 422 e
 * `code: VALIDATION` — o enum do Brave separa `pt-br` de `pt-pt`.
 */
const IDIOMA = { country: 'BR', search_lang: 'pt-br', ui_lang: 'pt-BR' } as const;

/** Curto de propósito: isto roda dentro de um turno de chat que já está esperando. */
const TIMEOUT_MS = 6_000;

/** O que o modelo recebe de volta. Três campos e a data, quando ela existe. */
export interface ResultadoDaBusca {
  title: string;
  url: string;
  /** O trecho da página, já sem o HTML que o Brave embute. */
  description: string;
  /** ISO 8601 de `page_age`, quando o Brave soube datar a página. */
  date?: string;
}

/**
 * O recorte da resposta do Brave que este serviço lê.
 *
 * Tudo opcional porque o payload real varia por consulta — a mesma chamada
 * devolve `discussions`/`videos` numa busca e `faq` noutra, e resultado sem
 * `page_age` convive com resultado datado **na mesma resposta** (ver a fixture
 * `brave-creatina.json`). Declarar `title`/`url` como obrigatórios aqui seria
 * uma promessa que só o `any` do TypeScript sustentaria.
 */
interface RespostaDoBrave {
  web?: { results?: Array<Record<string, unknown>> };
}

/**
 * `<strong>` em volta do termo buscado — os únicos tags que aparecem nas
 * descrições reais, conferidos nas duas fixtures. O corte é genérico mesmo
 * assim: o Brave não documenta a lista, e markup vazando para o prompt do
 * modelo é ruído que ele tende a copiar para a resposta.
 */
function semHtml(texto: string): string {
  return texto
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

@Injectable()
export class BraveSearchService {
  private readonly logger = new Logger(BraveSearchService.name);

  constructor(private readonly config: ConfigService) {}

  /** `true` quando a instância tem chave configurada. */
  get disponivel(): boolean {
    return this.chave() !== null;
  }

  private chave(): string | null {
    const bruto = this.config.get<string>('BRAVE_SEARCH_API_KEY', '').trim();
    return bruto ? bruto : null;
  }

  async buscar(query: string, limite: number): Promise<ResultadoDaBusca[]> {
    const chave = this.chave();
    if (!chave) {
      throw new ServiceUnavailableException(
        'A busca na web não está configurada nesta instância. ' +
          'Responda com o que você já sabe, ou peça os dados pelas outras tools.',
      );
    }

    const url = new URL(BRAVE_BASE_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(limite));
    for (const [chaveDoParam, valor] of Object.entries({ ...IDIOMA, ...FILTRO })) {
      url.searchParams.set(chaveDoParam, valor);
    }

    let http: Response;
    try {
      http = await fetch(url, {
        // Nada do usuário viaja: sem `Authorization`, sem cookie, sem corpo. O
        // único header que identifica alguém é a chave da instância, que é da
        // Fatia e não de quem perguntou. Há teste fixando isto.
        headers: { Accept: 'application/json', 'X-Subscription-Token': chave },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (erro) {
      const causa = erro as Error;
      // Sem a consulta na mensagem: ela vai para o log, e uma pergunta de saúde
      // ("sintomas de …") é dado de saúde tanto quanto o resto.
      this.logger.warn(`Brave Search falhou: ${causa.name}`);
      throw new ServiceUnavailableException(
        'A busca na web não respondeu a tempo. Tente de novo ou responda sem ela.',
      );
    }

    if (!http.ok) {
      this.logger.warn(`Brave Search respondeu ${http.status}.`);
      // O 429 tem mensagem própria porque a ação de quem opera é outra: não é
      // "tente de novo", é "a cota do plano acabou". Medido no header da API
      // real, o plano gratuito conta numa janela de ~31 dias — ou seja, quem
      // esbarrar nisto vai esbarrar até o mês virar.
      throw new ServiceUnavailableException(
        http.status === 429
          ? 'A busca na web atingiu o limite de consultas do plano. Responda sem ela.'
          : 'A busca na web falhou. Responda com o que você já sabe.',
      );
    }

    const corpo = (await http.json()) as RespostaDoBrave;
    // `web` ausente é resposta legítima, não defeito: consulta que só casa com
    // outras verticais volta sem ela, e foi assim que o corpo de erro 422 veio.
    const brutos = corpo.web?.results ?? [];

    return brutos
      .map((bruto) => {
        const resultado: ResultadoDaBusca = {
          title: semHtml(texto(bruto.title)),
          url: texto(bruto.url),
          description: semHtml(texto(bruto.description)),
        };
        // `page_age`, e **não** `age`: medido contra a API real, `age` vem como
        // prosa em português ("há 2 semanas", "14 de abril de 2026") e muda com
        // o dia em que a busca acontece. `page_age` é ISO 8601 e estável.
        const data = texto(bruto.page_age);
        if (data) resultado.date = data;
        return resultado;
      })
      .filter((resultado) => resultado.url !== '');
  }
}
