import { JwtAuthGuard } from './jwt-auth.guard';
import { Reflector } from '@nestjs/core';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
    guard = new JwtAuthGuard(reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('allows public routes to pass without authentication', () => {
    reflector.getAllAndOverride.mockReturnValue(true); // isPublic = true
    const mockContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as Parameters<typeof guard.canActivate>[0];
    const result = guard.canActivate(mockContext);
    expect(result).toBe(true);
  });
});
