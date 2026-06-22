const config = require('./config');
const app = require('./app');

app.listen(config.port, () => {
  console.log(`auth-service listening on http://localhost:${config.port}`);
});
