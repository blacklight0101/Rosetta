import { render } from 'preact';
import { createApiClient } from './api/client.js';
import { App } from './app/App.js';
import { routes } from './app/routes.js';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';
import './styles/live-run.css';
import './styles/live-run-controls.css';
import './styles/run-answers.css';
import './styles/api-calls.css';
import './styles/cost.css';
import './styles/history.css';
import './styles/projects.css';

// P1-12: mounts the application. No inline script or style anywhere (RF-1013).

const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root element');

render(
  <App
    client={createApiClient()}
    routes={routes}
    assign={(path) => {
      window.location.assign(path);
    }}
  />,
  root,
);
