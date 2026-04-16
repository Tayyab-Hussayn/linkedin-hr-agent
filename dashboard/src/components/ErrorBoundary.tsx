'use client'

import React from 'react'
import { reportError } from '@/lib/errorReporter'

interface State {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Unknown error' }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError('React render error', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack
    })
  }

  private handleReload = () => {
    this.setState({ hasError: false, message: '' })
    if (typeof window !== 'undefined') window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg text-text-primary p-6">
          <div className="max-w-md w-full bg-surface border border-stroke rounded-xl p-6 text-center">
            <h2 className="text-lg font-semibold mb-2">Something broke.</h2>
            <p className="text-sm text-muted mb-4">{this.state.message}</p>
            <button
              onClick={this.handleReload}
              className="text-sm font-medium px-4 py-2 accent-gradient text-bg rounded-lg"
            >
              Reload Qalam
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
