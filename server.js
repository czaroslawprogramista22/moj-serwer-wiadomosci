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

const db = new sqlite3.Database('./baza.db');

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

app.use(cors());
app.use(morgan('dev'));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const sprawdzLogowanie = (req, res, next) => {
    if (req.cookies.zalogowany === 'true') next();
    else res.redirect('/login');
};

app.get('/login', (req, res) => {
    res.send(`
        <div style="text-align: center; margin-top: 100px; font-family: Arial;">
            <h2>Zaloguj się:</h2>
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

app.get('/', sprawdzLogowanie, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API dla Panelu
app.get('/api/lista', sprawdzLogowanie, (req, res) => {
    db.all("SELECT * FROM wiadomosci ORDER BY id DESC", [], (err, rows) => {
        res.json(rows);
    });
});

app.get('/api/logs', sprawdzLogowanie, (req, res) => {
    db.all("SELECT * FROM fp_logs ORDER BY id DESC LIMIT 50", [], (err, rows) => {
        res.json(rows);
    });
});

// API dla Skryptu
app.post('/check', (req, res) => {
    res.json({ fpIsLegal: true }); // Uproszczona wersja bez blokad
});

app.post('/log', (req, res) => {
    const { fp, nick, char, account } = req.body;
    const data = new Date().toLocaleString();
    db.run("INSERT INTO fp_logs (fp, nick, char_id, account_id, data) VALUES (?, ?, ?, ?, ?)", 
    [fp, nick, char, account, data], () => res.json({ status: "ok" }));
});

// Zarządzanie wiadomościami
app.post('/api/wiadomosc', sprawdzLogowanie, (req, res) => {
    const tekst = req.body.wiadomosc.replace(/</g, "&lt;");
    const data = new Date().toLocaleString();
    db.run("INSERT INTO wiadomosci (data, tresc) VALUES (?, ?)", [data, tekst], () => res.json({ status: "ok" }));
});

app.post('/api/usun', sprawdzLogowanie, (req, res) => {
    db.run("DELETE FROM wiadomosci WHERE id = ?", req.body.id, () => res.json({ status: "ok" }));
});

app.listen(port, () => console.log(`Serwer działa na porcie ${port}`));