import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

interface State {
  error: Error | null;
}

/** Shows a readable message instead of a blank page when something crashes while rendering. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro na interface:', error, info.componentStack);
  }

  private resetPrefs = () => {
    try {
      localStorage.removeItem('htt-prefs');
    } catch {
      /* storage unavailable */
    }
    window.location.assign('/tasks');
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fatal">
        <div className="empty-state">
          <div className="empty-icon" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
            <AlertTriangle size={26} />
          </div>
          <h3>Algo deu errado na tela</h3>
          <p className="muted">
            Seus dados estão salvos no servidor. Recarregue a página; se o problema continuar, redefina as preferências deste
            navegador (tema, usuário e visualizações).
          </p>
          <p className="muted">
            <code>{this.state.error.message}</code>
          </p>
          <div className="empty-actions">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              <RefreshCw size={16} /> Recarregar
            </button>
            <button type="button" className="btn btn-secondary" onClick={this.resetPrefs}>
              <RotateCcw size={16} /> Redefinir preferências
            </button>
          </div>
        </div>
      </div>
    );
  }
}
