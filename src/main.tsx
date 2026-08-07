import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import './styles/globals.css';

const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element #root was not found in index.html');
}

ReactDOM.createRoot(container).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
