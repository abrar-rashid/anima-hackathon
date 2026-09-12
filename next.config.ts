import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@animahealth/adk'],
  async rewrites() {
    return [{ source: '/api/_test/writes', destination: '/api/test/writes' }]
  },
}

export default nextConfig
