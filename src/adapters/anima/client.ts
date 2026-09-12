export type AnimaResponse<T> = { status: number; body: T }

export class AnimaClient {
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(options?: { apiKey?: string; baseUrl?: string }) {
    if (typeof window !== 'undefined') {
      throw new Error('Anima client is server-only')
    }
    this.apiKey = options?.apiKey ?? process.env.ANIMA_SIM_API_KEY ?? ''
    this.baseUrl = (options?.baseUrl ?? process.env.ANIMA_SIM_BASE_URL ?? 'https://sim.animahacks.com').replace(
      /\/$/,
      '',
    )
    if (!this.apiKey) {
      throw new Error('ANIMA_SIM_API_KEY is required')
    }
  }

  async request<T>(path: string, init?: RequestInit): Promise<AnimaResponse<T>> {
    if (typeof window !== 'undefined') {
      throw new Error('Anima client is server-only')
    }
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${this.apiKey}`)
    headers.set('Accept', 'application/json')
    if (init?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers })
    const text = await response.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }
    return { status: response.status, body: body as T }
  }
}

export function createAnimaClient(options?: { apiKey?: string; baseUrl?: string }): AnimaClient {
  return new AnimaClient(options)
}

if (typeof window !== 'undefined') {
  throw new Error('Anima client is server-only')
}
