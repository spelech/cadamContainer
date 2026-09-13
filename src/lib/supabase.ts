import type {
  AuthChangeEvent,
  Provider,
  Session,
  SupabaseClient,
  User,
} from '@supabase/supabase-js';
import type { Database } from '@shared/database';

// In standalone mode with native OIDC and PostgreSQL, Supabase configuration is never missing.
export const isSupabaseConfigMissing = false;

const getEnvVar = (key: string): string => {
  if (
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env[key] !== undefined
  ) {
    return import.meta.env[key];
  }
  if (
    typeof process !== 'undefined' &&
    process.env &&
    process.env[key] !== undefined
  ) {
    return process.env[key]!;
  }
  return '';
};

export type ExtendedProvider = Provider | 'pocketid';

// When self-hosted or using native OIDC, pocketid is the active SSO provider
export const ssoProvider: (Provider | 'pocketid') & (Provider | null) =
  ((getEnvVar('VITE_SSO_PROVIDER') ||
    'pocketid') as unknown as (Provider | 'pocketid') & Provider);

export const accountUrl = getEnvVar('VITE_ACCOUNT_URL');

// The single "Adam owns this profile" flag: true only when external account management is configured
export const ssoManaged = Boolean(
  getEnvVar('VITE_SSO_MANAGED') === 'true' ||
    (getEnvVar('VITE_ACCOUNT_URL') && ssoProvider),
);

// Fresh provider-owned claims for the signed-in user
export function ssoClaims(user: User | null | undefined): {
  name?: string;
  avatar_url?: string;
  picture?: string;
  [key: string]: any;
} | undefined {
  if (!user) return undefined;
  const metadata = (user.user_metadata || {}) as Record<string, any>;
  const name =
    metadata.full_name ||
    metadata.name ||
    user.email ||
    undefined;
  const avatarUrl =
    metadata.avatar_url ||
    metadata.picture ||
    (user as any).avatar_url ||
    undefined;

  return {
    name,
    avatar_url: avatarUrl,
    picture: avatarUrl,
  };
}

export function getBasePath(): string {
  const base = getEnvVar('BASE_URL') || '/cadam';
  return base.replace(/\/$/, '');
}

// In-memory state for auth session
let cachedUser: User | null = null;
const authListeners = new Set<(event: AuthChangeEvent, session: Session | null) => void>();

export function _setCachedUserForTesting(user: User | null) {
  cachedUser = user;
}

export function _clearAuthListenersForTesting() {
  authListeners.clear();
}

function notifyAuthListeners(event: AuthChangeEvent, session: Session | null) {
  for (const listener of authListeners) {
    try {
      listener(event, session);
    } catch (e) {
      console.error('Error in auth listener:', e);
    }
  }
}

class QueryBuilder<T = any> implements PromiseLike<{ data: T | null; error: any }> {
  private table: string;
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private actionPayload: any = null;
  private filters: Record<string, any> = {};
  private orderBy: { column: string; ascending: boolean }[] = [];
  private limitCount: number | null = null;
  private isSingle = false;
  private hasSelect = false;
  private selectColumns = '*';

  constructor(table: string) {
    this.table = table;
  }

  select(columns = '*', _options?: any): this {
    this.hasSelect = true;
    this.selectColumns = columns;
    return this;
  }

  insert(values: any, _options?: any): this {
    this.action = 'insert';
    this.actionPayload = values;
    return this;
  }

  update(values: any, _options?: any): this {
    this.action = 'update';
    this.actionPayload = values;
    return this;
  }

  upsert(values: any, _options?: any): this {
    this.action = 'insert';
    this.actionPayload = values;
    return this;
  }

  delete(_options?: any): this {
    this.action = 'delete';
    return this;
  }

  eq(column: string, value: any): this {
    this.filters[column] = value;
    return this;
  }

  neq(_column: string, _value: any): this {
    return this;
  }

  in(_column: string, _values: any[]): this {
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderBy.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number, _options?: any): this {
    this.limitCount = count;
    return this;
  }

  single(): this {
    this.isSingle = true;
    return this;
  }

  maybeSingle(): this {
    this.isSingle = true;
    return this;
  }

  is(_column: string, _value: any): this {
    return this;
  }

  like(_column: string, _pattern: string): this {
    return this;
  }

  ilike(_column: string, _pattern: string): this {
    return this;
  }

  match(_criteria: Record<string, any>): this {
    return this;
  }

  range(_from: number, _to: number): this {
    return this;
  }

  overrideTypes<U>(): QueryBuilder<U> {
    return this as unknown as QueryBuilder<U>;
  }

