import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Care Covenant',
  description: 'Accountable handover of an abnormal result across care settings (synthetic simulator data).',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
