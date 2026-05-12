import { JwtAuthGuard } from './jwt-auth.guard';
import { Reflector } from '@nestjs/core';
import type { JwtValidationService } from './jwt-validation.service';
import type { UserProvisioningService } from './user-provisioning.service';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
    const validation = {} as unknown as JwtValidationService;
    const provisioning = {} as unknown as UserProvisioningService;
    guard = new JwtAuthGuard(reflector, validation, provisioning);
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
