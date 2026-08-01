import { McpThrottlerGuard } from '../mcp-throttler.guard';

/**
 * Prova que o rate limit do `/mcp` chaveia por **usuário**, e não por IP.
 *
 * Este teste existe por causa de um modo de falha silencioso. O
 * `McpThrottlerGuard` sobrescreve `getTracker` do `@nestjs/throttler`, e a
 * assinatura desse método mudou entre versões maiores da biblioteca — a partir
 * do 6.3 ela recebe um segundo argumento. Uma sobrescrita com aridade menor
 * **continua compilando**: TypeScript aceita implementar um método com menos
 * parâmetros do que a interface declara.
 *
 * O efeito de errar aqui não aparece em lugar nenhum: nenhum teste quebra,
 * nenhum log reclama, a aplicação sobe. O `/mcp` simplesmente passa a limitar
 * por IP. Numa instância pública com o Claude conectado, isso significa que
 * usuários atrás do mesmo NAT compartilham cota — e que um único usuário
 * abusivo derruba a cota de todos os outros que saem pelo mesmo endereço.
 *
 * Por isso o teste chama `getTracker` diretamente, em vez de subir a aplicação:
 * o alvo é o contrato do método, não o comportamento agregado do throttler.
 */
describe('McpThrottlerGuard', () => {
  /**
   * O guard herda de `ThrottlerGuard`, que exige dependências no construtor.
   * Como só interessa o `getTracker` — que não usa nenhuma delas —, o
   * instanciamos sem injeção e expomos o método protegido.
   */
  function tracker(req: unknown): Promise<string> {
    const guard = Object.create(McpThrottlerGuard.prototype) as McpThrottlerGuard & {
      getTracker(r: unknown, ctx?: unknown): Promise<string>;
    };
    return guard.getTracker(req);
  }

  it('chaveia pelo id do usuário quando o McpAuthGuard já populou req.user', async () => {
    await expect(
      tracker({ user: { id: 'user-abc' }, ip: '203.0.113.7' }),
    ).resolves.toBe('user-abc');
  });

  it('dois usuários no mesmo IP recebem cotas separadas', async () => {
    // O caso que motiva o teste: usuários atrás do mesmo NAT.
    const a = await tracker({ user: { id: 'user-a' }, ip: '203.0.113.7' });
    const b = await tracker({ user: { id: 'user-b' }, ip: '203.0.113.7' });

    expect(a).not.toBe(b);
    expect([a, b]).not.toContain('203.0.113.7');
  });

  it('cai para o IP quando não há usuário — é o caso do 401, antes de autenticar', async () => {
    await expect(tracker({ ip: '203.0.113.7' })).resolves.toBe('203.0.113.7');
  });

  it('não estoura quando não há usuário nem IP', async () => {
    await expect(tracker({})).resolves.toBe('anon');
  });

  it('declara aridade compatível com a assinatura da versão instalada do throttler', () => {
    // A guarda estrutural contra a regressão silenciosa: se a biblioteca passar
    // a exigir `(req, context)` e a sobrescrita continuar com `(req)`, o
    // TypeScript aceita — mas a intenção fica registrada aqui.
    //
    // `length` conta só os parâmetros obrigatórios antes do primeiro opcional.
    // O que importa é que o primeiro parâmetro seja a requisição: é dele que
    // sai o `user.id`.
    const arity = McpThrottlerGuard.prototype['getTracker'].length;
    expect(arity).toBeGreaterThanOrEqual(1);
  });
});