  async execute(): Promise<{ data: any; error: any; status?: number; statusText?: string }> {
    const basePath = getBasePath();

    try {
      if (this.table === 'conversations') {
        return await this.handleConversations(basePath);
      } else if (this.table === 'messages') {
        return await this.handleMessages(basePath);
      } else if (this.table === 'profiles') {
        return await this.handleProfiles(basePath);
      } else {
        // Fallback for non-persisted client-side tables (images, meshes, etc.)
        return { data: null, error: null, status: 200, statusText: 'OK' };
      }
    } catch (err: any) {
      return {
        data: null,
        error: {
          message: err?.message || 'Network error',
          code: 'FETCH_ERROR',
          details: null,
          hint: '',
        },
        status: 500,
        statusText: 'Internal Error',
      };
    }
  }

  private async handleConversations(basePath: string): Promise<any> {
    if (this.action === 'select') {
      const convId = this.filters.id;
      const url = convId
        ? `${basePath}/api/conversations/${encodeURIComponent(convId)}`
        : `${basePath}/api/conversations`;

      const res = await fetch(url, { method: 'GET', credentials: 'include' });
      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        return {
          data: null,
          error: {
            message: errorJson.error || 'Error fetching conversation(s)',
            code: String(res.status),
          },
          status: res.status,
        };
      }

      let data = await res.json();
      if (Array.isArray(data)) {
        // Enrich conversations for list views like HistoryView
        data = data.map((conv: any) => ({
          ...conv,
          first_message: conv.first_message ?? [],
          messagesCount: conv.messagesCount ?? [{ count: 0 }],
          settings: conv.settings ?? {},
        }));

        // Client-side ordering if requested
        if (this.orderBy.length > 0) {
          for (const { column, ascending } of this.orderBy) {
            data.sort((a: any, b: any) => {
              const valA = a[column];
              const valB = b[column];
              if (valA === valB) return 0;
              if (valA === undefined || valA === null) return 1;
              if (valB === undefined || valB === null) return -1;
              return ascending ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
            });
          }
        }

        if (this.limitCount !== null) {
          data = data.slice(0, this.limitCount);
        }

        if (this.isSingle) {
          if (data.length === 0) {
            return {
              data: null,
              error: { message: 'No rows found', code: 'PGRST116' },
              status: 404,
            };
          }
          data = data[0];
        }
      } else if (data && typeof data === 'object') {
        data = {
          ...data,
          first_message: data.first_message ?? [],
          messagesCount: data.messagesCount ?? [{ count: 0 }],
          settings: data.settings ?? {},
        };
      }

      return { data, error: null, status: 200 };
    }

