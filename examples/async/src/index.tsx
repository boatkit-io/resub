import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Game } from './Game';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Missing root element');
}

createRoot(rootElement).render(<Game />);
