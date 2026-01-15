'use client'

import { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo })

    // Call the optional error callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    // Log to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="max-w-md w-full text-center">
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 mb-4">
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">
                Something went wrong
              </h2>
              <p className="text-gray-400">
                An unexpected error occurred. Please try again or return to the home page.
              </p>
            </div>

            {/* Error details (collapsible in production) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-400">
                  <span className="inline-flex items-center gap-1">
                    <Bug className="w-3 h-3" />
                    Error Details
                  </span>
                </summary>
                <div className="mt-2 p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                  <p className="text-sm font-mono text-red-400 break-all">
                    {this.state.error.message}
                  </p>
                  {this.state.errorInfo?.componentStack && (
                    <pre className="mt-2 text-xs text-gray-500 overflow-auto max-h-40">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              </details>
            )}

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className={cn(
                  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg',
                  'bg-synapse-500 hover:bg-synapse-400 text-white font-medium',
                  'transition-colors'
                )}
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              <button
                onClick={this.handleGoHome}
                className={cn(
                  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg',
                  'bg-gray-700 hover:bg-gray-600 text-white font-medium',
                  'transition-colors'
                )}
              >
                <Home className="w-4 h-4" />
                Go Home
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Functional wrapper for easier use with hooks
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    )
  }
}
