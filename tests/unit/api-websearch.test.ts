import { jest } from '@jest/globals';

// --- Mock config ---
function freshConfig() {
  return {
    api: {
      provider: 'openai',
      baseURL: 'https://api.test.com/v1',
      apiKey: 'sk-test-key',
      model: 'gpt-4',
    },
    search: {
      enabled: true,
      baseURL: '',
      recencyFilter: '',
      siteFilter: '',
    },
  };
}

let mockConfig: any = freshConfig();
const mockLoadConfig = jest.fn(() => mockConfig);

jest.unstable_mockModule('../../src/config.ts', () => ({
  loadConfig: mockLoadConfig,
}));

// --- Mock fetch ---
const fetchMock = jest.fn();
(globalThis as any).fetch = fetchMock;

const { search } = await import('../../src/api/webSearch.ts');

describe('api/webSearch.ts', () => {
  beforeEach(() => {
    mockConfig = freshConfig();
    mockLoadConfig.mockClear();
    fetchMock.mockReset();
  });

  describe('search - disabled state', () => {
    it('should return error when search is disabled (enabled === false)', async () => {
      mockConfig.search.enabled = false;
      const result = await search('query');
      expect(result.success).toBe(false);
      expect(result.error).toBe('搜索功能未启用');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should return error when cfg.search is undefined', async () => {
      delete mockConfig.search;
      const result = await search('query');
      expect(result.success).toBe(false);
      expect(result.error).toBe('搜索功能未启用');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should return error when cfg.search is null', async () => {
      mockConfig.search = null;
      const result = await search('query');
      expect(result.success).toBe(false);
      expect(result.error).toBe('搜索功能未启用');
    });
  });

  describe('search - URL building', () => {
    it('should use cfg.search.baseURL when provided', async () => {
      mockConfig.search.baseURL = 'https://search.custom.com/v1';
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await search('query');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://search.custom.com/v1');
    });

    it('should fall back to cfg.api.baseURL + /web-search-v2 when search.baseURL is empty', async () => {
      mockConfig.search.baseURL = '';
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await search('query');

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/v1/web-search-v2');
    });

    it('should fall back to default moark URL when both search.baseURL and api.baseURL are empty', async () => {
      mockConfig.search.baseURL = '';
      mockConfig.api.baseURL = '';
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await search('query');

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.moark.com/v1/web-search-v2');
    });

    it('should prefer search.baseURL over api.baseURL', async () => {
      mockConfig.search.baseURL = 'https://search.first.com';
      mockConfig.api.baseURL = 'https://api.second.com/v1';
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await search('query');

      expect(fetchMock.mock.calls[0][0]).toBe('https://search.first.com');
    });
  });

  describe('search - request body and headers', () => {
    it('should send POST with content, model=search, and auth headers', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await search('my query');

      const [, init] = fetchMock.mock.calls[0];
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(init.headers.Authorization).toBe('Bearer sk-test-key');

      const body = JSON.parse(init.body);
      expect(body.content).toBe('my query');
      expect(body.model).toBe('search');
      // No filters configured
      expect(body.search_recency_filter).toBeUndefined();
      expect(body.search_site_filter).toBeUndefined();
    });

    it('should include search_recency_filter when configured', async () => {
      mockConfig.search.recencyFilter = 'week';
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await search('q');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.search_recency_filter).toBe('week');
    });

    it('should include search_site_filter when configured', async () => {
      mockConfig.search.siteFilter = 'example.com';
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await search('q');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.search_site_filter).toBe('example.com');
    });

    it('should include both filters when both are configured', async () => {
      mockConfig.search.recencyFilter = 'month';
      mockConfig.search.siteFilter = 'gov.cn';
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await search('q');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.search_recency_filter).toBe('month');
      expect(body.search_site_filter).toBe('gov.cn');
    });

    it('should omit filters when they are empty strings', async () => {
      mockConfig.search.recencyFilter = '';
      mockConfig.search.siteFilter = '';
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await search('q');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).not.toHaveProperty('search_recency_filter');
      expect(body).not.toHaveProperty('search_site_filter');
    });
  });

  describe('search - success response', () => {
    it('should return success with parsed data on 200', async () => {
      const responseData = { results: [{ title: 't', url: 'u' }] };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => responseData,
      });

      const result = await search('query');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(responseData);
      expect(result.error).toBeUndefined();
    });

    it('should return success with null data when API returns null', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => null,
      });

      const result = await search('query');
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should return success with primitive data', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => 'plain string',
      });

      const result = await search('query');
      expect(result.success).toBe(true);
      expect(result.data).toBe('plain string');
    });
  });

  describe('search - HTTP error response', () => {
    it('should return error on non-OK status with status, statusText, and body text', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'server broke',
      });

      const result = await search('query');

      expect(result.success).toBe(false);
      expect(result.error).toContain('搜索请求失败 (500)');
      expect(result.error).toContain('Internal Server Error');
      expect(result.error).toContain('server broke');
    });

    it('should truncate response text to 200 characters in error', async () => {
      const longText = 'x'.repeat(500);
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => longText,
      });

      const result = await search('query');

      expect(result.success).toBe(false);
      // The error message includes status, statusText, and the first 200 chars
      expect(result.error).toContain('x'.repeat(200));
      // The full 500 chars should NOT be present
      expect(result.error).not.toContain('x'.repeat(201));
    });

    it('should handle 401 unauthorized', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'invalid api key',
      });

      const result = await search('query');
      expect(result.success).toBe(false);
      expect(result.error).toContain('401');
      expect(result.error).toContain('Unauthorized');
    });

    it('should handle empty error response body', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: async () => '',
      });

      const result = await search('query');
      expect(result.success).toBe(false);
      expect(result.error).toContain('502');
      expect(result.error).toContain('Bad Gateway');
    });
  });

  describe('search - network/exception errors', () => {
    it('should return error when fetch throws', async () => {
      fetchMock.mockRejectedValueOnce(new Error('network failure'));

      const result = await search('query');

      expect(result.success).toBe(false);
      expect(result.error).toBe('network failure');
    });

    it('should return error when fetch throws with no message', async () => {
      fetchMock.mockRejectedValueOnce(new Error());

      const result = await search('query');

      expect(result.success).toBe(false);
      // new Error() produces an empty string message, not undefined
      expect(result.error).toBe('');
    });

    it('should return error when response.json() throws', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('invalid json');
        },
      });

      const result = await search('query');

      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid json');
    });

    it('should return error when response.text() throws on error response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => {
          throw new Error('cannot read body');
        },
      });

      const result = await search('query');

      // text() rejection is caught by the outer try/catch
      expect(result.success).toBe(false);
      expect(result.error).toBe('cannot read body');
    });
  });

  describe('search - content parameter handling', () => {
    it('should pass empty string content to the API', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await search('');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.content).toBe('');
    });

    it('should pass multi-line content to the API', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const content = 'line1\nline2\nline3';
      await search(content);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.content).toBe(content);
    });

    it('should pass unicode/chinese content to the API', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await search('你好世界');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.content).toBe('你好世界');
    });
  });
});