    if (this.action === 'insert') {
      const payload = Array.isArray(this.actionPayload)
        ? this.actionPayload[0]
        : this.actionPayload;

      const res = await fetch(`${basePath}/api/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
        credentials: 'include',
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        return {
          data: null,
          error: {
            message: errorJson.error || 'Failed to create conversation',
            code: String(res.status),
          },
          status: res.status,
        };
      }

      const data = await res.json();
      return {
        data: this.isSingle ? data : (this.hasSelect ? [data] : data),
        error: null,
        status: 201,
      };
    }

    if (this.action === 'update') {
      const id = this.filters.id || this.actionPayload?.id;
      if (!id) {
        return {
          data: null,
          error: { message: 'Missing conversation id for update', code: '400' },
          status: 400,
        };
      }

      const res = await fetch(
        `${basePath}/api/conversations/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.actionPayload || {}),
          credentials: 'include',
        },
      );

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        return {
          data: null,
          error: {
            message: errorJson.error || 'Failed to update conversation',
            code: String(res.status),
          },
          status: res.status,
        };
      }

      const data = await res.json();
      return {
        data: this.isSingle ? data : (this.hasSelect ? [data] : data),
        error: null,
        status: 200,
      };
    }

    if (this.action === 'delete') {
      const id = this.filters.id;
      if (!id) {
        return {
          data: null,
          error: { message: 'Missing conversation id for delete', code: '400' },
          status: 400,
        };
      }

      const res = await fetch(
        `${basePath}/api/conversations/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          credentials: 'include',
        },
      );

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        return {
          data: null,
          error: {
            message: errorJson.error || 'Failed to delete conversation',
            code: String(res.status),
          },
          status: res.status,
        };
      }

      return { data: null, error: null, status: 200 };
    }

    return { data: null, error: null };
  }

  private async handleMessages(basePath: string): Promise<any> {
    if (this.action === 'select') {
      const convId =
        this.filters.conversation_id || this.filters.conversationId;
      if (!convId) {
        return {
          data: [],
          error: {
            message: 'Valid conversationId is required',
            code: '400',
          },
          status: 400,
        };
      }

      const res = await fetch(
        `${basePath}/api/messages?conversationId=${encodeURIComponent(convId)}`,
        {
          method: 'GET',
          credentials: 'include',
        },
      );

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        return {
          data: null,
          error: {
            message: errorJson.error || 'Failed to fetch messages',
            code: String(res.status),
          },
          status: res.status,
        };
      }

      let data = await res.json();
      if (Array.isArray(data)) {
        if (this.orderBy.length > 0) {
          for (const { column, ascending } of this.orderBy) {
            data.sort((a: any, b: any) => {
              const valA = a[column];
              const valB = b[column];
              if (valA === valB) return 0;
              if (valA === undefined || valA === null) return 1;
              if (valB === undefined || valB === null) return -1;
              return ascending ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
            });
          }
        }
        if (this.limitCount !== null) {
          data = data.slice(0, this.limitCount);
        }
        if (this.isSingle) {
          if (data.length === 0) {
            return {
              data: null,
              error: { message: 'No rows found', code: 'PGRST116' },
              status: 404,
            };
          }
          data = data[0];
        }
      }

      return { data, error: null, status: 200 };
    }

    if (this.action === 'insert') {
      const payload = Array.isArray(this.actionPayload)
        ? this.actionPayload[0]
        : this.actionPayload;

      const res = await fetch(`${basePath}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
        credentials: 'include',
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        return {
          data: null,
          error: {
            message: errorJson.error || 'Failed to create message',
            code: String(res.status),
          },
          status: res.status,
        };
      }

      const data = await res.json();
      return {
        data: this.isSingle ? data : (this.hasSelect ? [data] : data),
        error: null,
        status: 201,
      };
    }

    if (this.action === 'update') {
      const id = this.filters.id || this.actionPayload?.id;
      if (!id) {
        return {
          data: null,
          error: { message: 'Missing message id for update', code: '400' },
          status: 400,
        };
      }

      const res = await fetch(
        `${basePath}/api/messages?id=${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.actionPayload || {}),
          credentials: 'include',
        },
      );

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        return {
          data: null,
          error: {
            message: errorJson.error || 'Failed to update message',
            code: String(res.status),
          },
          status: res.status,
        };
      }

      const data = await res.json();
      return {
        data: this.isSingle ? data : (this.hasSelect ? [data] : data),
        error: null,
        status: 200,
      };
    }

    if (this.action === 'delete') {
      const id = this.filters.id;
      if (!id) {
        return {
          data: null,
          error: { message: 'Missing message id for delete', code: '400' },
          status: 400,
        };
      }

      const res = await fetch(
        `${basePath}/api/messages?id=${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          credentials: 'include',
        },
      );

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        return {
          data: null,
          error: {
            message: errorJson.error || 'Failed to delete message',
            code: String(res.status),
          },
          status: res.status,
        };
      }

      return { data: null, error: null, status: 200 };
    }

    return { data: null, error: null };
  }

  private async handleProfiles(basePath: string): Promise<any> {
    if (this.action === 'select') {
      const res = await fetch(`${basePath}/api/auth/me`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!res.ok) {
        return {
          data: null,
          error: { message: 'Profile not found', code: 'PGRST116' },
          status: 404,
        };
      }

      const json = await res.json();
      const user = json.user;
      if (!user) {
        return {
          data: null,
          error: { message: 'Profile not found', code: 'PGRST116' },
          status: 404,
        };
      }

      const profile = {
        id: user.id,
        user_id: user.id,
        email: user.email,
        full_name: user.display_name || user.user_metadata?.full_name || '',
        avatar_path: user.avatar_url || user.user_metadata?.avatar_url || '',
        notifications_enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      return {
        data: this.isSingle ? profile : [profile],
        error: null,
        status: 200,
      };
    }

    if (this.action === 'update') {
      const updated = {
        id: this.filters.user_id || 'user-id',
        user_id: this.filters.user_id || 'user-id',
        ...this.actionPayload,
        updated_at: new Date().toISOString(),
      };
      return {
        data: this.isSingle ? updated : (this.hasSelect ? [updated] : updated),
        error: null,
        status: 200,
      };
    }

    return { data: null, error: null };
  }

  then<TResult1 = { data: T | null; error: any }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: T | null; error: any }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled as any, onrejected as any);
  }
}

function from(table: string): any {
  return new QueryBuilder(table);
}

