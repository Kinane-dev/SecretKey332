const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const database = require('./db'); // <-- objet avec init, run, get, all
const app = express();

// Initialisation DB
database.init().then(() => {
  console.log("✅ Database initialized");
}).catch(err => {
  console.error("❌ Failed to init DB:", err);
});

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Sessions (SQLite store au lieu de MemoryStore)
app.use(session({
  store: new SQLiteStore,
  secret: 'SecretUltraFort',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 1 semaine
}));

// Moteur de templates
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware pour injecter l’utilisateur connecté dans toutes les vues
app.use(async (req, res, next) => {
  if (req.session.userId) {
    const user = await database.get(`SELECT * FROM users WHERE id = ?`, [req.session.userId]);
    res.locals.user = user;
  } else {
    res.locals.user = null;
  }
  next();
});

// Multer config pour upload avatars
const uploadDir = path.join(__dirname, 'uploads/avatars');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, req.session.userId + '-' + Date.now() + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10Mo max
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Seules les images sont autorisées"));
    }
    cb(null, true);
  }
});

// Route GET profil
app.get('/MyProfile', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.render('MyProfile', { user: res.locals.user });
});

// Route POST update profil
app.post('/update-profile', upload.single('avatar'), async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');

  try {
    const newUsername = req.body.username;
    let avatarPath = res.locals.user.avatar;

    if (req.file) {
      avatarPath = '/uploads/avatars/' + req.file.filename;
    }

    await database.run(
      `UPDATE users SET username = ?, avatar = ? WHERE id = ?`,
      [newUsername, avatarPath, req.session.userId]
    );

    res.redirect('/MyProfile');
  } catch (err) {
    console.error("Erreur update profil:", err);
    res.status(500).send("Erreur lors de la mise à jour du profil");
  }
});

// Exemple route accueil
app.get('/', async (req, res) => {
  res.render('index', { body: "<h2>Bienvenue sur le forum</h2>" });
});

// Lancement serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Serveur démarré sur http://localhost:" + PORT);
});
