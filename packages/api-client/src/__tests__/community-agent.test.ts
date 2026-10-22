import { describe, expect, it } from 'vitest';
import {
  AGENT_INSTRUCTIONS_MAX,
  AGENT_NAME_MAX,
  agentProblem,
  suggestedAgentName,
} from '../community-agent';
import { activePanelSection, panelHref, panelSections } from '../community-panel';
import { routeInfo } from '../navigation';

describe('agente da comunidade (Fase 7c)', () => {
  it('o nome precisa caber numa linha do prompt: sem quebra, sem < ou >, até 40', () => {
    expect(agentProblem({ name: 'Treinador Norte', instructions: '' })).toBeNull();
    expect(agentProblem({ name: ' ', instructions: '' })).toBe('Dê um nome ao agente.');
    expect(agentProblem({ name: 'Coach\nnovo', instructions: '' })).toMatch(/quebra de linha/);
    expect(agentProblem({ name: '<<<x>>>', instructions: '' })).toMatch(/< ou >/);
    expect(agentProblem({ name: 'x'.repeat(AGENT_NAME_MAX + 1), instructions: '' })).toMatch(
      /até 40/,
    );
  });

  it('as orientações têm o teto da API', () => {
    expect(
      agentProblem({ name: 'Coach', instructions: 'a'.repeat(AGENT_INSTRUCTIONS_MAX) }),
    ).toBeNull();
    expect(
      agentProblem({ name: 'Coach', instructions: 'a'.repeat(AGENT_INSTRUCTIONS_MAX + 1) }),
    ).toMatch(/até 2000/);
  });

  it('o nome sugerido cabe no limite', () => {
    expect(suggestedAgentName('Academia Demo')).toBe('Assistente Academia Demo');
    expect(suggestedAgentName('A'.repeat(80)).length).toBeLessThanOrEqual(AGENT_NAME_MAX);
  });

  it('a seção Agente é só do dono', () => {
    expect(panelSections('OWNER').map((s) => s.section)).toContain('agent');
    expect(panelSections('PROFESSIONAL').map((s) => s.section)).not.toContain('agent');
    expect(panelHref('g1', 'agent')).toBe('/org/g1/agent');
    expect(activePanelSection('/org/g1/agent')).toBe('agent');
    expect(routeInfo('/org/g1/agent')).toMatchObject({ title: 'Agente', parent: '/org/g1' });
  });
});
