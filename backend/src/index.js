const express = require('express');

const app = express();
const port = process.env.PORT || 4000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'backend',
    now: new Date().toISOString(),
  });
});

app.listen(port, () => {
  console.log(`backend listening on port ${port}`);
});