const auth = {
  async getUser(_token?: string) {
    try {
      const res = await fetch(`${getBasePath()}/api/auth/me`, {
        credentials: 'include',
      });
      if (!res.ok) {
        cachedUser = null;
        return { data: { user: null }, error: new Error('Unauthorized') };
      }
      const data = await res.json();
      if (data.user) {
        cachedUser = data.user;
        return { data: { user: data.user }, error: null };
      }
      cachedUser = null;
      return { data: { user: null }, error: new Error('User not found') };
    } catch (err: any) {
      cachedUser = null;
      return { data: { user: null }, error: err };
    }
  },

  async getSession() {
    if (!cachedUser) {
      const { data } = await this.getUser();
      if (data.user) {
        cachedUser = data.user;
      }
    }
    const session: Session | null = cachedUser
      ? ({
          user: cachedUser,
          access_token: 'local-session',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'local-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        } as any)
      : null;
    return { data: { session }, error: null };
  },

  async refreshSession() {
    const { data, error } = await this.getUser();
    if (error || !data.user) {
      cachedUser = null;
      return { data: { session: null, user: null }, error: null };
    }
    cachedUser = data.user;
    const session: Session = {
      user: cachedUser,
      access_token: 'local-session',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'local-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    } as any;
    notifyAuthListeners('TOKEN_REFRESHED', session);
    return { data: { session, user: cachedUser }, error: null };
  },

  async signInWithOAuth({
    provider = 'pocketid',
    options,
  }: {
    provider?: string;
    options?: { redirectTo?: string; queryParams?: Record<string, string> };
  } = {}) {
    const redirect = options?.redirectTo || '/';
    const target = `${getBasePath()}/api/auth/login?redirect=${encodeURIComponent(redirect)}`;
    if (typeof window !== 'undefined') {
      window.location.href = target;
    }
    return { data: { provider, url: target }, error: null };
  },

  async signOut() {
    try {
      await fetch(`${getBasePath()}/api/auth/logout`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
    } catch {
      // Ignore network error on logout
    }
    cachedUser = null;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('session');
      } catch {
        // Ignore localStorage error
      }
    }
    notifyAuthListeners('SIGNED_OUT', null);
    return { error: null };
  },

  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void,
  ) {
    authListeners.add(callback);
    const initialSession: Session | null = cachedUser
      ? ({
          user: cachedUser,
          access_token: 'local-session',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'local-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        } as any)
      : null;

    setTimeout(() => {
      callback('INITIAL_SESSION', initialSession);
    }, 0);

    return {
      data: {
        subscription: {
          id: crypto.randomUUID(),
          callback,
          unsubscribe: () => {
            authListeners.delete(callback);
          },
        },
      },
    };
  },

  async signInWithPassword(_credentials?: any) {
    await this.signInWithOAuth({ provider: 'pocketid' });
    return { data: { user: null, session: null }, error: null };
  },

  async signUp(_credentials?: any) {
    await this.signInWithOAuth({ provider: 'pocketid' });
    return { data: { user: null, session: null }, error: null };
  },

  async signInWithOtp(_params?: any) {
    await this.signInWithOAuth({ provider: 'pocketid' });
    return { data: { user: null, session: null }, error: null };
  },

  async verifyOtp(_params?: any) {
    return {
      data: { user: null, session: null },
      error: new Error('SSO is enabled. Direct OTP verification is disabled.'),
    };
  },

  async resetPasswordForEmail(_email: string, _options?: any) {
    return {
      data: null,
      error: new Error('Password management is handled by your SSO provider.'),
    };
  },

  async updateUser(attributes: any) {
    if (cachedUser && attributes?.data) {
      cachedUser.user_metadata = {
        ...cachedUser.user_metadata,
        ...attributes.data,
      };
    }
    return { data: { user: cachedUser }, error: null };
  },

  admin: {
    deleteUser: async () => ({ data: null, error: null }),
    listUsers: async () => ({ data: { users: [] }, error: null }),
  },
};

const storage = {
  from: (bucket: string) => ({
    upload: async (path: string, _file: any, _options?: any) => ({
      data: { path, id: path, fullPath: `${bucket}/${path}` },
      error: null,
    }),
    download: async (_path: string) => ({
      data: new Blob([]),
      error: null,
    }),
    list: async (_folder?: string, _options?: any) => ({
      data: [],
      error: null,
    }),
    remove: async (_paths: string[]) => ({
      data: [],
      error: null,
    }),
    getPublicUrl: (path: string) => ({
      data: { publicUrl: `${getBasePath()}/api/storage/${bucket}/${path}` },
    }),
  }),
};

function createChannel(name: string) {
  const ch = {
    topic: name,
    params: {},
    on: (_type: string, _filter: any, _callback?: Function) => ch,
    subscribe: (callback?: Function) => {
      if (callback) {
        setTimeout(() => callback('SUBSCRIBED'), 0);
      }
      return ch;
    },
    unsubscribe: async () => {},
    send: async (_message?: any) => 'ok' as const,
    track: async (_state?: any) => 'ok' as const,
    untrack: async () => 'ok' as const,
  };
  return ch;
}

export const supabase = {
  auth,
  from,
  storage,
  channel: createChannel,
  removeChannel: (_channel: any) => 'ok' as const,
} as unknown as SupabaseClient<Database>;
