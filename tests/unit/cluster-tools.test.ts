import {
  getClusterStatus,
  getAgent,
  parallelExecute,
  panelDiscussion,
  pipeline,
  voting,
} from '../../src/agent/tools/cluster.ts';

describe('cluster tools', () => {
  describe('getClusterStatus', () => {
    it('should return success:true with cluster data', async () => {
      const result = await getClusterStatus();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data).toHaveProperty('totalAgents');
      expect(result.data).toHaveProperty('byState');
      expect(result.data).toHaveProperty('agents');
      expect(Array.isArray(result.data.agents)).toBe(true);
    });
  });

  describe('getAgent', () => {
    it('should return success:false for a non-existent agent', async () => {
      const result = await getAgent('non-existent-agent-id');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('non-existent-agent-id');
    });
  });

  describe('parallelExecute', () => {
    it('should return error when tasks is an invalid JSON string', async () => {
      const result = await parallelExecute('{not valid json');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('JSON');
    });
  });

  describe('panelDiscussion', () => {
    it('should return error when agentIds is an invalid JSON string', async () => {
      const result = await panelDiscussion('some topic', 'not valid json');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('JSON');
    });
  });

  describe('pipeline', () => {
    it('should return error when steps is an invalid JSON string', async () => {
      const result = await pipeline('not valid json');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('JSON');
    });
  });

  describe('voting', () => {
    it('should return error when agentIds is an invalid JSON string', async () => {
      const result = await voting('a question', 'not valid json', '[]');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('JSON');
    });

    it('should return error when options is an invalid JSON string', async () => {
      const result = await voting('a question', '["agent_1"]', 'not valid json');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('JSON');
    });
  });
});
