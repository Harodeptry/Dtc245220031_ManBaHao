const express = require('express');
const mysql = require('mysql2/promise');
const client = require('prom-client');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Thu thap metrics cho Prometheus
client.collectDefaultMetrics();
const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Tong so luot request',
  labelNames: ['method', 'route', 'status']
});

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'db',
  user: process.env.DB_USER || 'att_user',
  password: process.env.DB_PASSWORD || 'StrongP@ssw0rd2026',
  database: process.env.DB_NAME || 'attendance_db',
  waitForConnections: true,
  connectionLimit: 10
});

// Vong lap thu lai den khi MySQL san sang va tao bang thanh cong
async function initDB() {
  let connected = false;
  while (!connected) {
    try {
      const conn = await pool.getConnection();
      await conn.query(`
        CREATE TABLE IF NOT EXISTS checkins (
          id INT AUTO_INCREMENT PRIMARY KEY,
          student_id VARCHAR(50) NOT NULL,
          student_name VARCHAR(100) NOT NULL,
          checkin_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      conn.release();
      connected = true;
      console.log('Ket noi MySQL va kiem tra bang checkins thanh cong!');
    } catch (err) {
      console.log('Dang doi MySQL khoi dong... thu lai sau 3 giay');
      await new Promise(res => setTimeout(res, 3000));
    }
  }
}
initDB();

app.get('/', async (req, res) => {
  httpRequestCounter.inc({ method: 'GET', route: '/', status: 200 });
  try {
    const [rows] = await pool.query('SELECT * FROM checkins ORDER BY checkin_time DESC LIMIT 10');
    let tableRows = rows.map(r => `<tr><td>${r.student_id}</td><td>${r.student_name}</td><td>${r.checkin_time}</td></tr>`).join('');
    res.send(`
      <html>
        <head><title>He Thong Diem Danh</title></head>
        <body style="font-family:sans-serif; padding:20px;">
          <h2>He Thong Diem Danh Sinh Vien</h2>
          <form action="/checkin" method="POST">
            <input type="text" name="student_id" placeholder="Ma SV/NV" required/>
            <input type="text" name="student_name" placeholder="Ho Ten" required/>
            <button type="submit">Diem danh</button>
          </form>
          <h3>Lich su check-in</h3>
          <table border="1" cellpadding="8">
            <tr><th>Ma SV/NV</th><th>Ho Ten</th><th>Thoi gian</th></tr>
            ${tableRows}
          </table>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send('Co so du lieu dang khoi dong, vui long F5 sau vai giay...');
  }
});

app.post('/checkin', async (req, res) => {
  const { student_id, student_name } = req.body;
  if (student_id && student_name) {
    await pool.query('INSERT INTO checkins (student_id, student_name) VALUES (?, ?)', [student_id, student_name]);
    httpRequestCounter.inc({ method: 'POST', route: '/checkin', status: 200 });
    console.log(`[CHECKIN] SV: ${student_id} - ${student_name}`);
  }
  res.redirect('/');
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(3000, () => console.log('Attendance App running on port 3000'));
