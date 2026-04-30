import { ConfirmDialog, Toast } from '@components';
import { render } from 'preact';
import { ErrorBoundary, LocationProvider, Route, Router } from 'preact-iso';
import { Dashboard } from './pages';
import './styles/global.scss';

function App() {
  return (
    <LocationProvider>
      <ErrorBoundary>
        <Router>
          <Route path="/" component={Dashboard} />
          <Route default component={Dashboard} />
        </Router>
      </ErrorBoundary>
      <Toast />
      <ConfirmDialog />
    </LocationProvider>
  );
}

render(<App />, document.getElementById('app')!);
