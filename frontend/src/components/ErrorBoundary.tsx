import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[200px] p-6">
          <div
            className="rounded-xl p-6 max-w-sm w-full text-center"
            style={{
              background: '#1C1C1F',
              border: '1px solid #27272B',
              boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            }}
          >
            <div className="text-3xl mb-3">⚠</div>
            <h2 className="text-base font-semibold text-white mb-1">Something went wrong</h2>
            <p className="text-sm text-zinc-500 mb-4">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary px-5 py-2.5 text-sm"
            >
              Try reloading
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
