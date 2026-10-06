export interface CadDocResult {
  title: string;
  snippet: string;
  source: string;
  relevanceScore: number;
  symbol?: string;
}

export interface SearchCadDocsParams {
  query: string;
  library?: 'openscad' | 'bosl2' | 'all';
  limit?: number;
  endpointUrl?: string;
}

interface ContextCortexSearchResponse {
  results?: Array<{
    score?: number;
    payload?: {
      title?: string;
      content?: string;
      repo?: string;
      symbol?: string;
    };
  }>;
}

export async function searchCadDocs(
  params: SearchCadDocsParams,
): Promise<CadDocResult[]> {
  const endpoint =
    params.endpointUrl ||
    process.env.CONTEXTCORTEX_URL ||
    'http://contextcortex:3000';
  const url = `${endpoint.replace(/\/$/, '')}/admin/api/search/test`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: params.query,
        search_mode: 'hybrid',
        limit: params.limit || 3,
        repo:
          params.library === 'bosl2'
            ? 'BOSL2'
            : params.library === 'openscad'
              ? 'openscad-docs'
              : undefined,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return [];
    }

    const data = (await res.json()) as ContextCortexSearchResponse | null;
    if (!data || !Array.isArray(data.results)) {
      return [];
    }

    return data.results.map((r) => ({
      title: r.payload?.title || r.payload?.symbol || 'OpenSCAD Reference',
      snippet: r.payload?.content || '',
      source: r.payload?.repo || 'docs',
      relevanceScore: Number(r.score || 0),
      symbol: r.payload?.symbol,
    }));
  } catch {
    // Offline or network timeout fallback
    return [];
  }
}
