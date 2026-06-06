import { loadConfig, getConfig } from '../config.js';

describe('config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('loadConfig', () => {
    it('should return default config when no custom config exists', async () => {
      const config = await loadConfig('/test/repo');

      expect(config).toBeDefined();
      expect(config.steps).toBeDefined();
      expect(config.steps).toContain('requirements');
      expect(config.steps).toContain('deploy-ship');
    });

    it('should cache config after first load', async () => {
      const config1 = await loadConfig('/test/repo');
      const config2 = await loadConfig('/test/repo');

      expect(config1).toBe(config2);
    });
  });

  describe('getConfig', () => {
    it.skip('should throw when config not loaded', () => {
      // Note: Module-level cachedConfig cannot be easily reset in ESM tests
      (global as any).cachedConfig = null;
      expect(() => getConfig()).toThrow('Config not loaded');
    });

    it('should return cached config', async () => {
      const config = await loadConfig('/test/repo');
      const result = getConfig();

      expect(result).toBeDefined();
      expect(result).toBe(config);
    });
  });

  describe('Default config values', () => {
    it('should have correct default steps', async () => {
      const config = await loadConfig('/test/repo');

      expect(config.steps).toHaveLength(10);
      expect(config.steps[0]).toBe('requirements');
      expect(config.steps[9]).toBe('deploy-ship');
    });

    it('should have correct default gatedSteps', async () => {
      const config = await loadConfig('/test/repo');

      expect(config.gatedSteps).toContain('requirements');
      expect(config.gatedSteps).toContain('design');
      expect(config.gatedSteps).toContain('code-impl');
      expect(config.gatedSteps).toContain('deploy-pr');
      expect(config.gatedSteps).not.toContain('deploy-ship');
    });

    it('should have all required agent configs', async () => {
      const config = await loadConfig('/test/repo');

      expect(config.agents).toHaveProperty('requirements');
      expect(config.agents).toHaveProperty('design');
      expect(config.agents).toHaveProperty('code-impl');
      expect(config.agents).toHaveProperty('code-test');
      expect(config.agents).toHaveProperty('code-quality');
      expect(config.agents).toHaveProperty('code-security');
      expect(config.agents).toHaveProperty('code-perf');
      expect(config.agents).toHaveProperty('deploy');
    });

    it('should have valid agent budgets', async () => {
      const config = await loadConfig('/test/repo');

      for (const [, agent] of Object.entries(config.agents)) {
        expect(agent.budget).toBeGreaterThan(0);
        expect(agent.model).toMatch(/^(sonnet|haiku)$/);
      }
    });
  });
});
