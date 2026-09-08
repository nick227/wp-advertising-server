import { createApp } from './app.js';
import { config, validateConfig } from './config.js';

validateConfig();
const app = createApp();

app.listen(config.port, () => {
  console.log(`wp-advertising-admin listening on :${config.port}`);
  console.log(`ad server: ${config.adServerBaseUrl}`);
});
