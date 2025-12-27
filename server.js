require('dotenv').config();
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors'); // DODANO: Obsługa zapytań z innych stron

const app = express();
const port = process.env.PORT || 9999;
const HASLO = process.env.ADMIN_PASSWORD;

// --- KONFIGURACJA BAZY DANYCH ---
const db = new sqlite3.Database('./baza.db');

// Tworzenie tabel: Wiadomości oraz Logi Fingerprintów
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS wiadomosci (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT,
        tresc TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS fp_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fp TEXT,
        nick TEXT,
        char_id INTEGER,
        account_id INTEGER,
        data TEXT
    )`);
});

// --- MIDDLEWARE ---
app.use(cors()); // Pozwala skryptowi z margonem.pl łączyć się z Twoim serwerem
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

// Pobieranie wiadomości
app.get('/api/lista', sprawdzLogowanie, (req, res) => {
    db.all("SELECT * FROM wiadomosci ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json(rows);
    });
});

// Pobieranie logów fingerprintów dla administratora
app.get('/api/logs', sprawdzLogowanie, (req, res) => {
    // Zapytanie, które przy okazji pobierania logu sprawdza, 
    // czy ten sam FP ma przypisane inne account_id
    const sql = `
        SELECT *, 
        (SELECT COUNT(DISTINCT account_id) FROM fp_logs f2 WHERE f2.fp = fp_logs.fp) as uzytkownikow 
        FROM fp_logs 
        ORDER BY id DESC LIMIT 50
    `;

    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json(rows);
    });
});
// --- API DLA SKRYPTU TAMPERMONKEY (PUBLICZNE) ---

// 1. Sprawdzanie czy FP jest legalny
app.post('/check', (req, res) => {
    const { fp, account } = req.body;

    // Szukamy czy ten FP był używany przez kogoś innego
    db.get("SELECT * FROM fp_logs WHERE fp = ? AND account_id != ? LIMIT 1", [fp, account], (err, row) => {
        if (err) return res.status(500).json({ code: 500, message: "Błąd bazy" });

        if (row) {
            // Znaleziono powiązanie z innym kontem!
            res.json({ 
                fpIsLegal: false, 
                fpUsedByAccount: row.account_id, 
                fpUsedByNick: row.nick 
            });
        } else {
            // Wszystko w porządku
            res.json({ fpIsLegal: true, newlyRegistered: true, knownNick: true });
        }
    });
});

// 2. Logowanie wejścia (Fingerprint + Nick)
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