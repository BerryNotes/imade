import React from 'react';
import ReactDOM from 'react-dom/client';
import { AudioProvider } from './components/AudioProvider';
import ErrorBoundary from './components/ErrorBoundary';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById("root")).render(
  <AudioProvider>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </AudioProvider>
);

if ('serviceWorker' in navigator && !window.electronAPI) {
  navigator.serviceWorker.register('/sw.js');
}
