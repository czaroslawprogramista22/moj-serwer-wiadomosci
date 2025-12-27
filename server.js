require('dotenv').config();
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose(); // NOWOŚĆ

const app = express();
const port = process.env.PORT || 9999;
const HASLO = process.env.ADMIN_PASSWORD;

// --- KONFIGURACJA BAZY DANYCH ---
const db = new sqlite3.Database('./baza.db');

// Tworzymy tabelę, jeśli jeszcze nie istnieje
db.run(`CREATE TABLE IF NOT EXISTS wiadomosci (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT,
    tresc TEXT
)`);

app.use(morgan('dev'));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// --- ZABEZPIECZENIE ---
const sprawdzLogowanie = (req, res, next) => {
    if (req.cookies.zalogowany === 'true') next();
    else res.redirect('/login');
};

// --- LOGOWANIE ---
app.get('/login', (req, res) => {
    res.send(`
        <div style="text-align: center; margin-top: 100px; font-family: Arial;">
            <h2>Zaloguj się do bazy:</h2>
            <form action="/login" method="POST">
                <input type="password" name="haslo" autofocus style="padding:10px">
                <button type="submit" style="padding:10px">Wejdź</button>
            </form>
        </div>
    `);
});

app.post('/login', (req, res) => {
    if (req.body.haslo === HASLO) {
        res.cookie('zalogowany', 'true', { httpOnly: true });
        res.redirect('/');
    } else res.redirect('/login');
});

// --- ŚCIEŻKI API (SQL) ---

app.get('/', sprawdzLogowanie, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Pobieranie: SELECT
app.get('/api/lista', sprawdzLogowanie, (req, res) => {
    db.all("SELECT * FROM wiadomosci ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json(rows);
    });
});

// Dodawanie: INSERT
app.post('/api/wiadomosc', sprawdzLogowanie, (req, res) => {
    const tekst = req.body.wiadomosc.replace(/</g, "&lt;");
    const data = new Date().toLocaleString();

    db.run("INSERT INTO wiadomosci (data, tresc) VALUES (?, ?)", [data, tekst], function(err) {
        if (err) return res.status(500).send("Błąd bazy");
        res.json({ status: "ok", id: this.lastID });
    });
});

// Usuwanie: DELETE po ID (bardzo bezpieczne!)
app.post('/api/usun', sprawdzLogowanie, (req, res) => {
    const id = req.body.id;
    db.run("DELETE FROM wiadomosci WHERE id = ?", id, (err) => {
        if (err) return res.status(500).send("Błąd usuwania");
        res.json({ status: "usunięto" });
    });
});

app.listen(port, () => console.log(`Serwer z bazą SQL na http://localhost:${port}`));