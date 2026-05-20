import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Counter } from './Counter';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Missing root element');
}

createRoot(rootElement).render(<Counter />);
