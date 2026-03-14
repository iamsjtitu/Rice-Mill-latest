import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center" data-testid="error-boundary">
          <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-6 max-w-md">
            <h2 className="text-red-400 text-lg font-bold mb-2">Kuch galat ho gaya!</h2>
            <p className="text-slate-300 text-sm mb-4">
              Is page mein error aa gaya hai. Neeche button click karke dobara try karein.
            </p>
            {this.state.error && (
              <p className="text-slate-500 text-xs mb-4 font-mono bg-slate-800 p-2 rounded overflow-auto max-h-20">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-md text-sm font-medium"
              data-testid="error-retry-btn"
            >
              Dobara Try Karein
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
