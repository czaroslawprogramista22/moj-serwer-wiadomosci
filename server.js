require('dotenv').config();
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const port = process.env.PORT || 9999;
const HASLO = process.env.ADMIN_PASSWORD;

// --- KONFIGURACJA BAZY DANYCH ---
const dbPath = process.env.RAILWAY_VOLUME_MOUNT_PATH ? 
               path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'baza.db') : 
               './baza.db';
const db = new sqlite3.Database(dbPath);

// Tworzenie tabel oraz INDEKSÓW dla wydajności
db.serialize(() => {
    // Tabela wiadomości
    db.run(`CREATE TABLE IF NOT EXISTS wiadomosci (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT,
        tresc TEXT
    )`);

    // Tabela logów fingerprintów
    db.run(`CREATE TABLE IF NOT EXISTS fp_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fp TEXT,
        nick TEXT,
        char_id INTEGER,
        account_id INTEGER,
        data TEXT
    )`);

    // --- NOWOŚĆ: INDEKS DLA WYDAJNOŚCI ---
    // Przyspiesza wyszukiwanie duplikatów przy dużej ilości danych
    db.run(`CREATE INDEX IF NOT EXISTS idx_fp ON fp_logs (fp)`);
});

// --- MIDDLEWARE ---
app.use(cors()); 
app.use(morgan('dev'));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// --- MECHANIZM LOGOWANIA DO PANELU ---
const sprawdzLogowanie = (req, res, next) => {
    if (req.cookies.zalogowany === 'true') next();
    else res.redirect('/login');
};

app.get('/login', (req, res) => {
    res.send(`
        <div style="text-align: center; margin-top: 100px; font-family: Arial;">
            <h2>Panel Administracyjny:</h2>
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

app.get('/logout', (req, res) => {
    res.clearCookie('zalogowany');
    res.redirect('/login');
});

// --- PANEL WWW (DASHBOARD) ---
app.get('/', sprawdzLogowanie, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/lista', sprawdzLogowanie, (req, res) => {
    db.all("SELECT * FROM wiadomosci ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json(rows);
    });
});

app.get('/api/logs', sprawdzLogowanie, (req, res) => {
    db.all("SELECT * FROM fp_logs ORDER BY id DESC LIMIT 50", [], (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json(rows);
    });
});

// --- API DLA SKRYPTU TAMPERMONKEY ---
app.post('/check', (req, res) => {
    const { fp, account } = req.body;

    // Dzięki indeksowi to zapytanie będzie błyskawiczne nawet przy milionie rekordów
    db.get("SELECT * FROM fp_logs WHERE fp = ? AND account_id != ? LIMIT 1", [fp, account], (err, row) => {
        if (err) return res.status(500).json({ code: 500, message: "Błąd bazy" });

        if (row) {
            res.json({ 
                fpIsLegal: false, 
                fpUsedByAccount: row.account_id, 
                fpUsedByNick: row.nick 
            });
        } else {
            res.json({ fpIsLegal: true, newlyRegistered: true, knownNick: true });
        }
    });
});

app.post('/log', (req, res) => {
    const { fp, nick, char, account } = req.body;
    const data = new Date().toLocaleString();

    db.run("INSERT INTO fp_logs (fp, nick, char_id, account_id, data) VALUES (?, ?, ?, ?, ?)", 
    [fp, nick, char, account, data], function(err) {
        if (err) return res.status(500).json({ code: 500, message: "Błąd zapisu" });
        res.json({ status: "ok" });
    });
});

// --- ZARZĄDZANIE WIADOMOŚCIAMI ---
app.post('/api/wiadomosc', sprawdzLogowanie, (req, res) => {
    const tekst = req.body.wiadomosc.replace(/</g, "&lt;");
    const data = new Date().toLocaleString();

    db.run("INSERT INTO wiadomosci (data, tresc) VALUES (?, ?)", [data, tekst], function(err) {
        if (err) return res.status(500).send("Błąd bazy");
        res.json({ status: "ok", id: this.lastID });
    });
});

app.post('/api/usun', sprawdzLogowanie, (req, res) => {
    const id = req.body.id;
    db.run("DELETE FROM wiadomosci WHERE id = ?", id, (err) => {
        if (err) return res.status(500).send("Błąd usuwania");
        res.json({ status: "usunięto" });
    });
});

app.listen(port, () => console.log(`Serwer działa na porcie ${port}`));

const axios = require('axios'); // Musisz wpisać: npm install axios

setInterval(() => {
    // Podmień na swój adres z Rendera!
    axios.get('https://moj-serwer-wiadomosci.onrender.com/')
        .then(() => console.log('Ping: Serwer utrzymany przy życiu'))
        .catch(err => console.log('Ping nieudany, ale to nic.'));
}, 1000 * 60 * 14); // Co 14 minut