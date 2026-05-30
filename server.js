require('dotenv').config();
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 9999;
const HASLO = process.env.ADMIN_PASSWORD;

// HASŁO ZABEZPIECZAJĄCE PRZED OBCYMI
const TAJNE_HASLO_BOTA = "Szef_Ma_Dostep_123!";

// --- KONFIGURACJA BAZY DANYCH ---
const dbPath = './baza.db';
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS wiadomosci (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT, tresc TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS fp_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, fp TEXT, nick TEXT, char_id INTEGER, account_id INTEGER, data TEXT)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_fp ON fp_logs (fp)`);
});

// --- AUTOMATYCZNE CZYSZCZENIE (7 DNI) ---
setInterval(() => {
    db.run("DELETE FROM fp_logs WHERE data < date('now', '-7 days')");
}, 1000 * 60 * 60 * 24);

// --- SAMOPING (WYBUDZANIE RENDERA) ---
setInterval(() => {
    const MY_URL = 'https://moj-serwer-wiadomosci.onrender.com/'; 
    axios.get(MY_URL).catch(() => {});
}, 1000 * 60 * 14);

app.use(cors()); app.use(morgan('dev')); app.use(cookieParser());
app.use(express.json()); app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// --- LOGOWANIE DO PANELU ---
const sprawdzLogowanie = (req, res, next) => {
    if (req.cookies.zalogowany === 'true') next();
    else res.redirect('/login');
};

app.get('/login', (req, res) => {
    res.send(`<div style="text-align:center;margin-top:100px;font-family:Arial;"><h2>Panel:</h2><form action="/login" method="POST"><input type="password" name="haslo" autofocus style="padding:10px"><button type="submit" style="padding:10px">Wejdź</button></form></div>`);
});

app.post('/login', (req, res) => {
    if (req.body.haslo === HASLO) { res.cookie('zalogowany', 'true', { httpOnly: true }); res.redirect('/'); }
    else res.redirect('/login');
});

app.get('/', sprawdzLogowanie, (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/api/lista', sprawdzLogowanie, (req, res) => db.all("SELECT * FROM wiadomosci ORDER BY id DESC", [], (err, rows) => res.json(rows)));
app.get('/api/logs', sprawdzLogowanie, (req, res) => {
    const query = `SELECT *, (SELECT COUNT(DISTINCT account_id) FROM fp_logs f2 WHERE f2.fp = fp_logs.fp) as uzytkownikow FROM fp_logs ORDER BY id DESC LIMIT 500`;
    db.all(query, [], (err, rows) => res.json(rows));
});

// --- API DLA SKRYPTU Z BLOKADĄ OBCYCH ---
app.post('/check', (req, res) => {
    const { fp, account, nick, char, token } = req.body; // Serwer odbiera 'token'
    const data = new Date().toISOString();

    // SPRAWDZENIE HASŁA: Jeśli brak hasła lub jest złe – udajemy multikonto i wyrzucamy z gry!
    if (token !== TAJNE_HASLO_BOTA) {
        console.log(`[ODCIĘTO] Nieautoryzowany użytkownik! Nick: ${nick}, ID: ${account}`);
        return res.json({ 
            fpIsLegal: false, 
            fpUsedByNick: "SYSTEM_SECURITY", 
            fpUsedByAccount: "ZABLOKOWANO" 
        });
    }

    // Normalna logika dla Twoich zaufanych ludzi:
    db.run("INSERT INTO fp_logs (fp, nick, char_id, account_id, data) VALUES (?, ?, ?, ?, ?)", [fp, nick, char, account, data]);

    const query = `SELECT account_id, nick FROM fp_logs WHERE fp = ? AND account_id != ? ORDER BY id DESC LIMIT 1 OFFSET 1`;
    db.get(query, [fp, account], (err, row) => {
        if (row) res.json({ fpIsLegal: false, fpUsedByNick: row.nick, fpUsedByAccount: row.account_id });
        else res.json({ fpIsLegal: true });
    });
});

app.post('/log', (req, res) => {
    const { fp, nick, char, account, token } = req.body;
    // Blokada również na boczny zapis logów
    if (token !== TAJNE_HASLO_BOTA) return res.status(401).json({ status: "error" });

    const data = new Date().toISOString();
    db.run("INSERT INTO fp_logs (fp, nick, char_id, account_id, data) VALUES (?, ?, ?, ?, ?)", [fp, nick, char, account, data], () => res.json({ status: "ok" }));
});

app.post('/api/wiadomosc', sprawdzLogowanie, (req, res) => {
    const tekst = req.body.wiadomosc.replace(/</g, "&lt;");
    db.run("INSERT INTO wiadomosci (data, tresc) VALUES (?, ?)", [new Date().toISOString(), tekst], () => res.json({ status: "ok" }));
});

app.post('/api/usun', sprawdzLogowanie, (req, res) => db.run("DELETE FROM wiadomosci WHERE id = ?", req.body.id, () => res.json({ status: "ok" })));

app.listen(port, () => console.log(`Serwer na porcie ${port}`));
