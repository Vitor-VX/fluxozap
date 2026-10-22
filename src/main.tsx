import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { MusicNotificationPage } from './components/music/MusicNotificationPage.tsx';
import './index.css';

const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/';
createRoot(document.getElementById('root')!).render(
  normalizedPath === '/musica' ? <MusicNotificationPage /> : <App />
);
