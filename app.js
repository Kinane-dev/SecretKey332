const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const db = require('./db');
const bcrypt = require('bcrypt');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');

const app = express();
const PORT = process.env.PORT || 3000;

// EJS + layouts
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// Static & middlewares
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
  })
);

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

app.get('/', async (req, res) => {
  const threads = await db.all(
    `SELECT t.*, u.username, u.verified FROM threads t LEFT JOIN users u ON t.author_id = u.id ORDER BY t.created_at DESC`
  );
  res.render('index', { user: req.session.user, threads });
});

app.get('/thread/new', requireLogin, (req, res) => {
  res.render('new-thread', { user: req.session.user });
});

app.post('/thread/new', requireLogin, async (req, res) => {
  const { title, content } = req.body;
  await db.run(
    `INSERT INTO threads (title, content, author_id) VALUES (?, ?, ?)`,
    [title, content, req.session.user.id]
  );
  res.redirect('/');
});

app.get('/thread/:id', async (req, res) => {
  const id = req.params.id;
  const thread = await db.get(
    `SELECT t.*, u.username, u.verified FROM threads t LEFT JOIN users u ON t.author_id = u.id WHERE t.id = ?`,
    [id]
  );
  if (!thread) return res.status(404).send('Thread not found');
  const posts = await db.all(
    `SELECT p.*, u.username, u.verified FROM posts p LEFT JOIN users u ON p.author_id = u.id WHERE p.thread_id = ? ORDER BY p.created_at ASC`,
    [id]
  );
  res.render('thread', { user: req.session.user, thread, posts });
});

app.post('/thread/:id/post', requireLogin, async (req, res) => {
  const threadId = req.params.id;
  const { content } = req.body;
  await db.run(
    `INSERT INTO posts (thread_id, author_id, content) VALUES (?, ?, ?)`,
    [threadId, req.session.user.id, content]
  );
  res.redirect(`/thread/${threadId}`);
});

// Login
app.get('/login', (req, res) => {
  res.render('login', { user: req.session.user, error: null, register: false });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const row = await db.get(`SELECT * FROM users WHERE username = ?`, [username]);
  if (!row) {
    return res.render('login', { user: null, error: 'Invalid username or password', register: false });
  }
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) {
    return res.render('login', { user: null, error: 'Invalid username or password', register: false });
  }
  req.session.user = { id: row.id, username: row.username, verified: !!row.verified };
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Register
app.get('/register', (req, res) => {
  res.render('login', { user: req.session.user, error: null, register: true });
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.render('login', { user: null, error: 'Missing fields', register: true });
  }
  const existing = await db.get(`SELECT id FROM users WHERE username = ?`, [username]);
  if (existing) {
    return res.render('login', { user: null, error: 'Username taken', register: true });
  }
  const hash = await bcrypt.hash(password, 10);
  const info = await db.run(`INSERT INTO users (username, password_hash) VALUES (?, ?)`, [username, hash]);
  const userId = info.lastID;
  req.session.user = { id: userId, username, verified: false };
  res.redirect('/');
});

// Start server
(async () => {
  try {
    await db.init();
    app.listen(PORT, () => {
      console.log(`Forum demo running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start app:', err);
    process.exit(1);
  }
})();
