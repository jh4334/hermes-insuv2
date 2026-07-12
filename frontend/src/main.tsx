import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    <Toaster
      theme="light"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: 'border border-[#d8c9b8] bg-[#fffaf3] text-[#2b1d18] shadow-lg',
          title: 'text-[#2b1d18]',
          description: 'text-[#6f6258]',
          actionButton: 'bg-[#9a0002] text-white',
          cancelButton: 'bg-[#eadfce] text-[#2b1d18]',
          success: 'border-[#9a0002]/40',
          error: 'border-red-300',
        },
      }}
    />
  </React.StrictMode>,
);
